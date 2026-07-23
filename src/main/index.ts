import { app, shell, BrowserWindow, ipcMain, dialog, Notification, session, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { readFileSync, writeFileSync, promises as fsPromises } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Store } from './store'
import { PtyManager } from './ptyManager'
import { StatusManager } from './statusManager'
import { HookServer } from './hookServer'
import { GitBranchPoller } from './git'
import { Updater } from './updater'
import { IPC, HOOK_SERVER_PORT } from '../shared/types'
import type {
  CreateTerminalInput,
  CreateWorkspaceInput,
  ExportResult,
  FileEntry,
  ImportCommitInput,
  ImportCommitResult,
  ImportPrepareResult,
  ImportPreviewEntry,
  ListDirResult,
  ReadFileResult,
  RestorableSettings,
  Terminal,
  Workspace
} from '../shared/types'

// E2E tests set this to an isolated temp directory so test runs never read/write the real
// user's persisted workspaces.json. Must run before Store() (below) touches userData.
if (process.env.ITTOP_USER_DATA_DIR) {
  app.setPath('userData', process.env.ITTOP_USER_DATA_DIR)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// ittop's whole point is keeping sessions alive in the background — closing the window (the X
// button, Alt+F4, ...) minimizes to the tray instead of quitting. This flag distinguishes that
// from a real quit (tray menu "Quit", or the app quitting for another reason), so the window's
// own 'close' handler knows whether to hide or actually let the close proceed.
let isQuitting = false

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('ittop')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open ittop',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      {
        label: 'Check for updates',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
          mainWindow?.webContents.send(IPC.openSettingsRequest)
          void updater.checkForUpdates()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

const store = new Store()
const statusManager = new StatusManager()
const ptyManager = new PtyManager(
  statusManager,
  (terminalId, data) => mainWindow?.webContents.send(IPC.ptyData, { id: terminalId, data }),
  (terminalId, exitCode) => mainWindow?.webContents.send(IPC.ptyExit, { id: terminalId, exitCode }),
  () => store.getState().settings.idleDebounceMs
)

function allTerminals(): Terminal[] {
  return store.getState().workspaces.flatMap((w) => w.terminals)
}

function findTerminal(terminalId: string): { workspace: Workspace; terminal: Terminal } | null {
  for (const workspace of store.getState().workspaces) {
    const terminal = workspace.terminals.find((t) => t.id === terminalId)
    if (terminal) return { workspace, terminal }
  }
  return null
}

function samePath(a: string, b: string): boolean {
  return join(a).toLowerCase() === join(b).toLowerCase()
}

const hookServer = new HookServer((payload) => {
  mainWindow?.webContents.send(IPC.hookEventReceived, {
    hookEventName: payload.hookEventName,
    receivedAt: Date.now()
  })

  const terminal = allTerminals().find((t) => samePath(t.projectPath, payload.projectPath))
  if (!terminal) return

  if (payload.hookEventName === 'Notification') {
    statusManager.markWaiting(terminal.id)
    bumpUnread(terminal.id)
    maybeNotify(terminal, payload.message ?? 'Claude is waiting for your input')
  } else if (payload.hookEventName === 'Stop' || payload.hookEventName === 'SubagentStop') {
    statusManager.markIdle(terminal.id)
  }
})
const gitPoller = new GitBranchPoller(
  () => allTerminals().map((t) => ({ id: t.id, path: t.projectPath })),
  (terminalId, branch) => mainWindow?.webContents.send(IPC.gitBranchChanged, { id: terminalId, branch })
)
const updater = new Updater((status) => mainWindow?.webContents.send(IPC.appUpdateStatus, status))

const unreadCounts = new Map<string, number>()

function bumpUnread(terminalId: string): void {
  unreadCounts.set(terminalId, (unreadCounts.get(terminalId) ?? 0) + 1)
  mainWindow?.webContents.send(IPC.statusChanged, {
    id: terminalId,
    status: statusManager.get(terminalId),
    unreadCount: unreadCounts.get(terminalId)
  })
}

function maybeNotify(terminal: Terminal, body: string): void {
  if (!store.getState().settings.notificationsEnabled) return
  if (!Notification.isSupported()) return
  if (mainWindow?.isFocused()) return
  const notification = new Notification({
    title: `${terminal.name} needs your input`,
    body,
    silent: false
  })
  notification.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send(IPC.terminalFocusRequest, terminal.id)
  })
  notification.show()
}

statusManager.onChange((terminalId, status) => {
  mainWindow?.webContents.send(IPC.statusChanged, {
    id: terminalId,
    status,
    unreadCount: unreadCounts.get(terminalId) ?? 0
  })
})

// The origin our own renderer is ever legitimately loaded from — either the Vite dev server or
// the packaged index.html. Anything a window tries to navigate to that isn't this exact prefix
// is untrusted content (e.g. a link clicked inside a previewed Markdown/HTML file) and must not
// be allowed to load in-place, since our preload script re-injects on every navigation and
// exposes a privileged API (spawn shells, read arbitrary files) via contextBridge.
const APP_URL_PREFIX =
  is.dev && process.env['ELECTRON_RENDERER_URL']
    ? process.env['ELECTRON_RENDERER_URL']
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href

function guardNavigation(webContents: Electron.WebContents): void {
  webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(APP_URL_PREFIX)) return
    event.preventDefault()
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
  })
}

function createWindow(): void {
  const bounds = store.getState().settings.windowBounds
  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1400,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    title: 'ittop',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (bounds?.maximized) mainWindow?.maximize()
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[renderer] did-fail-load ${errorCode} ${errorDescription}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] render-process-gone', details)
  })
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('close', (event) => {
    if (!mainWindow) return
    const maximized = mainWindow.isMaximized()
    // getBounds() while maximized returns the maximized size, not the restorable windowed
    // size — save the pre-maximize bounds instead so un-maximizing later isn't full-screen.
    const { x, y, width, height } = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    persistSettings({ windowBounds: { x, y, width, height, maximized } })

    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  guardNavigation(mainWindow.webContents)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createPreviewWindow(filePath: string): void {
  const previewWindow = new BrowserWindow({
    width: 900,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    title: `ittop: ${filePath}`,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  previewWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  guardNavigation(previewWindow.webContents)

  const query = `preview=${encodeURIComponent(filePath)}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    previewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${query}`)
  } else {
    previewWindow.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }
}

function persistSettings(patch: Partial<ReturnType<Store['getState']>['settings']>): void {
  const state = store.getState()
  store.save({ ...state, settings: { ...state.settings, ...patch } })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.workspacesGet, () => {
    const state = store.getState()
    const runtime: Record<string, { status: string; unreadCount: number; ptyStarted: boolean }> = {}
    for (const terminal of allTerminals()) {
      runtime[terminal.id] = {
        status: statusManager.get(terminal.id),
        unreadCount: unreadCounts.get(terminal.id) ?? 0,
        ptyStarted: ptyManager.has(terminal.id)
      }
    }
    return { workspaces: state.workspaces, settings: state.settings, runtime }
  })

  ipcMain.handle(IPC.terminalPickFolder, async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.workspaceCreate, (_event, input: CreateWorkspaceInput) => {
    const state = store.getState()
    const workspace: Workspace = {
      id: uuidv4(),
      name: input.name,
      order: state.workspaces.length,
      terminals: []
    }
    store.save({ ...state, workspaces: [...state.workspaces, workspace] })
    return workspace
  })

  ipcMain.handle(IPC.workspaceRename, (_event, workspaceId: string, name: string) => {
    const state = store.getState()
    const workspaces = state.workspaces.map((w) => (w.id === workspaceId ? { ...w, name } : w))
    store.save({ ...state, workspaces })
  })

  ipcMain.handle(IPC.workspaceReorder, (_event, orderedIds: string[]) => {
    const state = store.getState()
    const byId = new Map(state.workspaces.map((w) => [w.id, w]))
    const workspaces = orderedIds
      .map((id, index) => {
        const w = byId.get(id)
        return w ? { ...w, order: index } : null
      })
      .filter((w): w is Workspace => w !== null)
    store.save({ ...state, workspaces })
  })

  ipcMain.handle(IPC.workspaceDelete, async (_event, workspaceId: string) => {
    const state = store.getState()
    const workspace = state.workspaces.find((w) => w.id === workspaceId)
    if (workspace) {
      await Promise.all(workspace.terminals.map((t) => ptyManager.stop(t.id)))
      for (const t of workspace.terminals) {
        statusManager.remove(t.id)
        unreadCounts.delete(t.id)
        gitPoller.forget(t.id)
      }
    }
    const workspaces = state.workspaces.filter((w) => w.id !== workspaceId)
    const settings = { ...state.settings }
    if (settings.activeWorkspaceId === workspaceId) settings.activeWorkspaceId = null
    store.save({ ...state, workspaces, settings })
  })

  ipcMain.handle(IPC.terminalCreate, (_event, input: CreateTerminalInput) => {
    const state = store.getState()
    const workspace = state.workspaces.find((w) => w.id === input.workspaceId)
    if (!workspace) return null
    const terminal: Terminal = {
      id: uuidv4(),
      name: input.name,
      projectPath: input.projectPath,
      startCommand: input.startCommand?.trim() || state.settings.defaultStartCommand || 'claude',
      order: workspace.terminals.length
    }
    const workspaces = state.workspaces.map((w) =>
      w.id === workspace.id ? { ...w, terminals: [...w.terminals, terminal] } : w
    )
    store.save({ ...state, workspaces })
    return terminal
  })

  ipcMain.handle(IPC.terminalRename, (_event, terminalId: string, name: string) => {
    const state = store.getState()
    const workspaces = state.workspaces.map((w) => ({
      ...w,
      terminals: w.terminals.map((t) => (t.id === terminalId ? { ...t, name } : t))
    }))
    store.save({ ...state, workspaces })
  })

  ipcMain.handle(IPC.terminalReorder, (_event, workspaceId: string, orderedTerminalIds: string[]) => {
    const state = store.getState()
    const workspaces = state.workspaces.map((w) => {
      if (w.id !== workspaceId) return w
      const byId = new Map(w.terminals.map((t) => [t.id, t]))
      const terminals = orderedTerminalIds
        .map((id, index) => {
          const t = byId.get(id)
          return t ? { ...t, order: index } : null
        })
        .filter((t): t is Terminal => t !== null)
      return { ...w, terminals }
    })
    store.save({ ...state, workspaces })
  })

  ipcMain.handle(IPC.terminalDelete, async (_event, terminalId: string) => {
    await ptyManager.stop(terminalId)
    statusManager.remove(terminalId)
    unreadCounts.delete(terminalId)
    gitPoller.forget(terminalId)
    const state = store.getState()
    const workspaces = state.workspaces.map((w) => ({
      ...w,
      terminals: w.terminals.filter((t) => t.id !== terminalId)
    }))
    store.save({ ...state, workspaces })
  })

  ipcMain.handle(IPC.terminalRestart, async (_event, terminalId: string) => {
    await ptyManager.stop(terminalId)
    statusManager.markIdle(terminalId)
  })

  ipcMain.handle(IPC.terminalMarkRead, (_event, terminalId: string) => {
    unreadCounts.set(terminalId, 0)
    mainWindow?.webContents.send(IPC.statusChanged, {
      id: terminalId,
      status: statusManager.get(terminalId),
      unreadCount: 0
    })
  })

  ipcMain.handle(IPC.workspacesExport, async (): Promise<ExportResult> => {
    if (!mainWindow) return { ok: false, reason: 'error', message: 'No window available.' }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export workspaces',
      defaultPath: join(app.getPath('documents'), 'ittop-workspaces.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, reason: 'cancelled' }
    try {
      const state = store.getState()
      // version 3: nested workspaces (each carrying its terminals) plus the restorable
      // preference subset (never window/layout/session state — see RestorableSettings) so a
      // full export/import round-trip can bring those back too, opt-in.
      const payload = {
        version: 3,
        workspaces: state.workspaces,
        settings: {
          theme: state.settings.theme,
          notificationsEnabled: state.settings.notificationsEnabled,
          defaultStartCommand: state.settings.defaultStartCommand,
          idleDebounceMs: state.settings.idleDebounceMs
        } satisfies RestorableSettings
      }
      writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { ok: true, path: result.filePath }
    } catch (err) {
      return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  })

  // Import is a two-step prepare/commit flow so the renderer can show the user exactly what
  // each imported workspace and its terminals will run before anything is added — importing a
  // config someone else wrote otherwise auto-runs their chosen shell commands with no visibility.
  ipcMain.handle(IPC.workspacesImportPrepare, async (): Promise<ImportPrepareResult> => {
    if (!mainWindow) return { ok: false, reason: 'error', message: 'No window available.' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import workspaces',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, reason: 'cancelled' }
    try {
      const raw = JSON.parse(readFileSync(result.filePaths[0], 'utf-8')) as {
        workspaces?: unknown
        settings?: unknown
      }
      if (!Array.isArray(raw.workspaces)) {
        return { ok: false, reason: 'error', message: 'File has no "workspaces" array.' }
      }
      const state = store.getState()
      const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined)
      const defaultCmd = state.settings.defaultStartCommand || 'claude'

      const entries: ImportPreviewEntry[] = raw.workspaces
        .filter((w): w is Record<string, unknown> => typeof w === 'object' && w !== null)
        .map((w) => {
          const name = asString(w.name) || 'Imported workspace'
          // Pre-2.0 export format: the workspace itself carried one projectPath/startCommand.
          if (Array.isArray(w.terminals)) {
            const terminals = (w.terminals as unknown[])
              .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
              .map((t) => asString(t.projectPath) && { t, path: asString(t.projectPath) as string })
              .filter((x): x is { t: Record<string, unknown>; path: string } => !!x)
              .map(({ t, path }) => ({
                name: asString(t.name) || 'Terminal',
                projectPath: path,
                startCommand: asString(t.startCommand) || defaultCmd
              }))
            return terminals.length > 0 ? { name, terminals } : null
          }
          const projectPath = asString(w.projectPath)
          if (!projectPath) return null
          return {
            name,
            terminals: [{ name, projectPath, startCommand: asString(w.startCommand) || defaultCmd }]
          }
        })
        .filter((e): e is ImportPreviewEntry => e !== null)

      if (entries.length === 0) {
        return { ok: false, reason: 'error', message: 'No valid workspace entries found in file.' }
      }

      let settings: RestorableSettings | null = null
      if (typeof raw.settings === 'object' && raw.settings !== null) {
        const s = raw.settings as Record<string, unknown>
        const theme = s.theme
        if (
          (theme === 'dark' ||
            theme === 'light' ||
            theme === 'dracula' ||
            theme === 'nord' ||
            theme === 'solarized') &&
          typeof s.notificationsEnabled === 'boolean' &&
          typeof s.defaultStartCommand === 'string' &&
          typeof s.idleDebounceMs === 'number'
        ) {
          settings = {
            theme,
            notificationsEnabled: s.notificationsEnabled,
            defaultStartCommand: s.defaultStartCommand,
            idleDebounceMs: s.idleDebounceMs
          }
        }
      }

      return { ok: true, entries, settings }
    } catch (err) {
      return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.workspacesImportCommit, (_event, input: ImportCommitInput): ImportCommitResult => {
    try {
      const state = store.getState()
      const imported: Workspace[] = input.entries.map((entry, i) => ({
        id: uuidv4(),
        name: entry.name,
        order: state.workspaces.length + i,
        terminals: entry.terminals.map((t, ti) => ({
          id: uuidv4(),
          name: t.name,
          projectPath: t.projectPath,
          startCommand: t.startCommand,
          order: ti
        }))
      }))
      const settings = input.settings ? { ...state.settings, ...input.settings } : state.settings
      store.save({ ...state, workspaces: [...state.workspaces, ...imported], settings })
      return { ok: true, count: imported.length }
    } catch (err) {
      return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  })

  const FILE_PREVIEW_MAX_BYTES = 512 * 1024

  ipcMain.handle(IPC.fsListDir, async (_event, dirPath: string): Promise<ListDirResult> => {
    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
      const mapped: FileEntry[] = entries.map((entry) => ({
        name: entry.name,
        path: join(dirPath, entry.name),
        isDirectory: entry.isDirectory()
      }))
      mapped.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return { ok: true, entries: mapped }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.fsReadFile, async (_event, filePath: string): Promise<ReadFileResult> => {
    let handle: Awaited<ReturnType<typeof fsPromises.open>> | null = null
    try {
      const stat = await fsPromises.stat(filePath)
      handle = await fsPromises.open(filePath, 'r')
      const readLength = Math.min(stat.size, FILE_PREVIEW_MAX_BYTES)
      const buffer = Buffer.alloc(readLength)
      await handle.read(buffer, 0, readLength, 0)
      // A NUL byte anywhere in a reasonable-sized sample is a reliable enough signal that this
      // is a binary file (image, archive, compiled binary, ...) not meant to be shown as text.
      if (buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0)) {
        return { ok: false, reason: 'binary' }
      }
      return { ok: true, content: buffer.toString('utf-8'), truncated: stat.size > FILE_PREVIEW_MAX_BYTES }
    } catch (err) {
      return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      await handle?.close()
    }
  })

  ipcMain.handle(IPC.settingsGet, () => store.getState().settings)

  ipcMain.handle(IPC.settingsUpdate, (_event, patch: Record<string, unknown>) => {
    persistSettings(patch)
  })

  ipcMain.handle(IPC.ptyStart, (_event, terminalId: string, cols: number, rows: number) => {
    const found = findTerminal(terminalId)
    if (!found) return
    ptyManager.start(terminalId, found.terminal.projectPath, found.terminal.startCommand, cols, rows)
    unreadCounts.set(terminalId, 0)
  })

  ipcMain.on(IPC.ptyInput, (_event, terminalId: string, data: string) => {
    ptyManager.write(terminalId, data)
  })

  ipcMain.on(IPC.ptyResize, (_event, terminalId: string, cols: number, rows: number) => {
    ptyManager.resize(terminalId, cols, rows)
  })

  ipcMain.handle(IPC.hookServerInfo, () => ({ port: HOOK_SERVER_PORT }))

  ipcMain.handle(IPC.previewOpen, (_event, filePath: string) => {
    createPreviewWindow(filePath)
  })

  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC.appCheckForUpdates, () => updater.checkForUpdates())
  ipcMain.handle(IPC.appInstallUpdate, () => updater.installUpdate())
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ittop.app')

  // Third-party dictation tools (Wispr Flow, Spokenly, Windows Voice Access, ...) typically
  // inject recognized text via the OS accessibility tree rather than simulated keystrokes.
  // Chromium/Electron only builds that tree lazily once an AT client is detected; forcing it
  // on lets those tools see and target the terminal's focused input element.
  app.setAccessibilitySupportEnabled(true)

  // Only enforce a strict CSP in production: electron-vite's dev server injects inline
  // scripts for HMR/React-refresh that a strict script-src would otherwise block.
  if (!is.dev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"]
        }
      })
    })
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  hookServer.start()
  gitPoller.start()
  createWindow()
  createTray()

  // Silent background check a few seconds after launch — errors/no-update states are only
  // surfaced when the user opens Settings themselves, this just gets the "update available"
  // notice in front of them without requiring a manual click every time.
  setTimeout(() => void updater.checkForUpdates(), 5000)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitting = false
app.on('before-quit', async (event) => {
  isQuitting = true
  if (quitting) return
  event.preventDefault()
  quitting = true
  gitPoller.stop()
  hookServer.stop()
  await ptyManager.stopAll()
  app.quit()
})

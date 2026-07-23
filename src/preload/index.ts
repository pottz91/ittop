import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  AppSettings,
  CreateTerminalInput,
  CreateWorkspaceInput,
  ExportResult,
  ImportCommitInput,
  ImportCommitResult,
  ImportPrepareResult,
  ListDirResult,
  ReadFileResult,
  Terminal,
  TerminalRuntimeState,
  UpdateStatus,
  Workspace
} from '../shared/types'

export interface WorkspacesGetResult {
  workspaces: Workspace[]
  settings: AppSettings
  runtime: Record<string, TerminalRuntimeState>
}

const api = {
  getWorkspaces: (): Promise<WorkspacesGetResult> => ipcRenderer.invoke(IPC.workspacesGet),
  createWorkspace: (input: CreateWorkspaceInput): Promise<Workspace> =>
    ipcRenderer.invoke(IPC.workspaceCreate, input),
  renameWorkspace: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke(IPC.workspaceRename, id, name),
  deleteWorkspace: (id: string): Promise<void> => ipcRenderer.invoke(IPC.workspaceDelete, id),
  reorderWorkspaces: (orderedIds: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.workspaceReorder, orderedIds),
  exportWorkspaces: (): Promise<ExportResult> => ipcRenderer.invoke(IPC.workspacesExport),
  prepareImportWorkspaces: (): Promise<ImportPrepareResult> => ipcRenderer.invoke(IPC.workspacesImportPrepare),
  commitImportWorkspaces: (input: ImportCommitInput): Promise<ImportCommitResult> =>
    ipcRenderer.invoke(IPC.workspacesImportCommit, input),

  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.terminalPickFolder),
  createTerminal: (input: CreateTerminalInput): Promise<Terminal | null> =>
    ipcRenderer.invoke(IPC.terminalCreate, input),
  renameTerminal: (id: string, name: string): Promise<void> => ipcRenderer.invoke(IPC.terminalRename, id, name),
  deleteTerminal: (id: string): Promise<void> => ipcRenderer.invoke(IPC.terminalDelete, id),
  reorderTerminals: (workspaceId: string, orderedIds: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC.terminalReorder, workspaceId, orderedIds),
  restartTerminal: (id: string): Promise<void> => ipcRenderer.invoke(IPC.terminalRestart, id),
  markTerminalRead: (id: string): Promise<void> => ipcRenderer.invoke(IPC.terminalMarkRead, id),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC.settingsUpdate, patch),

  getHookServerInfo: (): Promise<{ port: number }> => ipcRenderer.invoke(IPC.hookServerInfo),

  listDir: (path: string): Promise<ListDirResult> => ipcRenderer.invoke(IPC.fsListDir, path),
  readFile: (path: string): Promise<ReadFileResult> => ipcRenderer.invoke(IPC.fsReadFile, path),
  openFilePreviewWindow: (path: string): Promise<void> => ipcRenderer.invoke(IPC.previewOpen, path),

  ptyStart: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke(IPC.ptyStart, id, cols, rows),
  ptyInput: (id: string, data: string): void => ipcRenderer.send(IPC.ptyInput, id, data),
  ptyResize: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.ptyResize, id, cols, rows),

  onPtyData: (callback: (id: string, data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }): void =>
      callback(payload.id, payload.data)
    ipcRenderer.on(IPC.ptyData, listener)
    return () => ipcRenderer.removeListener(IPC.ptyData, listener)
  },
  onPtyExit: (callback: (id: string, exitCode: number) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; exitCode: number }
    ): void => callback(payload.id, payload.exitCode)
    ipcRenderer.on(IPC.ptyExit, listener)
    return () => ipcRenderer.removeListener(IPC.ptyExit, listener)
  },
  onStatusChanged: (
    callback: (id: string, status: string, unreadCount: number) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; status: string; unreadCount: number }
    ): void => callback(payload.id, payload.status, payload.unreadCount)
    ipcRenderer.on(IPC.statusChanged, listener)
    return () => ipcRenderer.removeListener(IPC.statusChanged, listener)
  },
  onGitBranchChanged: (callback: (id: string, branch: string | null) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; branch: string | null }
    ): void => callback(payload.id, payload.branch)
    ipcRenderer.on(IPC.gitBranchChanged, listener)
    return () => ipcRenderer.removeListener(IPC.gitBranchChanged, listener)
  },
  onTerminalFocusRequest: (callback: (id: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string): void => callback(id)
    ipcRenderer.on(IPC.terminalFocusRequest, listener)
    return () => ipcRenderer.removeListener(IPC.terminalFocusRequest, listener)
  },
  onOpenSettingsRequest: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(IPC.openSettingsRequest, listener)
    return () => ipcRenderer.removeListener(IPC.openSettingsRequest, listener)
  },
  onHookEvent: (callback: (hookEventName: string, receivedAt: number) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { hookEventName: string; receivedAt: number }
    ): void => callback(payload.hookEventName, payload.receivedAt)
    ipcRenderer.on(IPC.hookEventReceived, listener)
    return () => ipcRenderer.removeListener(IPC.hookEventReceived, listener)
  },

  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC.appCheckForUpdates),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.appInstallUpdate),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => callback(status)
    ipcRenderer.on(IPC.appUpdateStatus, listener)
    return () => ipcRenderer.removeListener(IPC.appUpdateStatus, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

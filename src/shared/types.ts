export type TerminalStatus = 'idle' | 'working' | 'waiting'

export interface Terminal {
  id: string
  name: string
  projectPath: string
  startCommand: string
  order: number
}

export interface Workspace {
  id: string
  name: string
  order: number
  terminals: Terminal[]
}

export interface TerminalRuntimeState {
  status: TerminalStatus
  unreadCount: number
  ptyStarted: boolean
}

export type AppTheme = 'dark' | 'light' | 'dracula' | 'nord' | 'solarized'

export interface AppSettings {
  windowBounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean }
  sidebarWidth: number
  sidebarCollapsed: boolean
  filePanelWidth: number
  activeWorkspaceId: string | null
  theme: AppTheme
  notificationsEnabled: boolean
  defaultStartCommand: string
  idleDebounceMs: number
  paneColFractions: number[]
}

/** The subset of AppSettings worth offering to restore from someone else's export — pure
 * preferences, never window/layout/session state (bounds, active workspace, pane layout). */
export interface RestorableSettings {
  theme: AppTheme
  notificationsEnabled: boolean
  defaultStartCommand: string
  idleDebounceMs: number
}

export interface PersistedState {
  workspaces: Workspace[]
  settings: AppSettings
}

export interface CreateWorkspaceInput {
  name: string
}

export interface CreateTerminalInput {
  workspaceId: string
  name: string
  projectPath: string
  startCommand?: string
}

export interface HookEventPayload {
  hookEventName: 'Notification' | 'Stop' | 'SubagentStop' | string
  projectPath: string
  message?: string
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export type ListDirResult =
  | { ok: true; entries: FileEntry[] }
  | { ok: false; message: string }

export type ReadFileResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; reason: 'binary' | 'error'; message?: string }

export const HOOK_SERVER_PORT = 47823

export const IPC = {
  workspacesGet: 'workspaces:get',
  workspaceCreate: 'workspace:create',
  workspaceRename: 'workspace:rename',
  workspaceDelete: 'workspace:delete',
  workspaceReorder: 'workspace:reorder',
  workspacesExport: 'workspaces:export',
  workspacesImportPrepare: 'workspaces:importPrepare',
  workspacesImportCommit: 'workspaces:importCommit',

  terminalCreate: 'terminal:create',
  terminalRename: 'terminal:rename',
  terminalDelete: 'terminal:delete',
  terminalReorder: 'terminal:reorder',
  terminalRestart: 'terminal:restart',
  terminalPickFolder: 'terminal:pickFolder',
  terminalMarkRead: 'terminal:markRead',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  fsListDir: 'fs:listDir',
  fsReadFile: 'fs:readFile',
  previewOpen: 'preview:open',

  ptyStart: 'pty:start',
  ptyInput: 'pty:input',
  ptyResize: 'pty:resize',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',

  statusChanged: 'status:changed',
  gitBranchChanged: 'git:branchChanged',

  hookServerInfo: 'hooks:getServerInfo',
  hookEventReceived: 'hooks:eventReceived',
  terminalFocusRequest: 'terminal:focusRequest',
  openSettingsRequest: 'app:openSettingsRequest',

  showNotification: 'notification:show',

  appGetVersion: 'app:getVersion',
  appCheckForUpdates: 'app:checkForUpdates',
  appInstallUpdate: 'app:installUpdate',
  appUpdateStatus: 'app:updateStatus'
} as const

export interface ImportPreviewEntry {
  name: string
  terminals: Array<{ name: string; projectPath: string; startCommand: string }>
}

export type ExportResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'error'; message: string }

export type ImportPrepareResult =
  | { ok: true; entries: ImportPreviewEntry[]; settings: RestorableSettings | null }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'error'; message: string }

export type ImportCommitResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'error'; message: string }

export interface ImportCommitInput {
  entries: ImportPreviewEntry[]
  settings: RestorableSettings | null
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'unsupported'; message: string }

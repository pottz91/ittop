import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { PersistedState, Terminal, Workspace } from '../shared/types'

const FILE_NAME = 'workspaces.json'

function defaultState(): PersistedState {
  return {
    workspaces: [],
    settings: {
      sidebarWidth: 280,
      sidebarCollapsed: false,
      filePanelWidth: 340,
      activeWorkspaceId: null,
      theme: 'dark',
      notificationsEnabled: true,
      defaultStartCommand: 'claude',
      idleDebounceMs: 1200,
      paneColFractions: []
    }
  }
}

// Pre-2.0 files stored one terminal directly on the workspace (projectPath/startCommand).
// Lift that into a single child terminal so every existing workspace keeps working exactly
// as before, just now expressed in the nested shape.
interface LegacyWorkspace {
  id: string
  name: string
  order: number
  projectPath?: string
  startCommand?: string
  terminals?: Terminal[]
}

function migrateWorkspace(raw: LegacyWorkspace): Workspace {
  if (Array.isArray(raw.terminals)) {
    return { id: raw.id, name: raw.name, order: raw.order, terminals: raw.terminals }
  }
  const terminals: Terminal[] =
    typeof raw.projectPath === 'string'
      ? [
          {
            id: randomUUID(),
            name: raw.name,
            projectPath: raw.projectPath,
            startCommand: raw.startCommand ?? 'claude',
            order: 0
          }
        ]
      : []
  return { id: raw.id, name: raw.name, order: raw.order, terminals }
}

export class Store {
  private filePath: string
  private state: PersistedState

  constructor() {
    this.filePath = join(app.getPath('userData'), FILE_NAME)
    this.state = this.load()
  }

  private load(): PersistedState {
    if (!existsSync(this.filePath)) return defaultState()
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PersistedState> & { workspaces?: LegacyWorkspace[] }
      return {
        workspaces: (parsed.workspaces ?? []).map(migrateWorkspace),
        settings: { ...defaultState().settings, ...parsed.settings }
      }
    } catch {
      return defaultState()
    }
  }

  getState(): PersistedState {
    return this.state
  }

  save(next: PersistedState): void {
    this.state = next
    const tmpPath = `${this.filePath}.tmp`
    writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf-8')
    renameSync(tmpPath, this.filePath)
  }
}

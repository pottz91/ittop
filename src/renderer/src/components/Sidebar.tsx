import { useMemo, useRef, useState } from 'react'
import type { Terminal, TerminalStatus, Workspace } from '../../../shared/types'
import { useAppStore } from '../store/useAppStore'
import { useNow } from '../hooks/useNow'
import { formatRelativeTime } from '../lib/time'
import SettingsModal from './SettingsModal'

interface Props {
  onNewWorkspace: () => void
  onNewTerminal: (workspaceId: string) => void
}

function statusClass(status: TerminalStatus): string {
  switch (status) {
    case 'working':
      return 'status-dot status-working'
    case 'waiting':
      return 'status-dot status-waiting'
    default:
      return 'status-dot status-idle'
  }
}

function aggregateStatus(statuses: TerminalStatus[]): TerminalStatus {
  if (statuses.includes('waiting')) return 'waiting'
  if (statuses.includes('working')) return 'working'
  return 'idle'
}

function shortenPath(path: string): string {
  if (path.length <= 42) return path
  return `…${path.slice(-40)}`
}

function matches(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => (f ?? '').toLowerCase().includes(q))
}

type SidebarTab = 'activity' | 'workspaces'

export default function Sidebar({ onNewWorkspace, onNewTerminal }: Props): React.JSX.Element {
  const workspaces = useAppStore((s) => s.workspaces)
  const runtime = useAppStore((s) => s.runtime)
  const gitBranches = useAppStore((s) => s.gitBranches)
  const settings = useAppStore((s) => s.settings)
  const sidebarWidth = settings.sidebarWidth
  const collapsed = settings.sidebarCollapsed
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const focusTerminal = useAppStore((s) => s.focusTerminal)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed)
  const renameWorkspace = useAppStore((s) => s.renameWorkspace)
  const removeWorkspace = useAppStore((s) => s.removeWorkspace)
  const reorderWorkspaces = useAppStore((s) => s.reorderWorkspaces)
  const renameTerminal = useAppStore((s) => s.renameTerminal)
  const removeTerminal = useAppStore((s) => s.removeTerminal)
  const previews = useAppStore((s) => s.previews)
  const previewUpdatedAt = useAppStore((s) => s.previewUpdatedAt)

  const [activeTab, setActiveTab] = useState<SidebarTab>('activity')
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [editingTerminal, setEditingTerminal] = useState<{ workspaceId: string; terminalId: string } | null>(null)
  const [draftTerminalName, setDraftTerminalName] = useState('')
  const [confirmDeleteWorkspace, setConfirmDeleteWorkspace] = useState<Workspace | null>(null)
  const [confirmDeleteTerminal, setConfirmDeleteTerminal] = useState<{ workspaceId: string; terminal: Terminal } | null>(
    null
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('ittop.collapsedWorkspaces')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })
  const settingsOpen = useAppStore((s) => s.settingsModalOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsModalOpen)
  const dragIdRef = useRef<string | null>(null)
  const resizingRef = useRef(false)
  const now = useNow(30_000)

  function toggleWorkspaceCollapsed(id: string): void {
    setCollapsedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem('ittop.collapsedWorkspaces', JSON.stringify([...next]))
      } catch {
        // localStorage unavailable — collapse state just won't persist across restarts
      }
      return next
    })
  }

  function startRename(workspace: Workspace): void {
    setEditingWorkspaceId(workspace.id)
    setDraftName(workspace.name)
  }

  function commitRename(id: string): void {
    const name = draftName.trim()
    if (name.length > 0) renameWorkspace(id, name)
    void window.api.renameWorkspace(id, name || draftName)
    setEditingWorkspaceId(null)
  }

  function startTerminalRename(workspaceId: string, terminal: Terminal): void {
    setEditingTerminal({ workspaceId, terminalId: terminal.id })
    setDraftTerminalName(terminal.name)
  }

  function commitTerminalRename(workspaceId: string, terminalId: string): void {
    const name = draftTerminalName.trim()
    if (name.length > 0) renameTerminal(workspaceId, terminalId, name)
    setEditingTerminal(null)
  }

  async function confirmAndDeleteWorkspace(): Promise<void> {
    if (!confirmDeleteWorkspace) return
    const workspace = confirmDeleteWorkspace
    setConfirmDeleteWorkspace(null)
    removeWorkspace(workspace.id)
    await window.api.deleteWorkspace(workspace.id)
  }

  function handleDragStart(id: string): void {
    dragIdRef.current = id
  }

  function handleDrop(targetId: string): void {
    const sourceId = dragIdRef.current
    dragIdRef.current = null
    if (!sourceId || sourceId === targetId) return
    const ids = workspaces.map((w) => w.id)
    const sourceIndex = ids.indexOf(sourceId)
    const targetIndex = ids.indexOf(targetId)
    ids.splice(sourceIndex, 1)
    ids.splice(targetIndex, 0, sourceId)
    reorderWorkspaces(ids)
  }

  function startResize(e: React.MouseEvent): void {
    e.preventDefault()
    resizingRef.current = true
    const onMove = (moveEvent: MouseEvent): void => {
      if (!resizingRef.current) return
      const width = Math.min(Math.max(moveEvent.clientX, 200), 480)
      setSidebarWidth(width)
    }
    const onUp = (): void => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function workspaceStatus(workspace: Workspace): TerminalStatus {
    return aggregateStatus(workspace.terminals.map((t) => runtime[t.id]?.status ?? 'idle'))
  }

  function workspaceUnreadCount(workspace: Workspace): number {
    return workspace.terminals.reduce((sum, t) => sum + (runtime[t.id]?.unreadCount ?? 0), 0)
  }

  const activityList = useMemo(
    () =>
      workspaces.filter((w) =>
        matches(
          searchQuery,
          w.name,
          ...w.terminals.flatMap((t) => [t.name, t.projectPath, previews[t.id]])
        )
      ),
    [workspaces, searchQuery, previews]
  )

  const workspacesList = useMemo(
    () =>
      workspaces.filter((w) =>
        matches(searchQuery, w.name, ...w.terminals.flatMap((t) => [t.name, t.projectPath]))
      ),
    [workspaces, searchQuery]
  )

  if (collapsed) {
    return (
      <div className="sidebar collapsed">
        <button className="icon-button" title="Expand sidebar" onClick={toggleSidebarCollapsed}>
          »
        </button>
        <div className="workspace-list collapsed-list">
          {workspaces.map((workspace, index) => {
            const status = workspaceStatus(workspace)
            const isActive = settings.activeWorkspaceId === workspace.id
            const unread = workspaceUnreadCount(workspace)
            return (
              <button
                key={workspace.id}
                className={`collapsed-item${isActive ? ' active' : ''}`}
                title={workspace.name}
                onClick={() => openWorkspace(workspace.id)}
              >
                <span className={statusClass(status)} />
                {index < 9 && <span className="collapsed-index">{index + 1}</span>}
                {unread > 0 && <span className="unread-dot" />}
              </button>
            )
          })}
        </div>
        <button className="icon-button" title="New workspace (Ctrl+N)" onClick={onNewWorkspace}>
          +
        </button>
      </div>
    )
  }

  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab${activeTab === 'activity' ? ' active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Activity
          </button>
          <button
            className={`sidebar-tab${activeTab === 'workspaces' ? ' active' : ''}`}
            onClick={() => setActiveTab('workspaces')}
          >
            Workspaces
          </button>
        </div>
        <div className="sidebar-header-actions">
          <button className="icon-button" title="Settings" onClick={() => setSettingsOpen(true)}>
            ⚙
          </button>
          <button className="icon-button" title="Collapse sidebar" onClick={toggleSidebarCollapsed}>
            «
          </button>
          <button className="icon-button" title="New workspace (Ctrl+N)" onClick={onNewWorkspace}>
            +
          </button>
        </div>
      </div>
      {workspaces.length > 4 && (
        <div className="sidebar-search">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter workspaces…"
          />
        </div>
      )}
      {activeTab === 'activity' && (
        <div className="workspace-list">
          {activityList.map((workspace) => {
            const index = workspaces.indexOf(workspace)
            const status = workspaceStatus(workspace)
            const isActive = settings.activeWorkspaceId === workspace.id
            const unread = workspaceUnreadCount(workspace)
            const latestTerminal = workspace.terminals.reduce<Terminal | null>((latest, t) => {
              if (!latest) return t
              return (previewUpdatedAt[t.id] ?? 0) > (previewUpdatedAt[latest.id] ?? 0) ? t : latest
            }, null)
            const preview = latestTerminal ? previews[latestTerminal.id] : undefined
            const updatedAt = latestTerminal ? previewUpdatedAt[latestTerminal.id] : undefined
            return (
              <div
                key={workspace.id}
                className={`workspace-item activity-item${isActive ? ' active' : ''}`}
                onClick={() => openWorkspace(workspace.id)}
                title={workspace.name}
              >
                <span className={statusClass(status)} />
                <div className="workspace-info">
                  <div className="workspace-name">
                    {index < 9 && <span className="shortcut-hint">{index + 1}</span>}
                    {workspace.name}
                    {updatedAt && <span className="activity-time">{formatRelativeTime(updatedAt, now)}</span>}
                  </div>
                  <div className="activity-preview">{preview || 'No output yet.'}</div>
                </div>
                {unread > 0 && <span className="unread-badge">{unread}</span>}
              </div>
            )
          })}
          {workspaces.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-mark">&gt;_</div>
              <p>No workspaces yet.</p>
              <p className="empty-state-sub">Click + above to create your first workspace.</p>
            </div>
          )}
          {workspaces.length > 0 && activityList.length === 0 && (
            <div className="empty-state">No workspaces match &quot;{searchQuery}&quot;.</div>
          )}
        </div>
      )}
      {activeTab === 'workspaces' && (
        <div className="workspace-list">
          {workspacesList.map((workspace) => {
            const index = workspaces.indexOf(workspace)
            const status = workspaceStatus(workspace)
            const isActive = settings.activeWorkspaceId === workspace.id
            const unread = workspaceUnreadCount(workspace)
            const isCollapsed = collapsedWorkspaces.has(workspace.id)
            const terminals = [...workspace.terminals].sort((a, b) => a.order - b.order)
            return (
              <div key={workspace.id} className="workspace-group">
                <div
                  className={`workspace-item${isActive ? ' active' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(workspace.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(workspace.id)}
                  onClick={() => openWorkspace(workspace.id)}
                  title={workspace.name}
                >
                  <button
                    className={`group-chevron-button${isCollapsed ? ' collapsed' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleWorkspaceCollapsed(workspace.id)
                    }}
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    ▾
                  </button>
                  <span className={statusClass(status)} />
                  <div className="workspace-info">
                    {editingWorkspaceId === workspace.id ? (
                      <input
                        autoFocus
                        className="rename-input"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => commitRename(workspace.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(workspace.id)
                          if (e.key === 'Escape') setEditingWorkspaceId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        className="workspace-name"
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          startRename(workspace)
                        }}
                      >
                        {index < 9 && <span className="shortcut-hint">{index + 1}</span>}
                        {workspace.name}
                        <span className="group-count">{workspace.terminals.length}</span>
                      </div>
                    )}
                  </div>
                  {unread > 0 && <span className="unread-badge">{unread}</span>}
                  <div className="workspace-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-button small"
                      title="Add terminal"
                      onClick={() => onNewTerminal(workspace.id)}
                    >
                      +
                    </button>
                    <button
                      className="icon-button small"
                      title="Delete workspace"
                      onClick={() => setConfirmDeleteWorkspace(workspace)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {!isCollapsed &&
                  terminals.map((terminal) => {
                    const rt = runtime[terminal.id]
                    const branch = gitBranches[terminal.id]
                    return (
                      <div
                        key={terminal.id}
                        className="terminal-item"
                        onClick={() => focusTerminal(terminal.id)}
                        title={terminal.projectPath}
                      >
                        <span className={statusClass(rt?.status ?? 'idle')} />
                        <div className="workspace-info">
                          {editingTerminal?.terminalId === terminal.id ? (
                            <input
                              autoFocus
                              className="rename-input"
                              value={draftTerminalName}
                              onChange={(e) => setDraftTerminalName(e.target.value)}
                              onBlur={() => commitTerminalRename(workspace.id, terminal.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitTerminalRename(workspace.id, terminal.id)
                                if (e.key === 'Escape') setEditingTerminal(null)
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div
                              className="workspace-name"
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                startTerminalRename(workspace.id, terminal)
                              }}
                            >
                              {terminal.name}
                            </div>
                          )}
                          <div className="workspace-meta">
                            <span className="workspace-path">{shortenPath(terminal.projectPath)}</span>
                            {branch && <span className="workspace-branch">⎇ {branch}</span>}
                          </div>
                        </div>
                        {(rt?.unreadCount ?? 0) > 0 && <span className="unread-badge">{rt.unreadCount}</span>}
                        <div className="workspace-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-button small"
                            title="Delete terminal"
                            onClick={() => setConfirmDeleteTerminal({ workspaceId: workspace.id, terminal })}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                {!isCollapsed && (
                  <button className="terminal-add-row" onClick={() => onNewTerminal(workspace.id)}>
                    + Add terminal
                  </button>
                )}
              </div>
            )
          })}
          {workspaces.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-mark">&gt;_</div>
              <p>No workspaces yet.</p>
              <p className="empty-state-sub">Click + above to create your first workspace.</p>
            </div>
          )}
          {workspaces.length > 0 && workspacesList.length === 0 && (
            <div className="empty-state">No workspaces match &quot;{searchQuery}&quot;.</div>
          )}
        </div>
      )}
      <div className="sidebar-resizer" onMouseDown={startResize} />
      {confirmDeleteWorkspace && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteWorkspace(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete workspace?</h2>
            <p>
              This stops all {confirmDeleteWorkspace.terminals.length} running session
              {confirmDeleteWorkspace.terminals.length === 1 ? '' : 's'} in{' '}
              <strong>{confirmDeleteWorkspace.name}</strong> and removes it from ittop. The project files on disk
              are untouched.
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDeleteWorkspace(null)}>Cancel</button>
              <button className="danger" onClick={() => void confirmAndDeleteWorkspace()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteTerminal && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteTerminal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete terminal?</h2>
            <p>
              This stops the running session for <strong>{confirmDeleteTerminal.terminal.name}</strong>. The
              project files on disk are untouched.
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDeleteTerminal(null)}>Cancel</button>
              <button
                className="danger"
                onClick={() => {
                  removeTerminal(confirmDeleteTerminal.workspaceId, confirmDeleteTerminal.terminal.id)
                  setConfirmDeleteTerminal(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

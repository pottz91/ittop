import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import TerminalPane from './components/TerminalPane'
import WorkspaceDialog from './components/WorkspaceDialog'
import TerminalDialog from './components/TerminalDialog'
import ShortcutsOverlay from './components/ShortcutsOverlay'
import CommandPalette from './components/CommandPalette'
import FileExplorer from './components/FileExplorer'
import { useAppStore } from './store/useAppStore'

export default function App(): React.JSX.Element {
  const loaded = useAppStore((s) => s.loaded)
  const workspaces = useAppStore((s) => s.workspaces)
  const settings = useAppStore((s) => s.settings)
  const openedWorkspaceIds = useAppStore((s) => s.openedWorkspaceIds)
  const focusedTerminalId = useAppStore((s) => s.focusedTerminalId)
  const load = useAppStore((s) => s.load)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const reorderTerminals = useAppStore((s) => s.reorderTerminals)
  const setStatus = useAppStore((s) => s.setStatus)
  const setGitBranch = useAppStore((s) => s.setGitBranch)
  const markHookEventReceived = useAppStore((s) => s.markHookEventReceived)
  const focusTerminal = useAppStore((s) => s.focusTerminal)
  const updateAppSettings = useAppStore((s) => s.updateAppSettings)
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen)
  const dragPaneIdRef = useRef<string | null>(null)
  const panesRef = useRef<HTMLDivElement>(null)
  const columnCellRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [terminalDialogWorkspaceId, setTerminalDialogWorkspaceId] = useState<string | null>(null)
  const [filesOpen, setFilesOpen] = useState(false)
  const [showRestorePrompt, setShowRestorePrompt] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: string; terminalId: string; name: string }>>([])
  const [colFractions, setColFractions] = useState<number[]>([1])
  const [dividerLefts, setDividerLefts] = useState<number[]>([])
  const colFractionsRef = useRef(colFractions)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    const active = workspaces.find((w) => w.id === settings.activeWorkspaceId)
    document.title = active ? `${active.name}: ittop` : 'ittop'
  }, [workspaces, settings.activeWorkspaceId])

  useEffect(() => {
    if (!loaded) return
    if (workspaces.length > 0 && settings.activeWorkspaceId) {
      setShowRestorePrompt(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    const unsubStatus = window.api.onStatusChanged((id, status, unreadCount) => {
      const previousStatus = useAppStore.getState().runtime[id]?.status
      setStatus(id, status as 'idle' | 'working' | 'waiting', unreadCount)
      // The OS notification (main process) only fires while unfocused; mirror it in-app for
      // the case where you're focused on the app but looking at a different pane.
      if (status === 'waiting' && previousStatus !== 'waiting' && document.hasFocus()) {
        const state = useAppStore.getState()
        const terminal = state.workspaces.flatMap((w) => w.terminals).find((t) => t.id === id)
        const name = terminal?.name ?? id
        const toastId = `${id}-${Date.now()}`
        setToasts((prev) => [...prev, { id: toastId, terminalId: id, name }])
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 6000)
      }
    })
    const unsubBranch = window.api.onGitBranchChanged((id, branch) => setGitBranch(id, branch))
    const unsubFocus = window.api.onTerminalFocusRequest((id) => focusTerminal(id))
    const unsubHook = window.api.onHookEvent((_name, receivedAt) => markHookEventReceived(receivedAt))
    const unsubSettings = window.api.onOpenSettingsRequest(() => setSettingsModalOpen(true))
    return () => {
      unsubStatus()
      unsubBranch()
      unsubFocus()
      unsubHook()
      unsubSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey) {
        if (event.key >= '1' && event.key <= '9') {
          const index = Number(event.key) - 1
          const target = workspaces[index]
          if (target) {
            event.preventDefault()
            openWorkspace(target.id)
          }
          return
        }
        if (event.key.toLowerCase() === 'n') {
          event.preventDefault()
          setDialogOpen(true)
          return
        }
        // Ctrl+K is a common terminal readline shortcut (delete-to-end-of-line); only steal it
        // for the command palette when focus isn't inside a terminal or text field.
        if (event.key.toLowerCase() === 'k' && !isTypingTarget(event.target)) {
          event.preventDefault()
          setPaletteOpen((open) => !open)
        }
        return
      }

      if (event.key === '?' && !isTypingTarget(event.target)) {
        event.preventDefault()
        setShortcutsOpen((open) => !open)
        return
      }
      if (event.key === 'Escape') {
        setShortcutsOpen(false)
        return
      }
      // Quick workspace switching with the arrow keys — but never while a terminal or text
      // field has focus, since shells rely on Up/Down for command history.
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !isTypingTarget(event.target)) {
        if (workspaces.length === 0) return
        event.preventDefault()
        const currentIndex = workspaces.findIndex((w) => w.id === settings.activeWorkspaceId)
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const nextIndex = (currentIndex + delta + workspaces.length) % workspaces.length
        openWorkspace(workspaces[nextIndex].id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, settings.activeWorkspaceId])

  function applyRestore(shouldRestore: boolean): void {
    setShowRestorePrompt(false)
    if (!shouldRestore) return
    if (settings.activeWorkspaceId) openWorkspace(settings.activeWorkspaceId)
  }

  const activeWorkspace = workspaces.find((w) => w.id === settings.activeWorkspaceId) ?? null

  function handlePaneDrop(targetId: string): void {
    const sourceId = dragPaneIdRef.current
    dragPaneIdRef.current = null
    if (!sourceId || sourceId === targetId || !activeWorkspace) return
    const order = [...activeWorkspace.terminals].sort((a, b) => a.order - b.order).map((t) => t.id)
    const sourceIndex = order.indexOf(sourceId)
    const targetIndex = order.indexOf(targetId)
    if (sourceIndex === -1 || targetIndex === -1) return
    order.splice(sourceIndex, 1)
    order.splice(targetIndex, 0, sourceId)
    reorderTerminals(activeWorkspace.id, order)
  }

  // Every opened workspace's terminals stay mounted (so their pty/scrollback survive switching
  // away) — only the active workspace's terminals are actually shown, tiled together in the
  // arrangement the user set up for that workspace.
  const mountedTerminals = useMemo(
    () =>
      workspaces
        .filter((w) => openedWorkspaceIds.has(w.id))
        .flatMap((w) => [...w.terminals].sort((a, b) => a.order - b.order).map((t) => ({ workspace: w, terminal: t }))),
    [workspaces, openedWorkspaceIds]
  )
  const activeTerminalIds = useMemo(
    () => (activeWorkspace ? [...activeWorkspace.terminals].sort((a, b) => a.order - b.order).map((t) => t.id) : []),
    [activeWorkspace]
  )
  const visibleCount = activeTerminalIds.length
  const cols = useMemo(() => Math.ceil(Math.sqrt(Math.max(1, visibleCount))), [visibleCount])
  const rows = Math.ceil(Math.max(1, visibleCount) / cols)

  // Column widths are user-adjustable fractions; reset to even (or the remembered layout, if
  // it matches this column count) when the column count itself changes so stale fractions
  // from a different pane arrangement don't carry over.
  useEffect(() => {
    setColFractions((prev) => {
      if (prev.length === cols) return prev
      const remembered = settings.paneColFractions
      return remembered.length === cols ? remembered : Array(cols).fill(1)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols])

  useEffect(() => {
    colFractionsRef.current = colFractions
  }, [colFractions])

  const gridStyle = {
    gridTemplateColumns: colFractions.map((f) => `${f}fr`).join(' '),
    gridTemplateRows: `repeat(${rows}, 1fr)`
  }

  const measureDividers = (): void => {
    const container = panesRef.current
    if (!container || cols < 2) {
      setDividerLefts([])
      return
    }
    const containerRect = container.getBoundingClientRect()
    const lefts: number[] = []
    for (let i = 0; i < cols - 1; i++) {
      const cell = columnCellRefs.current.get(i)
      if (!cell) continue
      lefts.push(cell.getBoundingClientRect().right - containerRect.left)
    }
    setDividerLefts(lefts)
  }

  useLayoutEffect(() => {
    measureDividers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, colFractions, visibleCount])

  useEffect(() => {
    const container = panesRef.current
    if (!container) return
    const observer = new ResizeObserver(() => measureDividers())
    observer.observe(container)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols])

  function startColumnDrag(index: number, event: React.MouseEvent): void {
    event.preventDefault()
    const container = panesRef.current
    if (!container) return
    const containerWidth = container.getBoundingClientRect().width
    const startX = event.clientX
    const startFractions = [...colFractions]
    const totalFraction = startFractions.reduce((a, b) => a + b, 0)

    function onMove(moveEvent: MouseEvent): void {
      const deltaFraction = ((moveEvent.clientX - startX) / containerWidth) * totalFraction
      const minFraction = totalFraction * 0.12
      const next = [...startFractions]
      next[index] = Math.max(minFraction, startFractions[index] + deltaFraction)
      next[index + 1] = Math.max(minFraction, startFractions[index + 1] - deltaFraction)
      // Keep the two dragged columns' combined share constant so the rest of the row is untouched.
      const combined = startFractions[index] + startFractions[index + 1]
      const overflow = next[index] + next[index + 1] - combined
      if (overflow !== 0) {
        if (next[index] > next[index + 1]) next[index] -= overflow
        else next[index + 1] -= overflow
      }
      setColFractions(next)
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      updateAppSettings({ paneColFractions: colFractionsRef.current })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="app-shell">
      <Sidebar
        onNewWorkspace={() => setDialogOpen(true)}
        onNewTerminal={(workspaceId) => setTerminalDialogWorkspaceId(workspaceId)}
      />
      <div className="main-area">
        {workspaces.length === 0 && (
          <div className="empty-main">
            <div className="empty-main-mark">&gt;_</div>
            <p>No workspaces yet</p>
            <p className="empty-main-sub">
              A workspace is a named group of terminals. Add one, then add terminals to it.
            </p>
            <button className="primary" onClick={() => setDialogOpen(true)}>
              Create your first workspace
            </button>
          </div>
        )}
        {workspaces.length > 0 && activeWorkspace && activeWorkspace.terminals.length === 0 && (
          <div className="empty-main">
            <div className="empty-main-mark">&gt;_</div>
            <p>&quot;{activeWorkspace.name}&quot; has no terminals yet</p>
            <p className="empty-main-sub">Add one to point it at a project folder and start a session.</p>
            <button className="primary" onClick={() => setTerminalDialogWorkspaceId(activeWorkspace.id)}>
              Add a terminal
            </button>
          </div>
        )}
        {workspaces.length > 0 && !activeWorkspace && (
          <div className="empty-main">
            <div className="empty-main-mark">&gt;_</div>
            <p>Select a workspace to start its sessions</p>
            <p className="empty-main-sub">Click one in the sidebar, or press Ctrl+1…9.</p>
          </div>
        )}
        <div className="main-toolbar">
          {cols > 1 && (
            <button
              className="auto-arrange-button"
              title="Reset column widths"
              onClick={() => {
                const evenFractions = Array(cols).fill(1)
                setColFractions(evenFractions)
                updateAppSettings({ paneColFractions: evenFractions })
              }}
            >
              ⊞ Reset layout
            </button>
          )}
          <button className="auto-arrange-button" title="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
            ? Shortcuts
          </button>
          <button
            className={`auto-arrange-button${filesOpen ? ' active' : ''}`}
            title="Toggle file explorer for the focused terminal"
            onClick={() => setFilesOpen((open) => !open)}
          >
            📁 Files
          </button>
        </div>
        <div className="panes" ref={panesRef} style={gridStyle}>
          {mountedTerminals.map(({ workspace, terminal }) => {
            const visible = workspace.id === activeWorkspace?.id
            const visibleIndex = visible ? activeTerminalIds.indexOf(terminal.id) : -1
            const isActive = visible && terminal.id === focusedTerminalId
            const isFirstRowCell = visibleIndex !== -1 && visibleIndex < cols
            return (
              <TerminalPane
                key={terminal.id}
                ref={(el) => {
                  if (isFirstRowCell && el) columnCellRefs.current.set(visibleIndex, el)
                }}
                terminalId={terminal.id}
                terminalName={terminal.name}
                visible={visible}
                isActive={isActive}
                onHeaderDragStart={(sourceId) => (dragPaneIdRef.current = sourceId)}
                onHeaderDrop={handlePaneDrop}
              />
            )
          })}
          {cols > 1 &&
            dividerLefts.map((left, i) => (
              <div
                key={i}
                className="column-resizer"
                style={{ left }}
                onMouseDown={(e) => startColumnDrag(i, e)}
              />
            ))}
        </div>
      </div>
      {filesOpen && <FileExplorer onClose={() => setFilesOpen(false)} />}
      {dialogOpen && <WorkspaceDialog onClose={() => setDialogOpen(false)} />}
      {terminalDialogWorkspaceId && (
        <TerminalDialog workspaceId={terminalDialogWorkspaceId} onClose={() => setTerminalDialogWorkspaceId(null)} />
      )}
      {showRestorePrompt && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Restore previous session?</h2>
            <p>Claude Code sessions don't survive an app restart. Start them again now?</p>
            <div className="modal-actions">
              <button onClick={() => applyRestore(false)}>Not now</button>
              <button className="primary" onClick={() => applyRestore(true)}>
                Restart sessions
              </button>
            </div>
          </div>
        </div>
      )}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} onNewWorkspace={() => setDialogOpen(true)} />
      )}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              className="toast"
              onClick={() => {
                focusTerminal(toast.terminalId)
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }}
            >
              <span className="status-dot status-waiting" />
              <span>
                <strong>{toast.name}</strong> is waiting for input
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

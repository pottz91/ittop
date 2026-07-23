import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

interface Props {
  onClose: () => void
  onNewWorkspace: () => void
}

interface PaletteAction {
  id: string
  label: string
  hint?: string
  run: () => void
}

export default function CommandPalette({ onClose, onNewWorkspace }: Props): React.JSX.Element {
  const workspaces = useAppStore((s) => s.workspaces)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const actions = useMemo<PaletteAction[]>(() => {
    const workspaceActions: PaletteAction[] = workspaces.map((w) => ({
      id: `open:${w.id}`,
      label: w.name,
      hint: `${w.terminals.length} terminal${w.terminals.length === 1 ? '' : 's'}`,
      run: () => openWorkspace(w.id)
    }))
    return [
      { id: 'new', label: 'New workspace…', run: onNewWorkspace },
      { id: 'settings', label: 'Open settings…', run: () => setSettingsModalOpen(true) },
      ...workspaceActions
    ]
  }, [workspaces, openWorkspace, onNewWorkspace, setSettingsModalOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || (a.hint ?? '').toLowerCase().includes(q)
    )
  }, [actions, query])

  function execute(action: PaletteAction): void {
    action.run()
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = filtered[selected]
      if (action) execute(action)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Jump to a workspace or run a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-empty">No matches.</div>}
          {filtered.map((action, index) => (
            <div
              key={action.id}
              className={`palette-item${index === selected ? ' selected' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => execute(action)}
            >
              <span className="palette-label">{action.label}</span>
              {action.hint && <span className="palette-hint">{action.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

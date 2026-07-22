import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

interface Props {
  workspaceId: string
  onClose: () => void
}

export default function TerminalDialog({ workspaceId, onClose }: Props): React.JSX.Element {
  const addTerminal = useAppStore((s) => s.addTerminal)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const defaultStartCommand = useAppStore((s) => s.settings.defaultStartCommand)
  const [name, setName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [startCommand, setStartCommand] = useState(defaultStartCommand)
  const [error, setError] = useState<string | null>(null)

  async function pickFolder(): Promise<void> {
    const folder = await window.api.pickFolder()
    if (!folder) return
    setProjectPath(folder)
    if (!name.trim()) {
      const parts = folder.split(/[\\/]/).filter(Boolean)
      setName(parts[parts.length - 1] ?? folder)
    }
  }

  async function handleCreate(): Promise<void> {
    if (!projectPath.trim()) {
      setError('Project folder is required.')
      return
    }
    const terminal = await window.api.createTerminal({
      workspaceId,
      name: name.trim() || 'Terminal',
      projectPath: projectPath.trim(),
      startCommand: startCommand.trim() || defaultStartCommand
    })
    if (!terminal) {
      setError('Could not add terminal — the workspace may have been deleted.')
      return
    }
    addTerminal(workspaceId, terminal)
    openWorkspace(workspaceId)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New terminal</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frontend" />
        </label>
        <label>
          Project folder
          <div className="folder-row">
            <input
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="C:\path\to\project"
            />
            <button onClick={() => void pickFolder()}>Browse…</button>
          </div>
        </label>
        <label>
          Start command
          <input value={startCommand} onChange={(e) => setStartCommand(e.target.value)} placeholder="claude" />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => void handleCreate()}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

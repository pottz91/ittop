import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

interface Props {
  onClose: () => void
}

export default function WorkspaceDialog({ onClose }: Props): React.JSX.Element {
  const addWorkspace = useAppStore((s) => s.addWorkspace)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(): Promise<void> {
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    const workspace = await window.api.createWorkspace({ name: name.trim() })
    addWorkspace(workspace)
    openWorkspace(workspace.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New workspace</h2>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            placeholder="e.g. Client A"
          />
        </label>
        <p className="modal-hint">
          A workspace groups terminals together. Add its terminals (project folder + start command) after
          creating it.
        </p>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

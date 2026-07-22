interface Props {
  onClose: () => void
}

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl+K', 'Open the command palette'],
  ['Ctrl+1 … Ctrl+9', 'Jump to workspace 1–9'],
  ['Ctrl+N', 'New workspace'],
  ['Ctrl+F', 'Search inside the focused terminal'],
  ['Click ⚙', 'Open settings'],
  ['Drag pane header', 'Reorder terminals within a workspace'],
  ['Drag column divider', 'Resize a pane column'],
  ['?', 'Toggle this overview']
]

export default function ShortcutsOverlay({ onClose }: Props): React.JSX.Element {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map(([keys, desc]) => (
              <tr key={keys}>
                <td className="shortcuts-keys">{keys}</td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

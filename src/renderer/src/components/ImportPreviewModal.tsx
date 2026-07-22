import { useState } from 'react'
import type { ImportPreviewEntry } from '../../../shared/types'

interface Props {
  entries: ImportPreviewEntry[]
  hasSettings: boolean
  onConfirm: (entries: ImportPreviewEntry[], restoreSettings: boolean) => void
  onClose: () => void
}

export default function ImportPreviewModal({
  entries,
  hasSettings,
  onConfirm,
  onClose
}: Props): React.JSX.Element {
  const [checked, setChecked] = useState<boolean[]>(() => entries.map(() => true))
  const [restoreSettings, setRestoreSettings] = useState(false)
  const selectedCount = checked.filter(Boolean).length

  function toggle(index: number): void {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-preview-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import {entries.length} workspace{entries.length === 1 ? '' : 's'}</h2>
        <p>
          Each imported terminal runs its <strong>start command</strong> automatically the first
          time you open its workspace. Review what will run before importing.
        </p>
        <div className="import-preview-list">
          {entries.map((entry, i) => (
            <label key={i} className="import-preview-item">
              <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} />
              <div className="import-preview-info">
                <div className="import-preview-name">
                  {entry.name}
                  <span className="import-preview-group">
                    {entry.terminals.length} terminal{entry.terminals.length === 1 ? '' : 's'}
                  </span>
                </div>
                {entry.terminals.map((t, ti) => (
                  <div key={ti} className="import-preview-terminal">
                    <div className="import-preview-path">{t.name} — {t.projectPath}</div>
                    <div className="import-preview-command">
                      <span className="shortcuts-keys">$</span> {t.startCommand}
                    </div>
                  </div>
                ))}
              </div>
            </label>
          ))}
        </div>
        {hasSettings && (
          <label className="checkbox-label import-preview-settings-toggle">
            <input
              type="checkbox"
              checked={restoreSettings}
              onChange={(e) => setRestoreSettings(e.target.checked)}
            />
            Also restore theme &amp; preferences from this file (overwrites yours)
          </label>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={selectedCount === 0}
            onClick={() => onConfirm(entries.filter((_, i) => checked[i]), restoreSettings)}
          >
            Import {selectedCount || ''}
          </button>
        </div>
      </div>
    </div>
  )
}

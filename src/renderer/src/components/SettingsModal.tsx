import { useEffect, useState } from 'react'
import type { AppTheme, ImportPreviewEntry, RestorableSettings, UpdateStatus } from '../../../shared/types'
import { useAppStore } from '../store/useAppStore'
import ImportPreviewModal from './ImportPreviewModal'
import HookInfoModal from './HookInfoModal'

interface Props {
  onClose: () => void
}

const THEME_OPTIONS: Array<{ id: AppTheme; label: string; bg: string; bg2: string; accent: string }> = [
  { id: 'dark', label: 'Dark', bg: '#1c1e21', bg2: '#17181a', accent: '#4ee2a3' },
  { id: 'light', label: 'Light', bg: '#ffffff', bg2: '#f4f5f6', accent: '#0f9d63' },
  { id: 'dracula', label: 'Dracula', bg: '#282a36', bg2: '#21222c', accent: '#50fa7b' },
  { id: 'nord', label: 'Nord', bg: '#2e3440', bg2: '#3b4252', accent: '#88c0d0' },
  { id: 'solarized', label: 'Solarized', bg: '#002b36', bg2: '#073642', accent: '#2aa198' }
]

function updateStatusText(status: UpdateStatus | null): string {
  if (!status) return ''
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update available: v${status.version} — downloading…`
    case 'not-available':
      return "You're on the latest version."
    case 'downloading':
      return `Downloading update… ${status.percent}%`
    case 'downloaded':
      return `Update v${status.version} downloaded — restart to install.`
    case 'error':
      return `Couldn't check for updates: ${status.message}`
    case 'unsupported':
      return status.message
  }
}

export default function SettingsModal({ onClose }: Props): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateAppSettings = useAppStore((s) => s.updateAppSettings)
  const reloadWorkspaces = useAppStore((s) => s.reloadWorkspaces)
  const hookServerPort = useAppStore((s) => s.hookServerPort)
  const lastHookEventAt = useAppStore((s) => s.lastHookEventAt)

  const [defaultStartCommand, setDefaultStartCommand] = useState(settings.defaultStartCommand)
  const [idleSeconds, setIdleSeconds] = useState(Math.round(settings.idleDebounceMs / 1000))
  const [version, setVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [dataMessage, setDataMessage] = useState<string | null>(null)
  const [hookInfoOpen, setHookInfoOpen] = useState(false)

  const hooksConnected = lastHookEventAt !== null && Date.now() - lastHookEventAt < 10 * 60_000
  const [importPreview, setImportPreview] = useState<{
    entries: ImportPreviewEntry[]
    settings: RestorableSettings | null
  } | null>(null)

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
    const unsubscribe = window.api.onUpdateStatus((status) => {
      setUpdateStatus(status)
      if (status.state !== 'checking' && status.state !== 'downloading') setChecking(false)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  function commitStartCommand(): void {
    const value = defaultStartCommand.trim() || 'claude'
    setDefaultStartCommand(value)
    updateAppSettings({ defaultStartCommand: value })
  }

  function commitIdleSeconds(): void {
    const seconds = Math.min(60, Math.max(1, Math.round(idleSeconds) || 1))
    setIdleSeconds(seconds)
    updateAppSettings({ idleDebounceMs: seconds * 1000 })
  }

  async function handleExport(): Promise<void> {
    const result = await window.api.exportWorkspaces()
    if (result.ok) {
      setDataMessage(`Exported to ${result.path}`)
    } else if (result.reason === 'cancelled') {
      setDataMessage('Export cancelled.')
    } else {
      setDataMessage(`Export failed: ${result.message}`)
    }
  }

  async function handleImport(): Promise<void> {
    const result = await window.api.prepareImportWorkspaces()
    if (result.ok) {
      setImportPreview({ entries: result.entries, settings: result.settings })
    } else if (result.reason === 'cancelled') {
      setDataMessage('Import cancelled.')
    } else {
      setDataMessage(`Import failed: ${result.message}`)
    }
  }

  async function confirmImport(entries: ImportPreviewEntry[], restoreSettings: boolean): Promise<void> {
    const settingsToRestore = restoreSettings ? (importPreview?.settings ?? null) : null
    setImportPreview(null)
    const result = await window.api.commitImportWorkspaces({ entries, settings: settingsToRestore })
    if (result.ok) {
      await reloadWorkspaces()
      if (settingsToRestore) updateAppSettings(settingsToRestore)
      setDataMessage(`Imported ${result.count} workspace${result.count === 1 ? '' : 's'}.`)
    } else {
      setDataMessage(`Import failed: ${result.message}`)
    }
  }

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label>
          Theme
          <div className="theme-swatches">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`theme-swatch${settings.theme === opt.id ? ' active' : ''}`}
                title={opt.label}
                onClick={() => updateAppSettings({ theme: opt.id })}
              >
                <span className="theme-swatch-preview" style={{ background: opt.bg }}>
                  <span className="theme-swatch-bar" style={{ background: opt.bg2 }} />
                  <span className="theme-swatch-dot" style={{ background: opt.accent }} />
                </span>
                <span className="theme-swatch-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) => updateAppSettings({ notificationsEnabled: e.target.checked })}
          />
          Show a Windows notification when a session is waiting for input
        </label>

        <label>
          Default start command for new workspaces
          <input
            value={defaultStartCommand}
            onChange={(e) => setDefaultStartCommand(e.target.value)}
            onBlur={commitStartCommand}
            onKeyDown={(e) => e.key === 'Enter' && commitStartCommand()}
          />
        </label>

        <label>
          Auto-idle after this many seconds of silent output
          <input
            type="number"
            min={1}
            max={60}
            value={idleSeconds}
            onChange={(e) => setIdleSeconds(Number(e.target.value))}
            onBlur={commitIdleSeconds}
            onKeyDown={(e) => e.key === 'Enter' && commitIdleSeconds()}
          />
        </label>

        <div className="settings-updates">
          <div className="settings-updates-row">
            <span className="settings-version">
              {hooksConnected ? 'Hooks connected' : `Hooks · port ${hookServerPort ?? '…'}`}
            </span>
            <button onClick={() => setHookInfoOpen(true)}>Setup…</button>
          </div>
        </div>

        <div className="settings-updates">
          <div className="settings-updates-row">
            <span className="settings-version">Backup</span>
            <div className="settings-button-group">
              <button onClick={() => void handleExport()}>Export…</button>
              <button onClick={() => void handleImport()}>Import…</button>
            </div>
          </div>
          <p className="settings-update-status">Workspaces, plus theme &amp; preferences.</p>
          {dataMessage && <p className="settings-update-status">{dataMessage}</p>}
        </div>

        <div className="settings-updates">
          <div className="settings-updates-row">
            <span className="settings-version">ittop {version ? `v${version}` : ''}</span>
            {updateStatus?.state === 'downloaded' ? (
              <button className="primary" onClick={() => void window.api.installUpdate()}>
                Restart &amp; install
              </button>
            ) : (
              <button
                disabled={checking}
                onClick={() => {
                  setChecking(true)
                  void window.api.checkForUpdates()
                }}
              >
                {checking ? 'Checking…' : 'Check for updates'}
              </button>
            )}
          </div>
          {updateStatus && <p className="settings-update-status">{updateStatusText(updateStatus)}</p>}
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
    {importPreview && (
      <ImportPreviewModal
        entries={importPreview.entries}
        hasSettings={importPreview.settings !== null}
        onConfirm={(entries, restoreSettings) => void confirmImport(entries, restoreSettings)}
        onClose={() => setImportPreview(null)}
      />
    )}
    {hookInfoOpen && (
      <HookInfoModal port={hookServerPort} connected={hooksConnected} onClose={() => setHookInfoOpen(false)} />
    )}
    </>
  )
}

import { useState } from 'react'

interface Props {
  port: number | null
  connected: boolean
  onClose: () => void
}

function buildSnippet(port: number): string {
  const forward = (message: string): string =>
    `powershell -NoProfile -Command "$json = [Console]::In.ReadToEnd() | ConvertFrom-Json; $body = @{ hookEventName = $json.hook_event_name; projectPath = $json.cwd; message = ${message} } | ConvertTo-Json; try { Invoke-RestMethod -Uri http://127.0.0.1:${port} -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 2 } catch {}"`

  return `{
  "hooks": {
    "Notification": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "${forward('$json.message').replace(/"/g, '\\"')}" } ] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "${forward("'Claude finished responding'").replace(/"/g, '\\"')}" } ] }
    ]
  }
}`
}

export default function HookInfoModal({ port, connected, onClose }: Props): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const snippet = port ? buildSnippet(port) : ''

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal hook-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Claude Code hook setup</h2>
        <p>
          <span className={`status-dot ${connected ? 'status-working' : 'status-idle'}`} style={{ marginRight: 6 }} />
          {connected
            ? 'A hook event has been received recently — status detection is live.'
            : `Listening on 127.0.0.1:${port ?? '…'}, but no hook event has arrived yet.`}
        </p>
        <p>
          Paste this into your Claude Code <code>settings.json</code> (global <code>~/.claude/settings.json</code>{' '}
          or a project&apos;s <code>.claude/settings.json</code>) to forward <code>Notification</code> and{' '}
          <code>Stop</code> events here — it drives the waiting/idle status ring without relying only on OSC
          escape codes.
        </p>
        <pre className="hook-snippet">{snippet}</pre>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={() => void copy()}>
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      </div>
    </div>
  )
}

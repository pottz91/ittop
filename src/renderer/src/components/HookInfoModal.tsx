import { useState } from 'react'

interface Props {
  port: number | null
  connected: boolean
  onClose: () => void
}

function buildSnippet(port: number): string {
  // Forward Claude Code's own hook JSON to the app on stdin, unmodified, via curl.exe (ships
  // with Windows 10+). Claude Code runs hook commands through Git Bash on Windows, which
  // expands $-prefixed variables to nothing before a nested PowerShell command ever sees them,
  // so an inline PowerShell one-liner that tries to remap the payload silently breaks. This
  // avoids that entirely by not needing any shell variables — ittop reads Claude Code's raw
  // hook field names (hook_event_name, cwd, message) directly.
  const command = `curl.exe -s -X POST -H \\"Content-Type: application/json\\" --data-binary @- --max-time 2 http://127.0.0.1:${port}`

  return `{
  "hooks": {
    "Notification": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "${command}" } ] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "${command}" } ] }
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
            ? 'A hook event has been received recently. Status detection is live.'
            : `Listening on 127.0.0.1:${port ?? '…'}, but no hook event has arrived yet.`}
        </p>
        <p>
          Paste this into your Claude Code <code>settings.json</code> (global <code>~/.claude/settings.json</code>{' '}
          or a project&apos;s <code>.claude/settings.json</code>) to forward <code>Notification</code> and{' '}
          <code>Stop</code> events here. It drives the waiting/idle status ring without relying only on OSC
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

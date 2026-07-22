import http from 'http'
import { HOOK_SERVER_PORT } from '../shared/types'
import type { HookEventPayload } from '../shared/types'

type HookHandler = (payload: HookEventPayload) => void

/**
 * Small localhost-only HTTP server that Claude Code hooks POST to. This is the second of the
 * two parallel status-detection paths (the other being OSC escape sequence parsing on the PTY
 * stream). The app ships ready-to-paste hook config (see README) that points at this port.
 */
export class HookServer {
  private server: http.Server | null = null

  constructor(private onEvent: HookHandler) {}

  start(): number {
    this.server = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }

      // Reject anything sent with an Origin header. Legitimate hook calls come from a
      // PowerShell/curl-style script and never set one; only browsers do, on both
      // cross-origin AND same-origin requests — so this blocks a malicious webpage from
      // silently POSTing here (CSRF) without needing a shared secret or breaking the
      // documented hook setup.
      if (req.headers.origin) {
        res.writeHead(403).end()
        return
      }

      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 1_000_000) req.destroy()
      })
      req.on('end', () => {
        try {
          // Claude Code's hook stdin JSON is forwarded here verbatim (see README) rather than
          // remapped by the hook command itself — that used to require inline PowerShell
          // variables, which Claude Code's Git-Bash-based hook runner silently mangles on
          // Windows (`$json`/`$body` get bash-expanded to empty before PowerShell ever sees
          // them). Reading Claude Code's own field names here means the hook command can be a
          // plain, variable-free `curl` one-liner instead.
          const raw = JSON.parse(body) as Record<string, unknown>
          const hookEventName = raw.hook_event_name ?? raw.hookEventName
          const projectPath = raw.cwd ?? raw.projectPath
          if (typeof hookEventName === 'string' && typeof projectPath === 'string') {
            const payload: HookEventPayload = {
              hookEventName,
              projectPath,
              message: typeof raw.message === 'string' ? raw.message : undefined
            }
            this.onEvent(payload)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400).end(JSON.stringify({ ok: false, error: 'invalid payload' }))
        }
      })
    })

    // A Node EventEmitter throws (crashing the whole Electron main process) if 'error' fires
    // with no listener attached — without this, anything already using the port (another
    // ittop instance, a leftover process, or plain bad luck) would take the entire app down
    // instead of just leaving hook-based status detection unavailable for this session.
    this.server.on('error', (err) => {
      console.error(`[hookServer] failed to listen on 127.0.0.1:${HOOK_SERVER_PORT}:`, err.message)
    })

    // Bind to loopback only; these events never need to leave the machine.
    this.server.listen(HOOK_SERVER_PORT, '127.0.0.1')
    return HOOK_SERVER_PORT
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }
}

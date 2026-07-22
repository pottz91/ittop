import * as pty from 'node-pty'
import treeKill from 'tree-kill'
import os from 'os'
import { containsAttentionOsc } from './osc'
import type { StatusManager } from './statusManager'

const SCROLLBACK_LINES = 10000
const DEFAULT_SHELL = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? 'bash')

interface Session {
  proc: pty.IPty
  terminalId: string
  idleTimer: NodeJS.Timeout | null
}

export class PtyManager {
  private sessions = new Map<string, Session>()

  constructor(
    private statusManager: StatusManager,
    private onData: (terminalId: string, data: string) => void,
    private onExit: (terminalId: string, exitCode: number) => void,
    // How long output must stay silent before a "working" session is auto-marked idle. This is
    // a fallback signal that needs no Claude Code hook setup, user-tunable via Settings.
    private getIdleDebounceMs: () => number
  ) {}

  has(terminalId: string): boolean {
    return this.sessions.has(terminalId)
  }

  start(terminalId: string, cwd: string, startCommand: string, cols = 80, rows = 30): void {
    if (this.sessions.has(terminalId)) return

    const proc = pty.spawn(DEFAULT_SHELL, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env } as Record<string, string>,
      useConpty: process.platform === 'win32'
    })

    const session: Session = { proc, terminalId, idleTimer: null }
    this.sessions.set(terminalId, session)

    proc.onData((data) => {
      if (containsAttentionOsc(data)) {
        this.statusManager.markWaiting(terminalId)
      }
      this.scheduleAutoIdle(session)
      this.onData(terminalId, data)
    })

    proc.onExit(({ exitCode }) => {
      if (session.idleTimer) clearTimeout(session.idleTimer)
      this.sessions.delete(terminalId)
      this.onExit(terminalId, exitCode)
    })

    if (startCommand && startCommand.trim().length > 0) {
      proc.write(`${startCommand}${os.EOL}`)
    }
  }

  private scheduleAutoIdle(session: Session): void {
    if (session.idleTimer) clearTimeout(session.idleTimer)
    session.idleTimer = setTimeout(() => {
      session.idleTimer = null
      if (this.statusManager.get(session.terminalId) === 'working') {
        this.statusManager.markIdle(session.terminalId)
      }
    }, this.getIdleDebounceMs())
  }

  write(terminalId: string, data: string): void {
    const session = this.sessions.get(terminalId)
    if (!session) return
    if (data.includes('\r') || data.includes('\n')) {
      this.statusManager.markLikelyWorking(terminalId)
    }
    session.proc.write(data)
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const session = this.sessions.get(terminalId)
    if (!session) return
    try {
      session.proc.resize(Math.max(cols, 1), Math.max(rows, 1))
    } catch {
      // ignore resize races during teardown
    }
  }

  stop(terminalId: string): Promise<void> {
    const session = this.sessions.get(terminalId)
    if (!session) return Promise.resolve()
    if (session.idleTimer) clearTimeout(session.idleTimer)
    this.sessions.delete(terminalId)
    return new Promise((resolve) => {
      treeKill(session.proc.pid, 'SIGTERM', () => resolve())
    })
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)))
  }

  static get scrollbackLines(): number {
    return SCROLLBACK_LINES
  }
}

import type { TerminalStatus } from '../shared/types'

type Listener = (terminalId: string, status: TerminalStatus) => void

/**
 * Central authority for per-terminal status. Two independent signal sources feed into it
 * (OSC escape sequences from the PTY stream, and Claude Code hook HTTP events), plus a
 * simple heuristic on PTY stdin (Enter key submitted -> agent likely starts working).
 */
export class StatusManager {
  private statuses = new Map<string, TerminalStatus>()
  private listeners = new Set<Listener>()

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get(terminalId: string): TerminalStatus {
    return this.statuses.get(terminalId) ?? 'idle'
  }

  set(terminalId: string, status: TerminalStatus): void {
    if (this.statuses.get(terminalId) === status) return
    this.statuses.set(terminalId, status)
    for (const listener of this.listeners) listener(terminalId, status)
  }

  remove(terminalId: string): void {
    this.statuses.delete(terminalId)
  }

  /** Called when the user sends input containing Enter -> the agent is likely about to work. */
  markLikelyWorking(terminalId: string): void {
    if (this.get(terminalId) !== 'working') this.set(terminalId, 'working')
  }

  /** Called on OSC 9 / OSC 777 attention sequences or a Claude Code "Notification" hook event. */
  markWaiting(terminalId: string): void {
    this.set(terminalId, 'waiting')
  }

  /** Called on a Claude Code "Stop" hook event. */
  markIdle(terminalId: string): void {
    this.set(terminalId, 'idle')
  }
}

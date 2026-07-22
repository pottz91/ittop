import { execFile } from 'child_process'

export function getGitBranch(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, timeout: 4000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        const branch = stdout.trim()
        resolve(branch.length > 0 ? branch : null)
      }
    )
  })
}

const POLL_INTERVAL_MS = 5000

export class GitBranchPoller {
  private timer: NodeJS.Timeout | null = null
  private lastKnown = new Map<string, string | null>()

  constructor(
    private getTerminalPaths: () => { id: string; path: string }[],
    private onBranchChanged: (terminalId: string, branch: string | null) => void
  ) {}

  start(): void {
    this.stop()
    this.timer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS)
    void this.pollOnce()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Drop a deleted terminal's cached branch so `lastKnown` doesn't grow forever across a long
   * session with heavy terminal churn — it otherwise only ever gains entries, never loses them. */
  forget(terminalId: string): void {
    this.lastKnown.delete(terminalId)
  }

  private async pollOnce(): Promise<void> {
    const terminals = this.getTerminalPaths()
    await Promise.all(
      terminals.map(async ({ id, path }) => {
        const branch = await getGitBranch(path)
        if (this.lastKnown.get(id) !== branch) {
          this.lastKnown.set(id, branch)
          this.onBranchChanged(id, branch)
        }
      })
    )
  }
}

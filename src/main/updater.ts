import { app } from 'electron'
import type { UpdateStatus } from '../shared/types'

/**
 * Thin wrapper around electron-updater. Reads GitHub Releases (see the `publish` block in
 * electron-builder.yml) — checkForUpdates() only works in a packaged build against a real
 * published release, so it resolves to an 'unsupported' status in dev instead of throwing.
 */
export class Updater {
  private autoUpdater: typeof import('electron-updater').autoUpdater | null = null

  constructor(private onStatus: (status: UpdateStatus) => void) {}

  installUpdate(): void {
    this.autoUpdater?.quitAndInstall()
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      this.onStatus({ state: 'unsupported', message: 'Updates only run in a packaged build, not in dev mode.' })
      return
    }

    let autoUpdater: typeof import('electron-updater').autoUpdater
    try {
      ;({ autoUpdater } = await import('electron-updater'))
      this.autoUpdater = autoUpdater
    } catch {
      this.onStatus({ state: 'unsupported', message: 'electron-updater is not available.' })
      return
    }

    if (!this.wired) {
      this.wired = true
      autoUpdater.on('checking-for-update', () => this.onStatus({ state: 'checking' }))
      autoUpdater.on('update-available', (info) => this.onStatus({ state: 'available', version: info.version }))
      autoUpdater.on('update-not-available', () => this.onStatus({ state: 'not-available' }))
      autoUpdater.on('download-progress', (progress) =>
        this.onStatus({ state: 'downloading', percent: Math.round(progress.percent) })
      )
      autoUpdater.on('update-downloaded', (info) => this.onStatus({ state: 'downloaded', version: info.version }))
      autoUpdater.on('error', (err) =>
        this.onStatus({
          state: 'error',
          message:
            err.message.includes('publish') || err.message.includes('404')
              ? 'No update feed is configured yet (electron-builder.yml needs a publish target).'
              : err.message
        })
      )
    }

    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.onStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private wired = false
}

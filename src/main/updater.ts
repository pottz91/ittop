import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

/**
 * Thin wrapper around electron-updater. Reads GitHub Releases (see the `publish` block in
 * electron-builder.yml) — checkForUpdates() only works in a packaged build against a real
 * published release, so it resolves to an 'unsupported' status in dev instead of throwing.
 *
 * Imports `autoUpdater` as a plain static import rather than `await import('electron-updater')`:
 * the main process build externalizes electron-updater (never bundles it), so a *dynamic*
 * import at runtime falls back to Node's own CJS-interop guessing (cjs-module-lexer) to figure
 * out electron-updater's named exports, which failed to find `autoUpdater` in the packaged app
 * and threw "Cannot read properties of undefined (reading 'on')" the first time this shipped. A
 * static import lets the bundler compile it to a direct property access instead, which works.
 */
export class Updater {
  constructor(private onStatus: (status: UpdateStatus) => void) {}

  installUpdate(): void {
    autoUpdater.quitAndInstall()
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      this.onStatus({ state: 'unsupported', message: 'Updates only run in a packaged build, not in dev mode.' })
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

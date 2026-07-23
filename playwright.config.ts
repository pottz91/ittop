import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Electron app launches are not free-threadable the way browser contexts are — keep it to
  // one worker so tests don't race over the same hook-server port / userData directory scheme.
  workers: 1,
  fullyParallel: false,
  // Electron E2E launches a full OS process per test; a cold app launch is inherently more
  // prone to environment-level flakiness (slow disk, AV scanning, GPU init) than in-browser
  // Playwright tests. Retrying is standard practice here — a genuinely broken feature still
  // fails on every retry, this just absorbs launch-timing noise.
  retries: 2,
  reporter: 'list'
})

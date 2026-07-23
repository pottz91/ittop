import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { tmpdir } from 'os'
import { launchApp, closeApp } from './helpers'
import type { LaunchedApp } from './helpers'

async function createWorkspace(window: Page, name: string): Promise<void> {
  await window.locator('button[title="New workspace (Ctrl+N)"]').click()
  await window.locator('.modal input').first().fill(name)
  await window.locator('.modal-actions button.primary').click()
  await expect(window.locator('.workspace-item', { hasText: name })).toBeVisible()
}

async function addTerminal(window: Page, workspaceName: string, terminalName: string, startCommand: string): Promise<void> {
  await window.locator('.sidebar-tab', { hasText: 'Workspaces' }).click()
  const group = window.locator('.workspace-group').filter({ hasText: workspaceName })
  await group.locator('.terminal-add-row').click()
  await window.locator('.modal input').first().fill(terminalName)
  await window.locator('.folder-row input').fill(tmpdir())
  await window.locator('.modal label:has-text("Start command") input').fill(startCommand)
  await window.locator('.modal-actions button.primary', { hasText: 'Add' }).click()
}

test.describe('workspace lifecycle', () => {
  let ctx: LaunchedApp

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await closeApp(ctx)
  })

  test('shows the empty state with no workspaces', async () => {
    await expect(ctx.window.locator('.empty-main')).toContainText('No workspaces yet')
  })

  test('creating a workspace shows it in the sidebar with no terminals yet', async () => {
    const { window } = ctx
    await createWorkspace(window, 'E2E Test Workspace')
    await expect(window.locator('.empty-main')).toContainText('has no terminals yet')
  })

  test('adding a terminal opens it and runs its start command', async () => {
    const { window } = ctx
    await addTerminal(window, 'E2E Test Workspace', 'Main', 'echo hello-e2e')

    await expect(window.locator('.terminal-pane .terminal-pane-title')).toContainText('Main')
    // The pty actually starts and the shell prints something — proves the IPC round trip
    // (renderer -> main -> node-pty -> back to renderer) works end to end, not just the UI shell.
    await expect(window.locator('.xterm-screen')).toContainText('hello-e2e', { timeout: 15_000 })
  })
})

test.describe('multi-terminal workspace and settings', () => {
  let ctx: LaunchedApp

  test.beforeAll(async () => {
    ctx = await launchApp()
    await createWorkspace(ctx.window, 'Multi Workspace')
    // Explicit harmless commands — the dialog otherwise defaults to the real "claude" CLI,
    // which is slow/network-dependent and has no place in a fast, deterministic test.
    await addTerminal(ctx.window, 'Multi Workspace', 'Terminal A', 'echo terminal-a-ready')
    await addTerminal(ctx.window, 'Multi Workspace', 'Terminal B', 'echo terminal-b-ready')
  })

  test.afterAll(async () => {
    await closeApp(ctx)
  })

  test('a workspace with two terminals shows both panes tiled together', async () => {
    const { window } = ctx
    await expect(window.locator('.terminal-pane').filter({ visible: true })).toHaveCount(2)
  })

  test('switching theme in Settings updates the document theme attribute', async () => {
    const { window } = ctx
    await window.locator('button[title="Settings"]').click()
    await expect(window.locator('.settings-modal')).toBeVisible()

    await window.locator('.theme-swatch', { hasText: 'Nord' }).click()
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'nord')

    await window.locator('.theme-swatch', { hasText: 'Dark' }).click()
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark')
    await window.locator('.modal-actions button.primary', { hasText: 'Done' }).click()
  })
})

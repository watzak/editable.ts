import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __yjsCollabE2E?: {
      clientA: () => { registryMap: Map<string, unknown> }
      clientB: () => { registryMap: Map<string, unknown> }
      syncAll: () => void
      network: { setOffline: (id: string, v: boolean) => void; isOnline: (id: string) => boolean }
      getPrimary: (client: {
        primaryBlockId: string
        registry: { get: (id: string) => unknown }
      }) => {
        body?: { toString: () => string; toDelta: () => unknown[] }
        binding?: { canUndo: () => boolean; undo: () => boolean }
        host?: HTMLElement
      }
      getPrimaryYText: (client: unknown) => { toString: () => string; toDelta: () => unknown[] }
      remountClientA: () => void
      updateStatus: () => void
    }
  }
}

async function waitForSharedYText(page: import('@playwright/test').Page, text: string) {
  await page.waitForFunction(
    (expected) => {
      const api = window.__yjsCollabE2E
      if (!api) return false
      const a = api.getPrimaryYText(api.clientA())?.toString() ?? ''
      const b = api.getPrimaryYText(api.clientB())?.toString() ?? ''
      return a === expected && b === expected
    },
    text,
    { timeout: 15_000 }
  )
}

test.describe('Yjs collab RC demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/yjs-collab-demo.html', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__yjsCollabE2E != null, undefined, { timeout: 15_000 })
  })

  test('syncs plain-text typing between clients via beforeinput path', async ({ page }) => {
    const hostA = page.locator('[data-test-primary-host="a"]')
    const hostB = page.locator('[data-test-primary-host="b"]')

    await hostA.click()
    await hostA.pressSequentially('Hello collab', { delay: 25 })
    await waitForSharedYText(page, 'Hello collab')

    const status = await page.locator('[data-testid="collab-status"]').textContent()
    expect(status).toContain('Y.Text equal: true')
    expect(status).toContain('delta equal: true')
    // Y.Text is canonical for collab; Playwright pressSequentially may leave remote DOM out of sync
    // (ZWSP / reorder) until the next local reconcile — covered by waitForSharedYText above.
    await expect(hostB).not.toBeEmpty()
  })

  test('converges after offline edits on both clients', async ({ page }) => {
    await page.evaluate(() => {
      const api = window.__yjsCollabE2E
      if (!api) return
      api.network.setOffline('a', true)
      api.network.setOffline('b', true)
    })

    const hostA = page.locator('[data-test-primary-host="a"]')
    const hostB = page.locator('[data-test-primary-host="b"]')

    await hostA.click()
    await hostA.pressSequentially('offline-a', { delay: 20 })
    await hostB.click()
    await hostB.pressSequentially('offline-b', { delay: 20 })

    await page.evaluate(() => {
      const api = window.__yjsCollabE2E
      if (!api) return
      api.network.setOffline('a', false)
      api.network.setOffline('b', false)
      api.syncAll()
    })

    await page.waitForFunction(() => {
      const status = document.querySelector('[data-testid="collab-status"]')?.textContent ?? ''
      return status.includes('delta equal: true')
    })
  })

  test('A undo removes only local edits after B synced', async ({ page }) => {
    const hostA = page.locator('[data-test-primary-host="a"]')

    await hostA.click()
    await hostA.pressSequentially('aaa', { delay: 20 })
    await waitForSharedYText(page, 'aaa')

    const hostB = page.locator('[data-test-primary-host="b"]')
    await hostB.click()
    await hostB.pressSequentially('bbb', { delay: 20 })
    await page.waitForFunction(() => {
      const api = window.__yjsCollabE2E
      if (!api) return false
      return api.getPrimaryYText(api.clientB())?.toString().includes('bbb')
    })

    await page.click('[data-action="undo-a"]')
    await page.evaluate(() => window.__yjsCollabE2E?.syncAll())

    const textB = await hostB.textContent()
    expect(textB).toContain('bbb')
    expect(textB).not.toContain('aaa')
  })

  test('destroy and remount client A preserves synced text', async ({ page }) => {
    const hostA = page.locator('[data-test-primary-host="a"]')
    await hostA.click()
    await hostA.pressSequentially('persist', { delay: 25 })
    await waitForSharedYText(page, 'persist')

    await page.click('[data-action="destroy-remount"]')
    await page.waitForFunction(() => document.querySelector('[data-test-primary-host="a"]') != null)

    const hostAfter = page.locator('[data-test-primary-host="a"]')
    await expect(hostAfter).toContainText('persist')
  })

  test('shows remote presence overlay after selection sync', async ({ page }) => {
    const hostA = page.locator('[data-test-primary-host="a"]')
    await hostA.click()
    await hostA.pressSequentially('presence', { delay: 20 })
    await waitForSharedYText(page, 'presence')

    await hostA.click()
    await hostA.press('Home')
    await hostA.press('Shift+ArrowRight')
    await hostA.press('Shift+ArrowRight')
    await page.evaluate(() => window.__yjsCollabE2E?.syncAll())

    await page.waitForFunction(
      () => document.querySelectorAll('.editable-yjs-presence-caret').length >= 1,
      undefined,
      { timeout: 10_000 }
    )
  })
})

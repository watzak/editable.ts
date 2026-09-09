import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __yjsAnnotationsE2E?: {
      clientA: () => { store: { list: () => unknown[] } }
      clientB: () => { store: { list: () => unknown[] } }
      syncAll: () => void
      countAnnotations: (client: { store: { list: () => unknown[] } }) => number
    }
  }
}

test.describe('Yjs annotations demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/yjs-annotations-demo.html', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__yjsAnnotationsE2E != null, undefined, {
      timeout: 15_000
    })
  })

  test('comment on A appears on B after sync', async ({ page }) => {
    await page.locator('#editor-a').click()
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.up('Shift')

    await page.click('[data-action="comment-a"]')

    await page.waitForFunction(() => {
      const api = window.__yjsAnnotationsE2E!
      return api.countAnnotations(api.clientB()) >= 1
    })

    const count = await page.evaluate(() => {
      const api = window.__yjsAnnotationsE2E!
      return api.countAnnotations(api.clientB())
    })
    expect(count).toBeGreaterThanOrEqual(1)
    await expect(page.locator('.editable-yjs-annotation-list [data-annotation-id]').first()).toBeVisible()
  })

  test('renderer does not change editor text content', async ({ page }) => {
    const before = await page.locator('#editor-a').textContent()
    await page.locator('#editor-a').click()
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    await page.keyboard.press('End')
    await page.keyboard.up('Shift')
    await page.click('[data-action="comment-a"]')
    const after = await page.locator('#editor-a').textContent()
    expect(after).toBe(before)
  })
})

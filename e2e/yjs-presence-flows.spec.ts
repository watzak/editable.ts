import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __yjsPresenceE2E?: {
      hostA: HTMLElement
      hostB: HTMLElement
      syncBothWays: () => void
      syncAwarenessBothWays: () => void
      countRemoteCarets: (doc?: Document) => number
      serializedDocHasPresence: (doc: import('yjs').Doc) => boolean
      getYText: () => string
      getYDeltaJson: () => string
    }
  }
}

async function waitForSharedText(page: import('@playwright/test').Page, text: string) {
  await page.waitForFunction(
    (expected) => {
      const setup = window.__yjsPresenceE2E
      if (!setup) return false
      return setup.getYText() === expected
    },
    text,
    { timeout: 10_000 }
  )
}

test.describe('Yjs presence flows', () => {
  test('shows remote caret on peer B without mutating CRDT content', async ({ page }) => {
    await page.goto('/examples/yjs-presence-editor.html', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__yjsPresenceE2E != null, undefined, {
      timeout: 15_000
    })

    const hostA = page.locator('#editor-a')
    const hostB = page.locator('#editor-b')

    await hostA.click()
    await hostA.pressSequentially('Hello presence', { delay: 30 })
    await waitForSharedText(page, 'Hello presence')

    const yText = await page.evaluate(() => window.__yjsPresenceE2E?.getYText())
    expect(yText).toBe('Hello presence')

    const deltaBefore = await page.evaluate(() => window.__yjsPresenceE2E?.getYDeltaJson())
    const docHasPresence = await page.evaluate(() => {
      const setup = window.__yjsPresenceE2E
      if (!setup) return true
      return (
        setup.serializedDocHasPresence(setup.docA) || setup.serializedDocHasPresence(setup.docB)
      )
    })
    expect(docHasPresence).toBe(false)

    await hostA.click()
    await hostA.press('Home')
    await hostA.press('Shift+ArrowRight')
    await hostA.press('Shift+ArrowRight')
    await hostA.press('Shift+ArrowRight')
    await page.evaluate(() => window.__yjsPresenceE2E?.syncAwarenessBothWays())

    await page.waitForFunction(
      () => (window.__yjsPresenceE2E?.countRemoteCarets() ?? 0) >= 1,
      undefined,
      {
        timeout: 10_000
      }
    )

    const remoteCarets = await page.evaluate(
      () => window.__yjsPresenceE2E?.countRemoteCarets() ?? 0
    )
    expect(remoteCarets).toBeGreaterThanOrEqual(1)

    const deltaAfter = await page.evaluate(() => window.__yjsPresenceE2E?.getYDeltaJson())
    expect(deltaAfter).toBe(deltaBefore)

    const hostBHtml = await hostB.evaluate((el) => el.innerHTML)
    expect(hostBHtml).not.toContain('editable-yjs-presence')
    expect(hostBHtml).not.toContain('data-editable="ui-unwrap"')
  })

  test('cleans up overlay layers when navigating away', async ({ page }) => {
    await page.goto('/examples/yjs-presence-editor.html', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__yjsPresenceE2E != null, undefined, {
      timeout: 15_000
    })

    const hostA = page.locator('#editor-a')
    await hostA.click()
    await hostA.pressSequentially('cleanup test', { delay: 30 })
    await waitForSharedText(page, 'cleanup test')

    await hostA.click()
    await page.evaluate(() => window.__yjsPresenceE2E?.syncAwarenessBothWays())

    await page.goto('about:blank')
    await expect(page.locator('.editable-yjs-presence-layer')).toHaveCount(0)
  })
})

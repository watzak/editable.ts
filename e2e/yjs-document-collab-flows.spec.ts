import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __yjsDocumentCollabE2E?: {
      clientA: () => {
        root: { length: number }
        binding: { canUndo: () => boolean; undo: () => boolean; destroy: () => void }
        mountContainer: HTMLElement
      }
      clientB: () => {
        root: { length: number }
        binding: { canUndo: () => boolean }
        mountContainer: HTMLElement
      }
      network: { setOffline: (id: string, v: boolean) => void; syncAll: () => void }
      syncAll: () => void
      listComponents: (client: { root: unknown }) => {
        componentId: string
        componentType: string
      }[]
      insertAt: (client: unknown, type: string, index: number) => void
      moveFirstParagraphToLeftColumn: (client: unknown) => boolean
      getDirectiveText: (client: unknown, index: number, key?: string) => string | null
      deleteComponent: (client: unknown, componentId: string) => void
      findFocused: (client: unknown) => { componentId: string } | null
    }
  }
}

test.describe('Yjs document collab demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/yjs-document-collab-demo.html', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__yjsDocumentCollabE2E != null, undefined, {
      timeout: 15_000
    })
  })

  test('client A insert appears on client B after sync', async ({ page }) => {
    await page.click('[data-action="insert-a"]')
    await page.waitForFunction(() => {
      const api = window.__yjsDocumentCollabE2E
      if (!api) return false
      return api.listComponents(api.clientB()).length >= 2
    })

    const bComponents = await page.evaluate(() => {
      const api = window.__yjsDocumentCollabE2E!
      return api.listComponents(api.clientB()).length
    })
    expect(bComponents).toBeGreaterThanOrEqual(2)
  })

  test('client A moves component into nested container on B', async ({ page }) => {
    await page.click('[data-action="insert-two-column-a"]')
    await page.click('[data-action="move-nested-a"]')

    await page.waitForFunction(() => {
      const api = window.__yjsDocumentCollabE2E!
      const nested = api
        .listComponents(api.clientB())
        .some(
          (c) =>
            c.componentType === 'paragraph' &&
            document.querySelector('.cms-column-left .cms-component')
        )
      return nested
    })

    const inLeftColumn = await page
      .locator('#cms-document-b .cms-column-left .cms-component')
      .count()
    expect(inLeftColumn).toBeGreaterThanOrEqual(1)
  })

  test('B edits text while A moves component — both converge', async ({ page }) => {
    await page.click('[data-action="insert-a"]')
    await page.locator('#cms-document-b [contenteditable]').first().click()
    await page.keyboard.type(' remote')

    await page.waitForFunction(() =>
      (document.getElementById('cms-document-b')?.textContent ?? '').includes('remote')
    )

    await page.click('[data-action="move-a"]')

    await page.waitForFunction(() => {
      const api = window.__yjsDocumentCollabE2E!
      const aCount = api.listComponents(api.clientA()).length
      const bCount = api.listComponents(api.clientB()).length
      const bDoc = document.getElementById('cms-document-b')?.textContent ?? ''
      return aCount === bCount && bDoc.includes('remote')
    })

    const text = await page.locator('#cms-document-b').textContent()
    expect(text).toContain('remote')
  })

  test('concurrent inserts at same position converge', async ({ page }) => {
    await page.evaluate(() => {
      const api = window.__yjsDocumentCollabE2E!
      api.network.setOffline('a', true)
      api.network.setOffline('b', true)
      api.insertAt(api.clientA(), 'paragraph', 0)
      api.insertAt(api.clientB(), 'quote', 0)
      api.network.setOffline('a', false)
      api.network.setOffline('b', false)
      api.syncAll()
    })

    await page.waitForFunction(() => {
      const api = window.__yjsDocumentCollabE2E!
      const a = api.listComponents(api.clientA()).length
      const b = api.listComponents(api.clientB()).length
      return a === b && a >= 3
    })

    const counts = await page.evaluate(() => {
      const api = window.__yjsDocumentCollabE2E!
      return {
        a: api.listComponents(api.clientA()).length,
        b: api.listComponents(api.clientB()).length
      }
    })
    expect(counts.a).toBe(counts.b)
    expect(counts.a).toBeGreaterThanOrEqual(3)
  })

  test('B deletes component focused on A — deterministic recovery', async ({ page }) => {
    await page.click('[data-action="insert-a"]')
    await page.locator('#cms-document-a [contenteditable]').nth(1).click()

    const targetId = await page.evaluate(() => {
      const api = window.__yjsDocumentCollabE2E!
      const focused = api.findFocused(api.clientA())
      return focused?.componentId ?? null
    })
    expect(targetId).toBeTruthy()

    await page.evaluate((id) => {
      const api = window.__yjsDocumentCollabE2E!
      api.deleteComponent(api.clientB(), id!)
    }, targetId)

    await page.waitForFunction(
      (id) => {
        const api = window.__yjsDocumentCollabE2E!
        return !api.listComponents(api.clientA()).some((c) => c.componentId === id)
      },
      targetId,
      { timeout: 10_000 }
    )

    const stillFocused = await page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return false
      const node = sel.anchorNode
      return node instanceof Node && document.getElementById('cms-document-a')?.contains(node)
    })
    expect(stillFocused).toBe(true)
  })

  test('offline edits converge after reconnect', async ({ page }) => {
    await page.evaluate(() => {
      const api = window.__yjsDocumentCollabE2E!
      api.network.setOffline('a', true)
      api.network.setOffline('b', true)
    })

    await page.click('[data-action="insert-a"]')
    await page.click('[data-action="insert-b"]')

    await page.evaluate(() => {
      const api = window.__yjsDocumentCollabE2E!
      api.network.setOffline('a', false)
      api.network.setOffline('b', false)
      api.syncAll()
    })

    await page.waitForFunction(() => {
      const api = window.__yjsDocumentCollabE2E!
      const a = api.listComponents(api.clientA()).length
      const b = api.listComponents(api.clientB()).length
      return a === b && a >= 2
    })
  })

  test('undo on A does not require remote undo on B', async ({ page }) => {
    await page.click('[data-action="insert-a"]')
    await page.locator('#cms-document-a [contenteditable]').first().click()
    await page.keyboard.type(' typed')
    await page.waitForFunction(() => window.__yjsDocumentCollabE2E?.clientA()?.binding.canUndo())

    await page.click('[data-action="undo-a"]')
    const canUndo = await page.evaluate(() =>
      window.__yjsDocumentCollabE2E?.clientA()?.binding.canUndo()
    )
    expect(canUndo).toBe(false)
  })

  test('destroy A stops further binding updates', async ({ page }) => {
    await page.click('[data-action="destroy-a"]')
    const countBefore = await page.locator('#cms-document-a .cms-component').count()
    await page.click('[data-action="insert-b"]')
    await page.evaluate(() => window.__yjsDocumentCollabE2E?.syncAll())
    const countAfter = await page.locator('#cms-document-a .cms-component').count()
    expect(countAfter).toBe(countBefore)
  })
})

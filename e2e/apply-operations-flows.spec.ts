import { expect, test } from '@playwright/test'
import { getScopedEvents, gotoE2E, placeCursorInText } from './helpers.js'

test.describe('applyOperations flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('applies remote insert and emits a single change', async ({ page }) => {
    const block = page.locator('[data-testid="remote-apply-block"]')

    await block.click()
    await page.evaluate(() => {
      window.__editableE2E?.applyRemoteOperations(
        'remote-apply-block',
        {
          source: 'remote',
          operations: [{ type: 'insertText', index: 0, text: 'Remote ' }]
        },
        { emitChange: true }
      )
    })

    await expect(block).toHaveText(/Remote/)
    const events = await getScopedEvents(page, 'remote-apply-log')
    expect(events.filter((e) => e === 'change')).toHaveLength(1)
    expect(events).not.toContain('operation')
  })

  test('preserves selection across remote insert inside the host', async ({ page }) => {
    const block = page.locator('[data-testid="remote-apply-block"]')

    await block.click()
    await block.pressSequentially('abcdef')
    await placeCursorInText(page, '[data-testid="remote-apply-block"]', 'cde', 'middle')

    const offsetAfter = await page.evaluate(() => {
      const blockEl = document.querySelector('[data-testid="remote-apply-block"]') as HTMLElement
      window.__editableE2E?.applyRemoteOperations('remote-apply-block', {
        source: 'remote',
        operations: [{ type: 'insertText', index: 0, text: '!' }]
      })
      const sel = window.getSelection()
      if (!sel?.anchorNode || !blockEl.contains(sel.anchorNode)) return -1
      const pre = blockEl.ownerDocument.createRange()
      pre.selectNodeContents(blockEl)
      pre.setEnd(sel.anchorNode, sel.anchorOffset)
      return pre.toString().length
    })

    expect(offsetAfter).toBeGreaterThan(3)
  })
})

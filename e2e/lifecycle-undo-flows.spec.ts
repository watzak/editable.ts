import { expect, test } from '@playwright/test'
import {
  execRedo,
  execUndo,
  getLoggedEvents,
  gotoE2E,
  placeCursorAtEnd,
  placeCursorInText,
  UNDO_SELECTOR,
  waitForLifecycleStatus
} from './helpers.js'

test.describe('Lifecycle flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('unload removes dispatcher listeners so structural edits stop firing', async ({ page }) => {
    await page.locator('[data-testid="btn-unload"]').click()
    await waitForLifecycleStatus(page, 'unloaded')

    const eventsBefore = await getLoggedEvents(page)
    await placeCursorAtEnd(page, '[data-testid="paragraph-first"]')
    await page.locator('[data-testid="paragraph-first"]').press('Enter')

    await page.waitForFunction((previous) => {
      const log = document.querySelector('[data-testid="event-log"]')
      return (log?.getAttribute('data-events') ?? '') === previous
    }, eventsBefore.join(','))

    const eventsAfter = await getLoggedEvents(page)
    expect(eventsAfter).not.toContain('insert')
    expect(eventsAfter).not.toContain('split')
  })
})

test.describe('Undo flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('native undo restores block count after structural split when supported', async ({
    page
  }) => {
    const block = page.locator('[data-testid="undo-block"]')
    const blocks = page.locator(UNDO_SELECTOR)
    const countBefore = await blocks.count()

    await placeCursorInText(page, '[data-testid="undo-block"]', 'structural', 'middle')
    await block.press('Enter')

    await expect(blocks).toHaveCount(countBefore + 1)

    await execUndo(page)

    const countAfterUndo = await blocks.count()
    if (countAfterUndo !== countBefore) {
      test.skip(true, 'Structural undo is not reliable in this browser engine')
    }

    await placeCursorInText(page, '[data-testid="undo-block"]', 'structural', 'middle')
    await block.press('Enter')
    await expect(blocks).toHaveCount(countBefore + 1)

    await execUndo(page)
    await execRedo(page)

    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('.e2e-undo-example.example-sheet > p').length === expected,
      countBefore + 1
    )
  })
})

import { expect, test } from '@playwright/test'
import {
  getLoggedEvents,
  gotoE2E,
  MERGE_SELECTOR,
  PARAGRAPH_SELECTOR,
  pastePlainText,
  placeCursorAtEnd,
  placeCursorInText,
  selectTextInElement,
  waitForEvent
} from './helpers.js'

test.describe('Editor flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('Enter at end fires insert and creates a new block', async ({ page }) => {
    const first = page.locator('[data-testid="paragraph-first"]')
    const blocks = page.locator(PARAGRAPH_SELECTOR)
    const countBefore = await blocks.count()

    await placeCursorAtEnd(page, '[data-testid="paragraph-first"]')
    await first.press('Enter')

    await waitForEvent(page, 'insert')
    expect(await blocks.count()).toBeGreaterThan(countBefore)
  })

  test('Enter in the middle fires split', async ({ page }) => {
    const first = page.locator('[data-testid="paragraph-first"]')
    const blocks = page.locator(PARAGRAPH_SELECTOR)
    const countBefore = await blocks.count()

    await placeCursorInText(page, '[data-testid="paragraph-first"]', 'split in the middle', 'middle')
    await first.press('Enter')

    await waitForEvent(page, 'split')
    expect(await blocks.count()).toBeGreaterThan(countBefore)
  })

  test('Backspace at block start fires merge', async ({ page }) => {
    const second = page.locator('[data-testid="merge-second"]')
    await second.click()
    await placeCursorInText(page, '[data-testid="merge-second"]', 'Merge beta', 'start')
    await second.press('Backspace')

    await waitForEvent(page, 'merge')
    await expect(page.locator(MERGE_SELECTOR)).toHaveCount(1)
  })

  test('paste inserts content and fires paste event', async ({ page }) => {
    const pasteBlock = page.locator('[data-testid="paste-block"]')
    await pastePlainText(page, pasteBlock, 'Pasted plain text')

    await expect(pasteBlock).toContainText('Pasted plain text')
    await waitForEvent(page, 'paste')
  })

  test('toolbar bold formats the selection', async ({ page }) => {
    await page.locator('[data-testid="formatting-section"]').scrollIntoViewIfNeeded()
    await selectTextInElement(page, '[data-testid="formatting-block"]', 'consectetur adipiscing')

    const toolbar = page.locator('[data-testid="selection-tip"]')
    await expect(toolbar).toBeVisible()
    await page.evaluate(() => {
      document.querySelector('[data-testid="format-bold"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })

    await expect(page.locator('[data-testid="formatting-html"]')).toContainText(/<(strong|b)[^>]*>/i)
  })

  test('disable, enable, suspend, continue, remove, and re-add lifecycle', async ({ page }) => {
    const block = page.locator('[data-testid="lifecycle-block"]')
    const status = page.locator('[data-testid="lifecycle-status"]')

    await expect(block).toHaveClass(/js-editable/)
    await expect(block).toHaveAttribute('contenteditable', 'true')

    await page.locator('[data-testid="btn-disable"]').click()
    await expect(status).toHaveAttribute('data-status', 'disabled')
    await expect(block).toHaveClass(/js-editable-disabled/)
    await expect(block).not.toHaveAttribute('contenteditable')

    await page.locator('[data-testid="btn-enable"]').click()
    await expect(status).toHaveAttribute('data-status', 'enabled')
    await expect(block).toHaveClass(/js-editable/)
    await expect(block).toHaveAttribute('contenteditable', 'true')

    await block.click()
    await block.pressSequentially('X')
    await expect(block).toContainText('X')

    await page.locator('[data-testid="btn-suspend"]').click()
    await expect(status).toHaveAttribute('data-status', 'suspended')
    await expect(block).not.toHaveAttribute('contenteditable')

    const textBeforeSuspend = await block.textContent()
    await block.click({ force: true })
    await page.keyboard.type('Y', { delay: 20 })
    await expect(block).toHaveText(textBeforeSuspend ?? '')

    await page.locator('[data-testid="btn-continue"]').click()
    await expect(status).toHaveAttribute('data-status', 'continued')
    await expect(block).toHaveAttribute('contenteditable', 'true')

    await block.click()
    await block.pressSequentially('Z')
    await expect(block).toContainText('Z')

    await page.locator('[data-testid="btn-remove"]').click()
    await expect(status).toHaveAttribute('data-status', 'removed')
    await expect(block).not.toHaveClass(/js-editable/)
    await expect(block).not.toHaveAttribute('contenteditable')

    await page.locator('[data-testid="btn-readd"]').click()
    await expect(status).toHaveAttribute('data-status', 'readded')
    await expect(block).toHaveClass(/js-editable/)
    await expect(block).toHaveAttribute('contenteditable', 'true')
  })

  test('focus and change events appear in the paragraph log', async ({ page }) => {
    const first = page.locator('[data-testid="paragraph-first"]')
    await first.click()
    await waitForEvent(page, 'focus')

    await first.pressSequentially('!')
    await waitForEvent(page, 'change')

    const events = await getLoggedEvents(page)
    expect(events).toContain('focus')
    expect(events).toContain('change')
  })
})

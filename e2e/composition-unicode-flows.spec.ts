import { expect, test } from '@playwright/test'
import { dispatchComposingEnter, getScopedEvents, gotoE2E, placeCursorInText } from './helpers.js'

test.describe('Composition flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('Enter during IME composition does not split the block', async ({ page }) => {
    const blocks = page.locator('.e2e-composition-example.example-sheet > p')
    const countBefore = await blocks.count()

    await placeCursorInText(page, '[data-testid="composition-block"]', 'IME guard', 'middle')
    await dispatchComposingEnter(page, '[data-testid="composition-block"]')

    await expect(blocks).toHaveCount(countBefore)
    const events = await getScopedEvents(page, 'composition-log')
    expect(events).not.toContain('split')
    expect(events).not.toContain('insert')
  })
})

test.describe('Unicode flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('emoji, combining marks, and bidirectional text survive editing', async ({ page }) => {
    const block = page.locator('[data-testid="unicode-block"]')
    const emojiText = 'Hello 👋 world'
    const combiningText = 'e\u0301' // é as e + combining acute
    const bidiText = 'English مرحبا text'

    await block.click()
    await block.pressSequentially(`${emojiText} ${combiningText} ${bidiText}`)

    await expect(block).toContainText('👋')
    await expect(block).toContainText('مرحبا')

    const normalized = await block.evaluate((el) => el.textContent?.normalize('NFC') ?? '')
    expect(normalized).toContain('é')
  })

  test('split preserves emoji and bidi content across blocks', async ({ page }) => {
    const block = page.locator('[data-testid="unicode-block"]')
    const blocks = page.locator('.e2e-unicode-example.example-sheet > p')

    await block.click()
    await block.pressSequentially('Left 👋 | Right مرحبا')

    await placeCursorInText(page, '[data-testid="unicode-block"]', 'Left 👋', 'end')
    await block.press('Enter')

    await expect(blocks).toHaveCount(2)
    await expect(blocks.nth(0)).toContainText('👋')
    await expect(blocks.nth(1)).toContainText('مرحبا')
  })
})

import { expect, test } from '@playwright/test'
import { gotoE2E, selectTextInElement } from './helpers.js'

test.describe('Formatting flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('italic shortcut applies emphasis inside nested bold markup', async ({ page }) => {
    await page.locator('[data-testid="nested-formatting-section"]').scrollIntoViewIfNeeded()
    await selectTextInElement(page, '[data-testid="nested-formatting-block"]', 'tail')
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    await page.locator('[data-testid="nested-formatting-block"]').press('Control+i')

    await page.waitForFunction(() => {
      const html =
        document.querySelector('[data-testid="nested-formatting-html"]')?.textContent ?? ''
      return /<(em|i)[^>]*>/i.test(html)
    })

    await expect(page.locator('[data-testid="nested-formatting-html"]')).toContainText(
      /<(em|i)[^>]*>/i
    )
  })

  test('bold toggle applies strong inside nested markup without breaking em', async ({ page }) => {
    await page.locator('[data-testid="nested-formatting-section"]').scrollIntoViewIfNeeded()
    await selectTextInElement(page, '[data-testid="nested-formatting-block"]', 'tail')
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    const toolbar = page.locator('[data-testid="nested-selection-tip"]')
    await expect(toolbar).toBeVisible()

    await page.evaluate(() => {
      document
        .querySelector('[data-testid="format-bold-nested"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const html = await page.locator('[data-testid="nested-formatting-html"]').textContent()
    expect(html).toMatch(/<(strong|b)[^>]*>/i)
    expect(html).toMatch(/<(em|i)[^>]*>/i)
  })
})

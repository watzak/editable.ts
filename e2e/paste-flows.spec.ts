import { expect, test } from '@playwright/test'
import { gotoE2E, pasteHtml, pastePlainText } from './helpers.js'

test.describe('Paste flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('plain text paste inserts into the current block', async ({ page }) => {
    const block = page.locator('[data-testid="multiblock-paste-block"]')
    const blocks = page.locator('.e2e-multiblock-paste.example-sheet > p')

    await pastePlainText(page, block, 'Single plain block paste')

    await expect(blocks).toHaveCount(1)
    await expect(block).toContainText('Single plain block paste')
  })

  test('multi-block HTML paste creates additional blocks', async ({ page }) => {
    const block = page.locator('[data-testid="multiblock-paste-block"]')
    const sheet = page.locator('.e2e-multiblock-paste.example-sheet')

    await pasteHtml(
      page,
      block,
      '<p>Alpha paragraph</p><p>Beta paragraph</p>',
      'Alpha paragraph\n\nBeta paragraph'
    )

    await expect(sheet).toContainText('Alpha paragraph')
    await expect(sheet).toContainText('Beta paragraph')
    await expect(page.locator('.e2e-multiblock-paste.example-sheet > p')).not.toHaveCount(1)
  })

  test('paste security strips javascript: links from HTML paste', async ({ page }) => {
    const block = page.locator('[data-testid="paste-security-block"]')
    const htmlOutput = page.locator('[data-testid="paste-security-html"]')

    await pasteHtml(
      page,
      block,
      '<a href="javascript:alert(1)">click me</a> and <img src="x" onerror="alert(1)">',
      'click me and'
    )

    await page.waitForFunction(() => {
      const html = document.querySelector('[data-testid="paste-security-html"]')?.textContent ?? ''
      return html.length > 0
    })

    const sanitized = await htmlOutput.textContent()
    expect(sanitized).not.toMatch(/javascript:/i)
    expect(sanitized).not.toMatch(/onerror/i)
    await expect(block).toContainText('click me')
  })

  test('paste security blocks data: URLs in href attributes', async ({ page }) => {
    const block = page.locator('[data-testid="paste-security-block"]')

    await pasteHtml(page, block, '<a href="data:text/plain,secret">link</a>', 'link')

    await expect(block).toContainText('link')
    const sanitized = await page.locator('[data-testid="paste-security-html"]').textContent()
    expect(sanitized ?? '').not.toMatch(/data:text\/plain/i)
  })
})

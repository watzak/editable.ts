import { expect, test } from '@playwright/test'
import { getScopedEvents, gotoE2E, waitForScopedEvent } from './helpers.js'

test.describe('Dual instance flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoE2E(page)
  })

  test('two Editable instances emit isolated change events', async ({ page }) => {
    const blockA = page.locator('[data-testid="instance-a-block"]')
    const blockB = page.locator('[data-testid="instance-b-block"]')

    await blockA.click()
    await blockA.pressSequentially('!')
    await waitForScopedEvent(page, 'instance-a-log', 'change-a')

    await blockB.click()
    await blockB.pressSequentially('?')
    await waitForScopedEvent(page, 'instance-b-log', 'change-b')

    const eventsA = await getScopedEvents(page, 'instance-a-log')
    const eventsB = await getScopedEvents(page, 'instance-b-log')

    expect(eventsA).toContain('change-a')
    expect(eventsB).toContain('change-b')
    expect(eventsA).not.toContain('change-b')
    expect(eventsB).not.toContain('change-a')
  })

  test('instances have separate editable classes and do not cross-disable', async ({ page }) => {
    await expect(page.locator('[data-testid="instance-a-block"]')).toHaveClass(/js-editable/)
    await expect(page.locator('[data-testid="instance-b-block"]')).toHaveClass(/js-editable/)

    await page.evaluate(() => {
      const setup = window.__editableE2E as {
        editableA: { disable: (el: Element) => void }
      }
      const blockA = document.querySelector('[data-testid="instance-a-block"]')
      if (blockA) setup.editableA.disable(blockA)
    })

    await expect(page.locator('[data-testid="instance-a-block"]')).toHaveClass(
      /js-editable-disabled/
    )
    await expect(page.locator('[data-testid="instance-b-block"]')).toHaveClass(/js-editable/)
    await expect(page.locator('[data-testid="instance-b-block"]')).toHaveAttribute(
      'contenteditable',
      'true'
    )
  })
})

import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __editableIframeE2E?: {
      editable: { unload: () => void }
      frameWindow: Window
    }
  }
}

test.describe('Iframe editor flows', () => {
  test('splits content inside an iframe-configured Editable instance', async ({ page }) => {
    await page.goto('/examples/e2e-iframe-editor.html', { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__editableIframeE2E != null)

    const frame = page.frameLocator('[data-testid="editor-frame"]')
    const block = frame.locator('[data-testid="iframe-block"]')

    await block.click()
    await page.evaluate(() => {
      const setup = window.__editableIframeE2E
      if (!setup) return

      const blockEl = setup.frameWindow.document.querySelector('[data-testid="iframe-block"]')
      const textNode = blockEl?.firstChild
      if (!blockEl || !textNode || textNode.nodeType !== Node.TEXT_NODE) return

      const range = setup.frameWindow.document.createRange()
      const content = textNode.textContent ?? ''
      const index = content.indexOf('split')
      range.setStart(textNode, index + 2)
      range.collapse(true)
      const selection = setup.frameWindow.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      blockEl.focus()
    })

    await block.press('Enter')
    await page.waitForFunction(() => {
      const log = document.querySelector('[data-testid="iframe-event-log"]')
      return (log?.getAttribute('data-events') ?? '').includes('split')
    })

    await expect(frame.locator('[data-testid="iframe-block"]')).toHaveCount(2)
  })
})

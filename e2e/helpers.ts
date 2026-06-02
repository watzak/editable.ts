import type { Locator, Page } from '@playwright/test'

declare global {
  interface Window {
    __editableE2E?: unknown
  }
}

export const E2E_PATH = '/examples/e2e-editor-flows.html'
export const PARAGRAPH_SELECTOR = '.e2e-paragraph-example.example-sheet > p'
export const MERGE_SELECTOR = '.e2e-merge-example.example-sheet > p'

export async function gotoE2E(page: Page) {
  await page.goto(E2E_PATH, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__editableE2E != null)
  await page.waitForSelector('[data-testid="paragraph-first"]')
}

export async function getLoggedEvents(page: Page): Promise<string[]> {
  const raw = await page.locator('[data-testid="event-log"]').getAttribute('data-events')
  if (!raw) return []
  return raw.split(',').filter(Boolean)
}

export async function waitForEvent(page: Page, name: string, timeout = 10_000) {
  await page.waitForFunction(
    (eventName) => {
      const log = document.querySelector('[data-testid="event-log"]')
      const events = log?.getAttribute('data-events') ?? ''
      return events.split(',').includes(eventName)
    },
    name,
    { timeout }
  )
}

export async function placeCursorAtEnd(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return

    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    el.focus()
    document.dispatchEvent(new Event('selectionchange'))
  }, selector)
}

export async function placeCursorInText(
  page: Page,
  selector: string,
  phrase: string,
  position: 'start' | 'middle' | 'end'
) {
  await page.evaluate(
    ({ sel, text, pos }) => {
      const el = document.querySelector(sel)
      const textNode = el?.firstChild
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return

      const content = textNode.textContent ?? ''
      const index = content.indexOf(text)
      if (index < 0) return

      let offset = index
      if (pos === 'middle') offset = index + Math.floor(text.length / 2)
      if (pos === 'end') offset = index + text.length

      const range = document.createRange()
      range.setStart(textNode, offset)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      el?.focus()
      document.dispatchEvent(new Event('selectionchange'))
    },
    { sel: selector, text: phrase, pos: position }
  )
}

export async function selectTextInElement(page: Page, selector: string, phrase: string) {
  await page.evaluate(
    ({ sel, text }) => {
      const el = document.querySelector(sel)
      const textNode = el?.firstChild
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return

      const content = textNode.textContent ?? ''
      const start = content.indexOf(text)
      if (start < 0) return

      const range = document.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + text.length)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      el?.focus()
      document.dispatchEvent(new Event('selectionchange'))
    },
    { sel: selector, text: phrase }
  )
}

export async function pastePlainText(page: Page, target: Locator, text: string) {
  await target.click()
  await page.evaluate((plainText) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', plainText)
    const event = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    })
    document.activeElement?.dispatchEvent(event)
  }, text)
}

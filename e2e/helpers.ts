import type { Locator, Page } from '@playwright/test'

declare global {
  interface Window {
    __editableE2E?: {
      simulatePaste: (testId: string, clipboardContent: string) => boolean
    }
  }
}

export const E2E_PATH = '/examples/e2e-editor-flows.html'
export const PARAGRAPH_SELECTOR = '.e2e-paragraph-example.example-sheet > p'
export const MERGE_SELECTOR = '.e2e-merge-example.example-sheet > p'
export const UNDO_SELECTOR = '.e2e-undo-example.example-sheet > p'

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

export async function getScopedEvents(page: Page, testId: string): Promise<string[]> {
  const raw = await page.locator(`[data-testid="${testId}"]`).getAttribute('data-events')
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

export async function waitForScopedEvent(
  page: Page,
  logTestId: string,
  name: string,
  timeout = 10_000
) {
  await page.waitForFunction(
    ({ logId, eventName }) => {
      const log = document.querySelector(`[data-testid="${logId}"]`)
      const events = log?.getAttribute('data-events') ?? ''
      return events.split(',').includes(eventName)
    },
    { logId: logTestId, eventName: name },
    { timeout }
  )
}

export async function waitForLifecycleStatus(page: Page, status: string, timeout = 10_000) {
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('[data-testid="lifecycle-status"]')
      return el?.getAttribute('data-status') === expected
    },
    status,
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
      if (!el) return

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let textNode: Node | null = null
      let node: Node | null
      while ((node = walker.nextNode())) {
        const content = node.textContent ?? ''
        if (content.includes(text)) {
          textNode = node
          break
        }
      }

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
      el.focus()
      document.dispatchEvent(new Event('selectionchange'))
    },
    { sel: selector, text: phrase, pos: position }
  )
}

export async function selectTextInElement(page: Page, selector: string, phrase: string) {
  await page.evaluate(
    ({ sel, text }) => {
      const el = document.querySelector(sel)
      if (!el) return

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let textNode: Node | null = null
      let node: Node | null
      while ((node = walker.nextNode())) {
        const content = node.textContent ?? ''
        if (content.includes(text)) {
          textNode = node
          break
        }
      }

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
      el.focus()
      document.dispatchEvent(new Event('selectionchange'))
    },
    { sel: selector, text: phrase }
  )
}

export async function pastePlainText(page: Page, target: Locator, text: string) {
  const testId = await target.getAttribute('data-testid')
  if (!testId) throw new Error('paste target requires data-testid')
  await target.click()

  await page.waitForFunction(
    ({ blockTestId, plainText }) => {
      const el = document.querySelector(`[data-testid="${blockTestId}"]`) as HTMLElement | null
      if (!el) return false

      const before = el.textContent ?? ''
      el.focus()
      const dt = new DataTransfer()
      dt.setData('text/plain', plainText)
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      })
      el.dispatchEvent(event)

      if ((el.textContent ?? '') !== before) return true
      return window.__editableE2E?.simulatePaste(blockTestId, plainText) === true
    },
    { blockTestId: testId, plainText: text }
  )
}

export async function pasteHtml(page: Page, target: Locator, html: string, plainText?: string) {
  const testId = await target.getAttribute('data-testid')
  if (!testId) throw new Error('paste target requires data-testid')
  const expectedPlain = (plainText ?? html.replace(/<[^>]+>/g, '')).trim().split(/\s+/)[0] ?? ''
  await target.click()

  await page.waitForFunction(
    ({ blockTestId, htmlContent, plain, snippet }) => {
      const el = document.querySelector(`[data-testid="${blockTestId}"]`) as HTMLElement | null
      if (!el) return false

      const before = el.textContent ?? ''
      el.focus()
      const dt = new DataTransfer()
      dt.setData('text/html', htmlContent)
      if (plain) dt.setData('text/plain', plain)
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      })
      el.dispatchEvent(event)

      if ((el.textContent ?? '') !== before) return true
      const content = htmlContent || plain || ''
      if (window.__editableE2E?.simulatePaste(blockTestId, content) !== true) return false
      return (el.textContent ?? '').includes(snippet)
    },
    { blockTestId: testId, htmlContent: html, plain: plainText, snippet: expectedPlain }
  )
}

export async function dispatchComposingEnter(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return

    el.focus()
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true
      })
    )
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'test' }))
  }, selector)
}

export async function execUndo(page: Page) {
  await page.evaluate(() => {
    document.execCommand('undo')
  })
}

export async function execRedo(page: Page) {
  await page.evaluate(() => {
    document.execCommand('redo')
  })
}

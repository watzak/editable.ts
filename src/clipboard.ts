import config from './config.js'
import type { Config } from './config.js'
import * as string from './util/string.js'
import * as nodeType from './node-type.js'
import * as quotes from './quotes.js'
import { isPlainTextBlock } from './block.js'
import { compilePasteRules, type PasteRules } from './paste-rules.js'
import type Cursor from './cursor.js'
import type Selection from './selection.js'

const whitespaceOnly = /^\s*$/
const blockPlaceholder = '<!-- BLOCK -->'
const URL_ATTRIBUTES = new Set(['href'])
const ALLOWED_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
const BLOCKED_URL_PROTOCOLS = new Set(['javascript', 'data', 'vbscript', 'file'])
const LEADING_URL_WHITESPACE = /^[\s\u0000-\u001f\u007f]+/
const URL_CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const URL_PROTOCOL_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

interface FilterOptions {
  allowedElements: Record<string, Record<string, boolean>>
  keepInternalRelativeLinks: boolean
}

interface ParseContext {
  pasteRules: PasteRules
  plainText: boolean
}

let defaultPasteRules: PasteRules = compilePasteRules(config)

updateConfig(config)
export function updateConfig(conf: Config): void {
  defaultPasteRules = compilePasteRules(conf)
}

export function paste(
  block: HTMLElement,
  cursor: Cursor | Selection,
  clipboardContent: string,
  pasteRules: PasteRules = defaultPasteRules
): { blocks: string[]; cursor: Cursor | Selection } {
  const document = block.ownerDocument
  block.setAttribute(pasteRules.pastingAttribute, 'true')

  if (cursor.isSelection) {
    const selection = cursor as Selection
    cursor = selection.deleteExactSurroundingTags().deleteContainedTags().deleteContent()
  }

  // Create a placeholder to help parse HTML
  const pasteHolder = document.createElement('div')
  pasteHolder.innerHTML = clipboardContent

  const isPlainText = isPlainTextBlock(block)
  const blocks = parseContent(pasteHolder, { plainText: isPlainText, pasteRules })

  block.removeAttribute(pasteRules.pastingAttribute)
  return { blocks, cursor }
}

/**
 * - Parse pasted content
 * - Split it up into blocks
 * - clean and normalize every block
 * - optionally strip the host location an anchorTag-href
 *   www.livindocs.io/internalLink -> /internalLink
 *
 * @param {DOM node} A container where the pasted content is located.
 * @returns {Array of Strings} An array of cleaned innerHTML like strings.
 */
export function parseContent(
  element: HTMLElement,
  {
    plainText = false,
    pasteRules = defaultPasteRules
  }: { plainText?: boolean; pasteRules?: PasteRules } = {}
): string[] {
  const context: ParseContext = { pasteRules, plainText }
  const options: FilterOptions = {
    allowedElements: plainText ? pasteRules.allowedPlainTextElements : pasteRules.allowedElements,
    keepInternalRelativeLinks: plainText ? false : pasteRules.keepInternalRelativeLinks
  }

  // Filter pasted content
  return (
    filterHtmlElements(element, options, context)
      // Handle Blocks
      .split(blockPlaceholder)
      .map((entry: string) =>
        string.trim(cleanWhitespace(replaceAllQuotes(entry, pasteRules.replaceQuotes)))
      )
      .filter((entry: string) => !whitespaceOnly.test(entry))
  )
}

function filterHtmlElements(
  elem: HTMLElement,
  options: FilterOptions,
  context: ParseContext
): string {
  const { pasteRules } = context

  return Array.from(elem.childNodes).reduce<string>((content: string, child: Node) => {
    if (pasteRules.blacklistedElements.indexOf(child.nodeName.toLowerCase()) !== -1) {
      return ''
    }

    const childElement = child as Element

    // Keep internal relative links relative (on paste).
    if (
      options.keepInternalRelativeLinks &&
      childElement.nodeName === 'A' &&
      (childElement as HTMLAnchorElement).href
    ) {
      const hrefAttr = childElement.getAttribute('href')
      if (hrefAttr) {
        const origin = childElement.ownerDocument.defaultView?.location.origin
        if (origin) {
          const stripInternalHost = hrefAttr.replace(origin, '')
          childElement.setAttribute('href', stripInternalHost)
        }
      }
    }

    if (child.nodeType === nodeType.elementNode) {
      const childContent = filterHtmlElements(childElement as HTMLElement, options, context)
      return (
        content + conditionalNodeWrap(childElement as HTMLElement, childContent, options, context)
      )
    }

    // Escape HTML characters <, > and &
    if (child.nodeType === nodeType.textNode) {
      return content + string.escapeHtml((child as Text).nodeValue || '')
    }
    return content
  }, '')
}

function conditionalNodeWrap(
  child: HTMLElement,
  content: string,
  options: FilterOptions,
  context: ParseContext
): string {
  const { pasteRules } = context
  let nodeName = child.nodeName.toLowerCase()
  nodeName = transformNodeName(nodeName, pasteRules.transformElements)

  if (shouldKeepNode(nodeName, child, options, pasteRules)) {
    const doc = child.ownerDocument

    if (nodeName === 'br') {
      const element = doc.createElement('br')
      if (!applyAllowedAttributes(element, nodeName, child, options, pasteRules)) {
        return content
      }
      return element.outerHTML
    }

    if (!whitespaceOnly.test(content)) {
      const element = doc.createElement(nodeName)
      if (!applyAllowedAttributes(element, nodeName, child, options, pasteRules)) {
        return unwrapFilteredNode(nodeName, content, pasteRules)
      }
      appendSanitizedHtml(element, content, doc)
      return element.outerHTML
    }

    return content
  }

  if (pasteRules.splitIntoBlocks[nodeName]) {
    return blockPlaceholder + content + blockPlaceholder
  }

  // prevent missing whitespace between text when block-level
  // elements are removed.
  if (pasteRules.blockLevelElements[nodeName]) return `${content} `

  return content
}

function decodeUrlAttributeValue(value: string, doc: Document): string {
  const textarea = doc.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value.replace(URL_CONTROL_CHARS, '').replace(LEADING_URL_WHITESPACE, '')
}

function extractUrlProtocol(url: string): string | null {
  const match = url.match(URL_PROTOCOL_PATTERN)
  return match ? match[1].toLowerCase() : null
}

function isAllowedUrl(value: string, doc: Document): boolean {
  const normalized = decodeUrlAttributeValue(value, doc)
  if (!normalized) return false

  if (normalized.startsWith('#') || normalized.startsWith('?')) return true
  if (normalized.startsWith('//')) return true

  const protocol = extractUrlProtocol(normalized)
  if (!protocol) return true
  if (BLOCKED_URL_PROTOCOLS.has(protocol)) return false

  return ALLOWED_URL_PROTOCOLS.has(protocol)
}

function sanitizeUrlAttribute(value: string, doc: Document): string | null {
  if (!isAllowedUrl(value, doc)) return null
  return decodeUrlAttributeValue(value, doc)
}

function normalizeRelForBlankTarget(rel: string | undefined): string {
  const tokens = new Set((rel || '').split(/\s+/).filter(Boolean))
  tokens.add('noopener')
  tokens.add('noreferrer')
  return Array.from(tokens).join(' ')
}

function applyAllowedAttributes(
  target: Element,
  nodeName: string,
  source: Element,
  options: FilterOptions,
  pasteRules: PasteRules
): boolean {
  const allowed = options.allowedElements[nodeName]
  if (!allowed) return true

  let targetValue: string | undefined
  let relValue: string | undefined
  let hrefApplied = false

  for (const attr of source.attributes) {
    const name = attr.name.toLowerCase()
    if (!allowed[name]) continue

    let value = attr.value
    if (!value) continue

    if (URL_ATTRIBUTES.has(name)) {
      const sanitized = sanitizeUrlAttribute(value, source.ownerDocument)
      if (sanitized === null) continue
      value = sanitized
      if (name === 'href') hrefApplied = true
    }

    if (name === 'target') targetValue = value
    if (name === 'rel') relValue = value

    target.setAttribute(name, value)
  }

  const required = pasteRules.requiredAttributes[nodeName]
  if (required?.includes('href') && !hrefApplied) return false

  if (targetValue === '_blank') {
    target.setAttribute('rel', normalizeRelForBlankTarget(relValue))
  }

  return true
}

function appendSanitizedHtml(element: Element, html: string, doc: Document): void {
  const container = doc.createElement('div')
  container.innerHTML = html
  while (container.firstChild) {
    element.appendChild(container.firstChild)
  }
}

function unwrapFilteredNode(nodeName: string, content: string, pasteRules: PasteRules): string {
  if (pasteRules.splitIntoBlocks[nodeName]) {
    return blockPlaceholder + content + blockPlaceholder
  }
  if (pasteRules.blockLevelElements[nodeName]) return `${content} `
  return content
}

function transformNodeName(nodeName: string, transformElements: Record<string, string>): string {
  return transformElements[nodeName] || nodeName
}

function hasRequiredAttributes(
  nodeName: string,
  node: Element,
  requiredAttributes: Record<string, string[]>
): boolean {
  const requiredAttrs = requiredAttributes[nodeName]
  if (!requiredAttrs) return true

  return !requiredAttrs.some((name: string) => !node.getAttribute(name))
}

function shouldKeepNode(
  nodeName: string,
  node: Element,
  options: FilterOptions,
  pasteRules: PasteRules
): boolean {
  return (
    !!options.allowedElements[nodeName] &&
    hasRequiredAttributes(nodeName, node, pasteRules.requiredAttributes)
  )
}

function cleanWhitespace(str: string): string {
  return str
    .replace(/\n/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(
      /(.)\u00A0/g,
      (match: string, group: string) => group + (/[\u0020]/.test(group) ? '\u00A0' : ' ')
    )
}

function replaceAllQuotes(str: string, replaceQuotes: PasteRules['replaceQuotes']): string {
  if (replaceQuotes.quotes || replaceQuotes.singleQuotes || replaceQuotes.apostrophe) {
    return quotes.replaceAllQuotes(str, replaceQuotes)
  }

  return str
}

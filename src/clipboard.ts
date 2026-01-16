import config from './config.js'
import type {Config} from './config.js'
import * as string from './util/string.js'
import * as nodeType from './node-type.js'
import * as quotes from './quotes.js'
import {isPlainTextBlock} from './block.js'
import type Cursor from './cursor.js'
import type Selection from './selection.js'

let allowedElements: Record<string, Record<string, boolean>>
let allowedPlainTextElements: Record<string, Record<string, boolean>>
let requiredAttributes: Record<string, string[]>
let transformElements: Record<string, string>
let blockLevelElements: Record<string, boolean>
let replaceQuotes: {quotes?: string[], singleQuotes?: string[], apostrophe?: string}
let splitIntoBlocks: Record<string, boolean>
let blacklistedElements: string[]
const whitespaceOnly = /^\s*$/
const blockPlaceholder = '<!-- BLOCK -->'
let keepInternalRelativeLinks: boolean

interface FilterOptions {
  allowedElements: Record<string, Record<string, boolean>>
  keepInternalRelativeLinks: boolean
}

updateConfig(config)
export function updateConfig (conf: Config): void {
  const rules = conf.pastedHtmlRules
  allowedElements = rules.allowedElements || {}
  allowedPlainTextElements = rules.allowedPlainTextElements || {}
  requiredAttributes = rules.requiredAttributes || {}
  transformElements = rules.transformElements || {}
  blacklistedElements = rules.blacklistedElements || []
  keepInternalRelativeLinks = rules.keepInternalRelativeLinks || false
  replaceQuotes = rules.replaceQuotes || {}

  blockLevelElements = {}
  rules.blockLevelElements.forEach((name: string) => { blockLevelElements[name] = true })
  splitIntoBlocks = {}
  rules.splitIntoBlocks.forEach((name: string) => { splitIntoBlocks[name] = true })
}

export function paste (block: HTMLElement, cursor: Cursor | Selection, clipboardContent: string): {blocks: string[], cursor: Cursor | Selection} {
  const document = block.ownerDocument
  block.setAttribute(config.pastingAttribute, 'true')

  if (cursor.isSelection) {
    const selection = cursor as Selection
    cursor = selection.deleteExactSurroundingTags()
      .deleteContainedTags()
      .deleteContent()
  }

  // Create a placeholder to help parse HTML
  const pasteHolder = document.createElement('div')
  pasteHolder.innerHTML = clipboardContent

  const isPlainText = isPlainTextBlock(block)
  const blocks = parseContent(pasteHolder, {plainText: isPlainText})

  block.removeAttribute(config.pastingAttribute)
  return {blocks, cursor}
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
export function parseContent (element: HTMLElement, {plainText = false}: {plainText?: boolean} = {}): string[] {
  const options: FilterOptions = {
    allowedElements: plainText ? allowedPlainTextElements : allowedElements,
    keepInternalRelativeLinks: plainText ? false : keepInternalRelativeLinks
  }

  // Filter pasted content
  return filterHtmlElements(element, options)
  // Handle Blocks
    .split(blockPlaceholder)
    .map((entry: string) => string.trim(cleanWhitespace(replaceAllQuotes(entry))))
    .filter((entry: string) => !whitespaceOnly.test(entry))
}

function filterHtmlElements (elem: HTMLElement, options: FilterOptions): string {
  return Array.from(elem.childNodes).reduce<string>((content: string, child: Node) => {
    if (blacklistedElements.indexOf(child.nodeName.toLowerCase()) !== -1) {
      return ''
    }

    const childElement = child as Element

    // Keep internal relative links relative (on paste).
    if (options.keepInternalRelativeLinks && childElement.nodeName === 'A' && (childElement as HTMLAnchorElement).href) {
      const hrefAttr = childElement.getAttribute('href')
      if (hrefAttr) {
        const stripInternalHost = hrefAttr.replace(window.location.origin, '')
        childElement.setAttribute('href', stripInternalHost)
      }
    }

    if (child.nodeType === nodeType.elementNode) {
      const childContent = filterHtmlElements(childElement as HTMLElement, options)
      return content + conditionalNodeWrap(childElement as HTMLElement, childContent, options)
    }

    // Escape HTML characters <, > and &
    if (child.nodeType === nodeType.textNode) {
      return content + string.escapeHtml((child as Text).nodeValue || '')
    }
    return content
  }, '')
}

function conditionalNodeWrap (child: HTMLElement, content: string, options: FilterOptions): string {
  let nodeName = child.nodeName.toLowerCase()
  nodeName = transformNodeName(nodeName)

  if (shouldKeepNode(nodeName, child, options)) {
    const attributes = filterAttributes(nodeName, child)

    if (nodeName === 'br') return `<${nodeName + attributes}>`

    if (!whitespaceOnly.test(content)) {
      return `<${nodeName + attributes}>${content}</${nodeName}>`
    }

    return content
  }

  if (splitIntoBlocks[nodeName]) {
    return blockPlaceholder + content + blockPlaceholder
  }

  // prevent missing whitespace between text when block-level
  // elements are removed.
  if (blockLevelElements[nodeName]) return `${content} `

  return content
}

// returns string of concatenated attributes e.g. 'target="_blank" rel="nofollow" href="/test.com"'
function filterAttributes (nodeName: string, node: Element): string {
  return Array.from(node.attributes).reduce<string>((attributes: string, attr: Attr) => {
    const name = attr.name
    const value = attr.value
    if (allowedElements[nodeName]?.[name] && value) {
      return `${attributes} ${name}="${value}"`
    }
    return attributes
  }, '')
}

function transformNodeName (nodeName: string): string {
  return transformElements[nodeName] || nodeName
}

function hasRequiredAttributes (nodeName: string, node: Element): boolean {
  const requiredAttrs = requiredAttributes[nodeName]
  if (!requiredAttrs) return true

  return !requiredAttrs.some((name: string) => !node.getAttribute(name))
}

function shouldKeepNode (nodeName: string, node: Element, options: FilterOptions): boolean {
  return !!options.allowedElements[nodeName] && hasRequiredAttributes(nodeName, node)
}

function cleanWhitespace (str: string): string {
  return str
    .replace(/\n/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/(.)\u00A0/g, (match: string, group: string) => group + (/[\u0020]/.test(group)
      ? '\u00A0'
      : ' '
    ))
}

function replaceAllQuotes (str: string): string {
  if (replaceQuotes.quotes || replaceQuotes.singleQuotes || replaceQuotes.apostrophe) {
    return quotes.replaceAllQuotes(str, replaceQuotes)
  }

  return str
}

import NodeIterator from '../node-iterator.js'
import * as nodeType from '../node-type.js'
import { getBlockOperationText, stripInternalChars } from '../operation-text-model.js'
import { OPERATION_LINE_BREAK } from '../operation-types.js'
import type { TextAttributes } from '../operation-types.js'
import type * as Y from 'yjs'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'

export interface TextRun {
  text: string
  attributes: TextAttributes
}

function pushRun(runs: TextRun[], text: string, attributes: TextAttributes): void {
  if (!text) return
  const last = runs[runs.length - 1]
  if (last && attributesEqual(last.attributes, attributes)) {
    last.text += text
    return
  }
  runs.push({ text, attributes: { ...attributes } })
}

function attributesEqual(a: TextAttributes, b: TextAttributes): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false
  }
  return true
}

function inlineElementStack(node: Node, host: HTMLElement): Element[] {
  const stack: Element[] = []
  let current: Node | null = node.parentNode
  while (current && current !== host) {
    if (current.nodeType === nodeType.elementNode) {
      stack.unshift(current as Element)
    }
    current = current.parentNode
  }
  return stack
}

/** True when the host DOM still carries inline markup tags. */
export function hostDomHasFormattingMarkup(host: HTMLElement): boolean {
  return Boolean(host.querySelector('strong, b, em, i, u, a[href]'))
}

function collectTextRunsViaNodeIterator(
  host: HTMLElement,
  registry: InlineFormatRegistry
): TextRun[] {
  const doc = host.ownerDocument!
  const runs: TextRun[] = []
  const iterator = new NodeIterator(host)
  let next: Node | undefined

  while ((next = iterator.getNext())) {
    if (next.nodeType === nodeType.elementNode) {
      const element = next as Element
      if (element.nodeName === 'BR') {
        pushRun(
          runs,
          OPERATION_LINE_BREAK,
          registry.readDomStack(inlineElementStack(element, host), doc)
        )
      }
      continue
    }

    if (next.nodeType === nodeType.textNode) {
      const data = stripInternalChars((next as Text).data)
      if (!data) continue
      pushRun(runs, data, registry.readDomStack(inlineElementStack(next, host), doc))
    }
  }

  return runs
}

/** TreeWalker fallback when NodeIterator misses inline tags on live editable hosts. */
function collectTextRunsViaTreeWalker(
  host: HTMLElement,
  registry: InlineFormatRegistry
): TextRun[] {
  const doc = host.ownerDocument!
  const runs: TextRun[] = []
  const walker = doc.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null

  while (node) {
    const data = stripInternalChars(node.data)
    if (data) {
      pushRun(runs, data, registry.readDomStack(inlineElementStack(node, host), doc))
    }
    node = walker.nextNode() as Text | null
  }

  return runs
}

function runsHaveInlineAttributes(runs: readonly TextRun[]): boolean {
  return runs.some((run) => Object.keys(run.attributes).length > 0)
}

/** Walks a block host and returns contiguous text runs with canonical attributes. */
export function getBlockTextRuns(
  host: HTMLElement,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): TextRun[] {
  const viaIterator = collectTextRunsViaNodeIterator(host, registry)
  if (runsHaveInlineAttributes(viaIterator) || !hostDomHasFormattingMarkup(host)) {
    return viaIterator
  }

  const viaTreeWalker = collectTextRunsViaTreeWalker(host, registry)
  if (runsHaveInlineAttributes(viaTreeWalker)) {
    return viaTreeWalker
  }

  return viaIterator
}

/**
 * Applies inline formats from markup tags when run extraction produced plain text only.
 * Matches each formatted element's operation text within the canonical block string.
 */
export function applyHostInlineMarkupToYText(
  yText: Y.Text,
  host: HTMLElement,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  if (!hostDomHasFormattingMarkup(host)) return false

  const plain = getBlockOperationText(host)
  if (yText.toString() !== plain) return false

  let applied = false
  const tagFormats: Array<{
    selector: string
    key: 'bold' | 'italic' | 'underline'
  }> = [
    { selector: 'strong, b', key: 'bold' },
    { selector: 'em, i', key: 'italic' },
    { selector: 'u', key: 'underline' }
  ]

  for (const { selector, key } of tagFormats) {
    for (const element of host.querySelectorAll(selector)) {
      if (!host.contains(element)) continue
      const text = stripInternalChars(element.textContent ?? '')
      if (!text) continue

      const format = registry.toYTextFormatMap({ [key]: true }, doc)
      if (Object.keys(format).length === 0) continue

      let searchFrom = 0
      while (searchFrom < plain.length) {
        const start = plain.indexOf(text, searchFrom)
        if (start < 0) break
        yText.format(start, text.length, format)
        applied = true
        searchFrom = start + text.length
      }
    }
  }

  return applied
}

export function textRunsToPlainText(runs: readonly TextRun[]): string {
  return runs.map((run) => run.text).join('')
}

/** Builds toggle-resulting attributes for a format key over `[start, end)`. */
export function buildToggleFormatAttributes(
  runs: readonly TextRun[],
  start: number,
  end: number,
  key: 'bold' | 'italic' | 'underline',
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): TextAttributes {
  const uniform = registry.spanHasUniformFormat(runs, start, end, key)
  return { [key]: uniform ? null : true }
}

export function buildLinkFormatAttributes(
  href: string,
  doc: Document,
  attrs: { rel?: string; target?: string } = {},
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): TextAttributes | null {
  const codec = registry.getCodec('link')
  if (!codec) return null
  const raw = {
    href,
    ...(attrs.target ? { target: attrs.target } : {}),
    ...(attrs.rel ? { rel: attrs.rel } : {})
  } as Record<string, string>
  const sanitized = codec.sanitizeYjsValue(raw, doc)
  if (sanitized === null) return null
  return { link: sanitized }
}

import NodeIterator from './node-iterator.js'
import * as nodeType from './node-type.js'
import { stripInternalChars } from './operation-text-model.js'
import { OPERATION_LINE_BREAK } from './operation-types.js'
import type { TextAttributes } from './operation-types.js'
import {
  defaultInlineFormatRegistry,
  type FormatKey,
  type InlineFormatRegistry
} from './inline-format-codec.js'

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

/** True when the host DOM still carries registered inline markup tags. */
export function hostDomHasFormattingMarkup(
  host: HTMLElement,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  const selector = registry.domFormattingSelectors()
  return selector ? Boolean(host.querySelector(selector)) : false
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
  if (runsHaveInlineAttributes(viaIterator) || !hostDomHasFormattingMarkup(host, registry)) {
    return viaIterator
  }

  const viaTreeWalker = collectTextRunsViaTreeWalker(host, registry)
  if (runsHaveInlineAttributes(viaTreeWalker)) {
    return viaTreeWalker
  }

  return viaIterator
}

export function textRunsToPlainText(runs: readonly TextRun[]): string {
  return runs.map((run) => run.text).join('')
}

/** Builds toggle-resulting attributes for a format key over `[start, end)`. */
export function buildToggleFormatAttributes(
  runs: readonly TextRun[],
  start: number,
  end: number,
  key: FormatKey,
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

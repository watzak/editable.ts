import { isPlainTextBlock } from './block.js'
import {
  buildLinkFormatAttributes,
  buildToggleFormatAttributes,
  getBlockTextRuns
} from './yjs/dom-text-runs.js'
import { defaultInlineFormatRegistry, type FormatYjsKey } from './yjs/inline-format-codec.js'
import { captureSelectionSnapshot, selectionSpan } from './operation-selection.js'
import type { EditableOperation, SelectionSnapshot, TextAttributes } from './operation-types.js'
import type Selection from './selection.js'

export type ToggleFormatKey = 'bold' | 'italic' | 'underline'

export function buildToggleFormatOperation(
  host: HTMLElement,
  selectionBefore: SelectionSnapshot,
  formatKey: ToggleFormatKey
): EditableOperation | null {
  if (isPlainTextBlock(host)) return null

  const { start, end } = selectionSpan(selectionBefore)
  const length = end - start
  if (length <= 0) return null

  const runs = getBlockTextRuns(host)
  const attributes = buildToggleFormatAttributes(runs, start, end, formatKey)
  return { type: 'setTextAttributes', index: start, length, attributes }
}

export function buildLinkOperation(
  host: HTMLElement,
  selectionBefore: SelectionSnapshot,
  href: string,
  attrs: { rel?: string; target?: string } = {}
): EditableOperation | null {
  if (isPlainTextBlock(host)) return null

  const { start, end } = selectionSpan(selectionBefore)
  const length = end - start
  if (length <= 0) return null

  const doc = host.ownerDocument!
  const attributes = buildLinkFormatAttributes(href, doc, attrs)
  if (!attributes) return null

  return { type: 'setTextAttributes', index: start, length, attributes }
}

export function buildUnlinkOperation(
  host: HTMLElement,
  selectionBefore: SelectionSnapshot
): EditableOperation | null {
  if (isPlainTextBlock(host)) return null

  const { start, end } = selectionSpan(selectionBefore)
  const length = end - start
  if (length <= 0) return null

  return {
    type: 'setTextAttributes',
    index: start,
    length,
    attributes: { link: null }
  }
}

export function captureSelectionBeforeFormat(selection: Selection): SelectionSnapshot | undefined {
  return captureSelectionSnapshot(selection.host, selection)
}

/** Reads resulting format state on `[start, end)` after a DOM mutation. */
export function readUniformFormatAttributes(
  host: HTMLElement,
  start: number,
  end: number,
  keys: readonly FormatYjsKey[]
): TextAttributes {
  const runs = getBlockTextRuns(host)
  const attributes: TextAttributes = {}
  for (const key of keys) {
    if (defaultInlineFormatRegistry.spanHasUniformFormat(runs, start, end, key)) {
      const sample = sampleAttributeValue(runs, start, key)
      if (sample !== undefined) attributes[key] = sample
    }
  }
  return attributes
}

function sampleAttributeValue(
  runs: ReturnType<typeof getBlockTextRuns>,
  index: number,
  key: FormatYjsKey
): TextAttributes[string] | undefined {
  let offset = 0
  for (const run of runs) {
    const next = offset + run.text.length
    if (index >= offset && index < next) {
      return run.attributes[key]
    }
    offset = next
  }
  return undefined
}

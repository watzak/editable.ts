import { isPlainTextBlock } from './block.js'
import {
  buildLinkFormatAttributes,
  buildToggleFormatAttributes,
  getBlockTextRuns
} from './dom-text-runs.js'
import { getHostFormatRegistry, isFormatAllowed } from './host-policy.js'
import type { FormatKey } from './inline-format-codec.js'
import { captureSelectionSnapshot, selectionSpan } from './operation-selection.js'
import type { EditableOperation, SelectionSnapshot, TextAttributes } from './operation-types.js'
import type Selection from './selection.js'

export type ToggleFormatKey = 'bold' | 'italic' | 'underline' | 'superscript' | 'subscript'

export function buildToggleFormatOperation(
  host: HTMLElement,
  selectionBefore: SelectionSnapshot,
  formatKey: ToggleFormatKey | FormatKey
): EditableOperation | null {
  if (isPlainTextBlock(host)) return null
  if (!isFormatAllowed(host, formatKey)) return null

  const { start, end } = selectionSpan(selectionBefore)
  const length = end - start
  if (length <= 0) return null

  const registry = getHostFormatRegistry(host)
  const runs = getBlockTextRuns(host, registry)
  const attributes = buildToggleFormatAttributes(runs, start, end, formatKey, registry)
  return { type: 'setTextAttributes', index: start, length, attributes }
}

export function buildLinkOperation(
  host: HTMLElement,
  selectionBefore: SelectionSnapshot,
  href: string,
  attrs: { rel?: string; target?: string } = {}
): EditableOperation | null {
  if (isPlainTextBlock(host)) return null
  if (!isFormatAllowed(host, 'link')) return null

  const { start, end } = selectionSpan(selectionBefore)
  const length = end - start
  if (length <= 0) return null

  const doc = host.ownerDocument!
  const registry = getHostFormatRegistry(host)
  const attributes = buildLinkFormatAttributes(href, doc, attrs, registry)
  if (!attributes) return null

  return { type: 'setTextAttributes', index: start, length, attributes }
}

export function buildUnlinkOperation(
  host: HTMLElement,
  selectionBefore: SelectionSnapshot
): EditableOperation | null {
  if (isPlainTextBlock(host)) return null
  if (!isFormatAllowed(host, 'link')) return null

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
  keys: readonly FormatKey[]
): TextAttributes {
  const registry = getHostFormatRegistry(host)
  const runs = getBlockTextRuns(host, registry)
  const attributes: TextAttributes = {}
  for (const key of keys) {
    if (!isFormatAllowed(host, key)) continue
    if (registry.spanHasUniformFormat(runs, start, end, key)) {
      const sample = sampleAttributeValue(runs, start, key)
      if (sample !== undefined) attributes[key] = sample
    }
  }
  return attributes
}

function sampleAttributeValue(
  runs: ReturnType<typeof getBlockTextRuns>,
  index: number,
  key: FormatKey
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

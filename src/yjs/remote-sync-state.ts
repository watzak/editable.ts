import { getBlockOperationText } from '../operation-text-model.js'
import type { EditableOperation } from '../operation-types.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'
import { getBlockTextRuns, type TextRun } from './dom-text-runs.js'
import type { TextAttributes } from '../operation-types.js'
import type { YTextDeltaOp } from './ytext-delta-to-operations.js'
import type * as Y from 'yjs'

/** Canonical host state the binding believes matches {@link Y.Text} before a remote delta. */
export interface CanonicalSnapshot {
  text: string
  runs?: TextRun[]
}

export type RemoteSyncPath = 'incremental' | 'reconcile' | 'deferred' | 'none'

/** Diagnostic record of the last foreign {@link Y.Text} observer handling. */
export interface RemoteSyncDiagnostics {
  path: RemoteSyncPath
  reason?: string
  operationCount?: number
}

export function textRunsFromYText(
  yText: Y.Text,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): TextRun[] {
  const runs: TextRun[] = []
  for (const op of yText.toDelta() as Array<{
    insert?: string | unknown
    attributes?: Record<string, unknown>
  }>) {
    if (typeof op.insert !== 'string' || op.insert.length === 0) continue
    const attributes = registry.sanitizeDeltaAttributes(op.attributes, doc) ?? {}
    runs.push({ text: op.insert, attributes: { ...attributes } })
  }
  return runs
}

export function textRunsEqual(a: readonly TextRun[], b: readonly TextRun[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].text !== b[i].text) return false
    const left = a[i].attributes
    const right = b[i].attributes
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
      if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) return false
    }
  }
  return true
}

export function captureCanonicalSnapshot(
  yText: Y.Text,
  doc: Document | undefined,
  richText: boolean,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): CanonicalSnapshot {
  const text = yText.toString()
  if (!richText || !doc) return { text }
  return { text, runs: textRunsFromYText(yText, doc, registry) }
}

/** True when a delta inserts or deletes text (not attribute-only). */
export function deltaChangesText(delta: readonly YTextDeltaOp[]): boolean {
  return delta.some(
    (op) =>
      (typeof op.insert === 'string' && op.insert.length > 0) ||
      (op.delete !== undefined && op.delete > 0)
  )
}

/**
 * True when host operation text (and rich runs when required) match the canonical snapshot.
 * Text-changing deltas require plain-text agreement only; attribute-only deltas also require
 * matching normalized inline runs so indices stay aligned with formatting.
 */
export function hostMatchesCanonicalSnapshot(
  host: HTMLElement,
  snapshot: CanonicalSnapshot,
  richText: boolean,
  doc?: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry,
  delta?: readonly YTextDeltaOp[]
): boolean {
  const hostText = getBlockOperationText(host)
  if (hostText !== snapshot.text) return false
  if (!richText) return true
  if (!doc || !snapshot.runs) return false
  if (delta && deltaChangesText(delta)) return true
  // Attribute-only deltas: plain-text agreement is enough; formatting is applied via setTextAttributes.
  if (delta && !deltaChangesText(delta)) return true
  return textRunsEqual(getBlockTextRuns(host, registry), snapshot.runs)
}

/** Simulates a Y.Text delta on plain text — used to verify incremental apply targets. */
export function applyDeltaToText(text: string, delta: readonly YTextDeltaOp[]): string {
  let result = text
  let index = 0

  for (const op of delta) {
    if (op.retain !== undefined) {
      index += op.retain
      continue
    }
    if (op.delete !== undefined && op.delete > 0) {
      result = result.slice(0, index) + result.slice(index + op.delete)
      continue
    }
    if (typeof op.insert === 'string' && op.insert.length > 0) {
      result = result.slice(0, index) + op.insert + result.slice(index)
      index += op.insert.length
    }
  }

  return result
}

function attributesEqual(a: TextAttributes, b: TextAttributes): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false
  }
  return true
}

function hostAttributesAtRange(
  host: HTMLElement,
  index: number,
  length: number,
  registry: InlineFormatRegistry
): TextAttributes | null {
  if (length === 0) return {}
  const runs = getBlockTextRuns(host, registry)
  let offset = 0
  let merged: TextAttributes | undefined

  for (const run of runs) {
    const start = offset
    const end = offset + run.text.length
    offset = end
    if (end <= index || start >= index + length) continue

    if (merged && !attributesEqual(merged, run.attributes)) {
      return null
    }
    merged = run.attributes
  }

  return merged ?? {}
}

/**
 * Emits {@link setTextAttributes} only for Y.Text ranges whose DOM attributes differ.
 * Skips already-matching segments to avoid nested duplicate markup.
 */
export function buildFormatRepairOperations(
  host: HTMLElement,
  yText: Y.Text,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): EditableOperation[] {
  const yRuns = textRunsFromYText(yText, doc, registry)
  const operations: EditableOperation[] = []
  let index = 0

  for (const yRun of yRuns) {
    const len = yRun.text.length
    const hostAttrs = hostAttributesAtRange(host, index, len, registry)
    if (hostAttrs === null || !attributesEqual(hostAttrs, yRun.attributes)) {
      const attributes: TextAttributes = { ...yRun.attributes }
      for (const key of Object.keys(hostAttrs ?? {})) {
        if (!(key in yRun.attributes)) {
          attributes[key as keyof TextAttributes] = null
        }
      }
      operations.push({
        type: 'setTextAttributes',
        index,
        length: len,
        attributes
      })
    }
    index += len
  }

  return operations
}

/** Removes empty inline wrappers that break range-based format apply. */
export function removeEmptyInlineElements(host: HTMLElement): void {
  host.querySelectorAll('strong, b, em, i, u, a').forEach((el) => {
    if (!el.textContent) el.remove()
  })
}

/** Count of non-empty direct text child nodes — fragmentation breaks range-based format apply. */
export function countDirectTextNodes(host: HTMLElement): number {
  let count = 0
  for (const child of host.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent?.length ?? 0) > 0) {
      count += 1
    }
  }
  return count
}

/** True when operations represent delete-all + re-insert (full host rebuild). */
export function isFullHostReplaceBatch(
  operations: readonly EditableOperation[],
  hostLength: number
): boolean {
  if (hostLength === 0 || operations.length === 0) return false
  const first = operations[0]
  return (
    first?.type === 'deleteText' &&
    first.index === 0 &&
    first.length === hostLength &&
    operations.some((op) => op.type === 'insertText' && op.index === 0)
  )
}

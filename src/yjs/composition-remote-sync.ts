import * as Y from 'yjs'
import type { Editable } from '../core.js'
import type Cursor from '../cursor.js'
import type Selection from '../selection.js'
import type { InlineFormatRegistry } from './inline-format-codec.js'
import { getOperationTextLength } from '../operation-offset.js'
import { captureSelectionSnapshot, setSelectionFromSnapshot } from '../operation-selection.js'
import type { EditableOperation, JsonValue } from '../operation-types.js'
import { hostRichTextMatchesYText } from './reconcile.js'
import { offsetsToRelativePositionJson, resolveRelativeIndexInText } from './relative-position.js'

/** UTF-16 index map captured at {@link CompositionEvent} `start` against current {@link Y.Text}. */
export interface CompositionBaseline {
  yTextSnapshot: string
  indexRelJson: readonly (JsonValue | null)[]
}

export function createCompositionBaseline(yText: Y.Text): CompositionBaseline {
  const typeLength = yText.length
  const indexRelJson: (JsonValue | null)[] = []
  for (let i = 0; i <= typeLength; i += 1) {
    indexRelJson.push(relativePositionJsonFromBaselineIndex(yText, i, typeLength))
  }
  return { yTextSnapshot: yText.toString(), indexRelJson }
}

function relativePositionJsonFromBaselineIndex(
  yText: Y.Text,
  baselineIndex: number,
  baselineTypeLength: number
): JsonValue | null {
  if (!Number.isInteger(baselineIndex) || baselineIndex < 0) return null
  const typeIndex = Math.min(baselineIndex, baselineTypeLength)
  const assoc = baselineIndex >= baselineTypeLength ? -1 : 1
  try {
    const relPos = Y.createRelativePositionFromTypeIndex(yText, typeIndex, assoc)
    return Y.relativePositionToJSON(relPos) as JsonValue
  } catch {
    return null
  }
}

export function resolveBaselineIndex(
  doc: Y.Doc,
  yText: Y.Text,
  baseline: CompositionBaseline,
  baselineIndex: number
): number | null {
  const maxBaseline = baseline.indexRelJson.length - 1
  const clamped = Math.max(0, Math.min(Math.trunc(baselineIndex), maxBaseline))
  const relJson = baseline.indexRelJson[clamped]
  return resolveRelativeIndexInText(doc, yText, relJson, yText.length)
}

/**
 * Re-maps composition operations from the pre-composition index space onto the
 * current {@link Y.Text} after interleaved remote CRDT updates.
 */
export function resolveCompositionCommitOperations(
  operations: readonly EditableOperation[],
  source: string,
  baseline: CompositionBaseline | null,
  yText: Y.Text,
  doc: Y.Doc
): { operations: EditableOperation[]; clearBaseline: boolean } {
  if (source !== 'composition' || !baseline) {
    return { operations: [...operations], clearBaseline: false }
  }
  return {
    operations: transformOperationsFromCompositionBaseline(operations, baseline, yText, doc),
    clearBaseline: true
  }
}

export function transformOperationsFromCompositionBaseline(
  operations: readonly EditableOperation[],
  baseline: CompositionBaseline,
  yText: Y.Text,
  doc: Y.Doc
): EditableOperation[] {
  if (yText.toString() === baseline.yTextSnapshot) {
    return [...operations]
  }

  const transformed: EditableOperation[] = []

  for (const op of operations) {
    switch (op.type) {
      case 'insertText': {
        const index = resolveBaselineIndex(doc, yText, baseline, op.index)
        if (index === null) break
        transformed.push({ ...op, index })
        break
      }
      case 'deleteText': {
        const index = resolveBaselineIndex(doc, yText, baseline, op.index)
        const end = resolveBaselineIndex(doc, yText, baseline, op.index + op.length)
        if (index === null || end === null || end < index) break
        transformed.push({ ...op, index, length: end - index })
        break
      }
      case 'replaceText': {
        const index = resolveBaselineIndex(doc, yText, baseline, op.index)
        const end = resolveBaselineIndex(doc, yText, baseline, op.index + op.length)
        if (index === null || end === null || end < index) break
        transformed.push({ ...op, index, length: end - index })
        break
      }
      case 'setTextAttributes': {
        const index = resolveBaselineIndex(doc, yText, baseline, op.index)
        const end = resolveBaselineIndex(doc, yText, baseline, op.index + op.length)
        if (index === null || end === null || end < index) break
        transformed.push({ ...op, index, length: end - index })
        break
      }
    }
  }

  return transformed
}

export interface CompositionSelectionRel {
  anchor: JsonValue | null
  head: JsonValue | null
}

export interface CompositionStartSnapshot {
  baseline: CompositionBaseline
  selectionRel: CompositionSelectionRel | null
}

export function captureCompositionStartSnapshot(
  yText: Y.Text,
  host: HTMLElement,
  getFreshSelection: () => Cursor | Selection | undefined
): CompositionStartSnapshot {
  const snapshot = captureSelectionSnapshot(host, getFreshSelection())
  const textLength = getOperationTextLength(host)
  return {
    baseline: createCompositionBaseline(yText),
    selectionRel: snapshot
      ? offsetsToRelativePositionJson(yText, snapshot.anchor, snapshot.head, textLength)
      : null
  }
}

export function restoreSelectionFromCompositionRel(
  host: HTMLElement,
  editable: Editable,
  yText: Y.Text,
  rel: CompositionSelectionRel | null
): void {
  const doc = yText.doc
  if (!doc || !rel) return

  const anchor = resolveRelativeIndexInText(doc, yText, rel.anchor, yText.length)
  const head = resolveRelativeIndexInText(doc, yText, rel.head, yText.length)
  if (anchor === null || head === null) return

  setSelectionFromSnapshot(host, {
    anchor,
    head,
    direction: head >= anchor ? 'forward' : 'backward'
  })
  editable.dispatcher.selectionWatcher.syncSelection()
}

export function repairRichHostAfterDeferredRecovery(options: {
  host: HTMLElement
  yText: Y.Text
  doc: Document
  registry: InlineFormatRegistry
  reconcile: (diagnostic: string) => void
  repairIncrementally: (doc: Document) => void
}): void {
  const { host, yText, doc, registry, reconcile, repairIncrementally } = options
  if (hostRichTextMatchesYText(host, yText, doc, registry)) return
  repairIncrementally(doc)
  if (hostRichTextMatchesYText(host, yText, doc, registry)) return
  reconcile('deferred-rich-format-recovery')
}

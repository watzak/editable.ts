import { getBlockTextRuns, type TextRun } from './dom-text-runs.js'
import { createOperationRange } from './operation-offset.js'
import { transformSelectionThroughBatch } from './operation-selection-transform.js'
import { validateOperationBatch, OperationValidationError } from './operation-validate.js'
import { setSelectionFromSnapshot } from './operation-selection.js'
import { OPERATION_LINE_BREAK } from './operation-types.js'
import { getHostFormatRegistry } from './host-policy.js'
import type { InlineFormatRegistry } from './inline-format-codec.js'
import type {
  EditableOperation,
  EditableOperationBatch,
  TextAttributes
} from './operation-types.js'
import type { SelectionSnapshot } from './operation-types.js'

export interface ApplyOperationsOptions {
  origin?: EditableOperationBatch['origin']
  preserveSelection?: boolean
  emitChange?: boolean
}

export interface ApplyOperationsResult {
  applied: boolean
  queued?: boolean
}

function textToInsertFragment(
  host: HTMLElement,
  doc: Document,
  text: string,
  attributes?: TextAttributes
): DocumentFragment {
  const registry = getHostFormatRegistry(host)
  const parts = text.split(OPERATION_LINE_BREAK)
  const fragment = doc.createDocumentFragment()

  parts.forEach((part, index) => {
    if (part) {
      fragment.appendChild(registry.wrapStyledText(doc, part, attributes))
    }
    if (index < parts.length - 1) {
      fragment.appendChild(doc.createElement('br'))
    }
  })

  return fragment
}

function textAttributesEqual(a: TextAttributes, b: TextAttributes): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false
  }
  return true
}

function coalesceTextRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = []
  for (const run of runs) {
    if (!run.text) continue
    const last = merged[merged.length - 1]
    if (last && textAttributesEqual(last.attributes, run.attributes)) {
      last.text += run.text
    } else {
      merged.push({ text: run.text, attributes: { ...run.attributes } })
    }
  }
  return merged
}

/** Applies attribute updates only on `[start, end)` while preserving text order and other formats. */
function applyAttributesToRunSpan(
  runs: readonly TextRun[],
  start: number,
  end: number,
  attributes: TextAttributes,
  registry: InlineFormatRegistry
): TextRun[] {
  let offset = 0
  const next: TextRun[] = []

  for (const run of runs) {
    const runStart = offset
    const runEnd = offset + run.text.length
    offset = runEnd

    if (runEnd <= start || runStart >= end) {
      next.push({ text: run.text, attributes: { ...run.attributes } })
      continue
    }

    const overlapStart = Math.max(runStart, start)
    const overlapEnd = Math.min(runEnd, end)
    const sliceStart = overlapStart - runStart
    const sliceEnd = overlapEnd - runStart

    if (runStart < overlapStart) {
      next.push({
        text: run.text.slice(0, sliceStart),
        attributes: { ...run.attributes }
      })
    }

    let updatedAttributes = { ...run.attributes }
    for (const [key, value] of Object.entries(attributes)) {
      if (!registry.getCodec(key)) continue
      updatedAttributes = registry.mergeAttributeUpdates(updatedAttributes, { [key]: value })
    }
    next.push({
      text: run.text.slice(sliceStart, sliceEnd),
      attributes: updatedAttributes
    })

    if (runEnd > overlapEnd) {
      next.push({
        text: run.text.slice(sliceEnd),
        attributes: { ...run.attributes }
      })
    }
  }

  return coalesceTextRuns(next)
}

function clearHostChildren(host: HTMLElement): void {
  while (host.firstChild) {
    host.removeChild(host.firstChild)
  }
}

function appendStyledRun(
  doc: Document,
  host: HTMLElement,
  text: string,
  attributes: TextAttributes | undefined,
  registry: InlineFormatRegistry
): void {
  const parts = text.split(OPERATION_LINE_BREAK)
  parts.forEach((part, index) => {
    if (part) {
      host.appendChild(registry.wrapStyledText(doc, part, attributes))
    }
    if (index < parts.length - 1) {
      host.appendChild(doc.createElement('br'))
    }
  })
}

function renderTextRunsToHost(
  host: HTMLElement,
  runs: readonly TextRun[],
  registry: InlineFormatRegistry
): void {
  const doc = host.ownerDocument!
  clearHostChildren(host)
  for (const run of runs) {
    appendStyledRun(doc, host, run.text, run.attributes, registry)
  }
}

function applySetTextAttributes(
  host: HTMLElement,
  index: number,
  length: number,
  attributes: TextAttributes
): void {
  if (length === 0) return
  const registry = getHostFormatRegistry(host)
  const runs = getBlockTextRuns(host, registry)
  const updated = applyAttributesToRunSpan(runs, index, index + length, attributes, registry)
  renderTextRunsToHost(host, updated, registry)
}

function applySingleOperation(
  host: HTMLElement,
  op: EditableOperation,
  appliedIndex: number
): void {
  const doc = host.ownerDocument!

  switch (op.type) {
    case 'insertText': {
      const range = createOperationRange(host, appliedIndex, appliedIndex)
      const fragment = textToInsertFragment(host, doc, op.text, op.attributes)
      range.insertNode(fragment)
      break
    }
    case 'deleteText': {
      const range = createOperationRange(host, appliedIndex, appliedIndex + op.length)
      range.deleteContents()
      break
    }
    case 'replaceText': {
      const range = createOperationRange(host, appliedIndex, appliedIndex + op.length)
      range.deleteContents()
      const fragment = textToInsertFragment(host, doc, op.text, op.attributes)
      range.insertNode(fragment)
      break
    }
    case 'setTextAttributes':
      applySetTextAttributes(host, appliedIndex, op.length, op.attributes)
      break
  }

  host.normalize()
}

/**
 * Applies operations sequentially at face-value indices against the evolving DOM.
 * Used for Y.Text deltas where each step targets the current document state.
 */
export function applyLiveOperationBatchToDom(
  host: HTMLElement,
  batch: EditableOperationBatch,
  options: {
    preserveSelection?: boolean
    selectionBefore?: SelectionSnapshot
  } = {}
): void {
  for (const op of batch.operations) {
    applySingleOperation(host, op, op.index)
  }

  const targetSelection =
    batch.selectionAfter ??
    (options.selectionBefore
      ? transformSelectionThroughBatch(options.selectionBefore, batch.operations)
      : undefined)

  if (options.preserveSelection !== false && targetSelection) {
    setSelectionFromSnapshot(host, targetSelection)
  }
}

export function applyOperationBatchToDom(
  host: HTMLElement,
  batch: EditableOperationBatch,
  options: {
    preserveSelection?: boolean
    selectionBefore?: SelectionSnapshot
  } = {}
): void {
  validateOperationBatch(host, batch)

  let delta = 0
  for (const op of batch.operations) {
    const appliedIndex = op.index + delta
    applySingleOperation(host, op, appliedIndex)

    switch (op.type) {
      case 'insertText':
        delta += op.text.length
        break
      case 'deleteText':
        delta -= op.length
        break
      case 'replaceText':
        delta += op.text.length - op.length
        break
      default:
        break
    }
  }

  const targetSelection =
    batch.selectionAfter ??
    (options.selectionBefore
      ? transformSelectionThroughBatch(options.selectionBefore, batch.operations)
      : undefined)

  if (options.preserveSelection !== false && targetSelection) {
    setSelectionFromSnapshot(host, targetSelection)
  }
}

export { OperationValidationError }

import type * as Y from 'yjs'
import { getBlockTextRuns, textRunsToPlainText } from './dom-text-runs.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'
import type { EditableOperation, TextAttributes } from '../operation-types.js'

/** Inserts host content into an empty {@link Y.Text} preserving inline attributes. */
export function insertHostRunsIntoYText(
  yText: Y.Text,
  host: HTMLElement,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): void {
  const runs = getBlockTextRuns(host, registry)
  let index = 0
  let activeKeys: string[] = []

  for (const run of runs) {
    const format = buildInsertFormatMap(run.attributes, activeKeys, registry, doc)
    if (Object.keys(format).length > 0) {
      yText.insert(index, run.text, format)
    } else {
      yText.insert(index, run.text)
    }
    activeKeys = Object.keys(run.attributes)
    index += run.text.length
  }
}

export function buildInsertFormatMap(
  attributes: TextAttributes,
  activeKeys: readonly string[],
  registry: InlineFormatRegistry,
  doc: Document
): Record<string, unknown> {
  const format = registry.toYTextFormatMap(attributes, doc)

  for (const key of activeKeys) {
    if (!(key in attributes)) {
      format[key] = null
    }
  }

  return format
}

/** Converts a full {@link Y.Text} snapshot into operations for host apply. */
export function yTextSnapshotToOperations(
  yText: Y.Text,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): EditableOperation[] {
  const delta = yText.toDelta() as Array<{
    insert?: string | unknown
    attributes?: Record<string, unknown>
  }>

  const operations: EditableOperation[] = []
  let index = 0

  for (const op of delta) {
    if (typeof op.insert !== 'string') continue
    const attributes = registry.sanitizeDeltaAttributes(op.attributes, doc)
    if (op.insert.length > 0) {
      operations.push({
        type: 'insertText',
        index,
        text: op.insert,
        ...(attributes ? { attributes } : {})
      })
      index += op.insert.length
    }
  }

  return operations
}

export function hostTextMatchesYText(
  host: HTMLElement,
  yText: Y.Text,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  const runs = getBlockTextRuns(host, registry)
  return textRunsToPlainText(runs) === yText.toString()
}

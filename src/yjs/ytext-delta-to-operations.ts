import { PlainTextYjsError } from './plain-text-yjs-error.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'
import type { EditableOperation, TextAttributes } from '../operation-types.js'

export type YTextDeltaOp = {
  retain?: number
  insert?: string | unknown
  delete?: number
  attributes?: Record<string, unknown>
}

export interface YTextDeltaToOperationsOptions {
  registry?: InlineFormatRegistry
  doc?: Document
  richText?: boolean
}

/**
 * Converts a {@link Y.Text} delta into {@link EditableOperation}s.
 * Indices follow the same UTF-16 model as the operation capture pipeline.
 */
export function yTextDeltaToOperations(
  delta: readonly YTextDeltaOp[],
  options: YTextDeltaToOperationsOptions = {}
): EditableOperation[] {
  const richText = options.richText ?? false
  const registry = options.registry ?? defaultInlineFormatRegistry
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : undefined)

  const operations: EditableOperation[] = []
  let index = 0

  for (const op of delta) {
    if (op.retain !== undefined) {
      if (richText && op.attributes && Object.keys(op.attributes).length > 0) {
        if (!doc) {
          throw new PlainTextYjsError('Rich-text delta conversion requires a Document')
        }
        const attributes = registry.sanitizeDeltaAttributes(op.attributes, doc)
        if (attributes && op.retain > 0) {
          operations.push({
            type: 'setTextAttributes',
            index,
            length: op.retain,
            attributes
          })
        }
      }
      index += op.retain
      continue
    }

    if (op.delete !== undefined) {
      if (op.delete > 0) {
        operations.push({ type: 'deleteText', index, length: op.delete })
      }
      continue
    }

    if (op.insert !== undefined) {
      if (typeof op.insert !== 'string') {
        throw new PlainTextYjsError('Yjs binding does not support non-string Y.Text inserts')
      }

      let attributes: TextAttributes | undefined
      if (richText && op.attributes && Object.keys(op.attributes).length > 0) {
        if (!doc) {
          throw new PlainTextYjsError('Rich-text delta conversion requires a Document')
        }
        attributes = registry.sanitizeDeltaAttributes(op.attributes, doc)
      }

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
  }

  return coalesceAdjacentReplace(operations)
}

function coalesceAdjacentReplace(operations: EditableOperation[]): EditableOperation[] {
  const merged: EditableOperation[] = []

  for (let i = 0; i < operations.length; i += 1) {
    const current = operations[i]
    const next = operations[i + 1]

    if (
      current?.type === 'deleteText' &&
      current.length > 0 &&
      next?.type === 'insertText' &&
      current.index === next.index
    ) {
      merged.push({
        type: 'replaceText',
        index: current.index,
        length: current.length,
        text: next.text,
        ...(next.attributes ? { attributes: next.attributes } : {})
      })
      i += 1
      continue
    }

    if (current) merged.push(current)
  }

  return merged
}

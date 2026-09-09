import { PlainTextYjsError } from './plain-text-yjs-error.js'
import type { EditableOperation } from '../operation-types.js'

export type YTextDeltaOp = {
  retain?: number
  insert?: string | unknown
  delete?: number
  attributes?: Record<string, unknown>
}

/**
 * Converts a {@link Y.Text} delta into plain-text {@link EditableOperation}s.
 * Indices follow the same UTF-16 model as the operation capture pipeline.
 */
export function yTextDeltaToOperations(delta: readonly YTextDeltaOp[]): EditableOperation[] {
  const operations: EditableOperation[] = []
  let index = 0

  for (const op of delta) {
    if (op.retain !== undefined) {
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
        throw new PlainTextYjsError(
          'Plain-text Yjs binding does not support non-string Y.Text inserts'
        )
      }
      if (op.insert.length > 0) {
        operations.push({ type: 'insertText', index, text: op.insert })
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
        text: next.text
      })
      i += 1
      continue
    }

    if (current) merged.push(current)
  }

  return merged
}

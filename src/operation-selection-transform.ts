import type { EditableOperation, SelectionSnapshot } from './operation-types.js'

/** Maps a UTF-16 caret/selection boundary through a single operation. */
export function transformSelectionOffset(
  offset: number,
  op: EditableOperation,
  appliedIndex: number
): number {
  switch (op.type) {
    case 'insertText': {
      const insertLength = op.text.length
      if (offset >= appliedIndex) return offset + insertLength
      return offset
    }
    case 'deleteText': {
      const deleteEnd = appliedIndex + op.length
      if (offset <= appliedIndex) return offset
      if (offset >= deleteEnd) return offset - op.length
      return appliedIndex
    }
    case 'replaceText': {
      const replaceEnd = appliedIndex + op.length
      const delta = op.text.length - op.length
      if (offset <= appliedIndex) return offset
      if (offset >= replaceEnd) return offset + delta
      return appliedIndex + Math.min(offset - appliedIndex, op.text.length)
    }
    case 'setTextAttributes':
      return offset
    default:
      return offset
  }
}

export function transformSelectionSnapshot(
  snapshot: SelectionSnapshot,
  op: EditableOperation,
  appliedIndex: number
): SelectionSnapshot {
  const anchor = transformSelectionOffset(snapshot.anchor, op, appliedIndex)
  const head = transformSelectionOffset(snapshot.head, op, appliedIndex)
  return {
    anchor,
    head,
    direction: anchor === head ? 'none' : head > anchor ? 'forward' : 'backward'
  }
}

export function transformSelectionThroughBatch(
  snapshot: SelectionSnapshot,
  operations: readonly EditableOperation[]
): SelectionSnapshot {
  let current = snapshot
  let delta = 0

  for (const op of operations) {
    const appliedIndex = op.index + delta
    current = transformSelectionSnapshot(current, op, appliedIndex)

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

  return current
}

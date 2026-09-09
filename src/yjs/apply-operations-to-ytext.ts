import type * as Y from 'yjs'
import { PlainTextYjsError } from './plain-text-yjs-error.js'
import type { EditableOperation } from '../operation-types.js'

/** Applies a confirmed operation batch to {@link Y.Text} using UTF-16 index semantics. */
export function applyEditableOperationsToYText(
  yText: Y.Text,
  operations: readonly EditableOperation[]
): void {
  let delta = 0

  for (const op of operations) {
    const appliedIndex = op.index + delta

    switch (op.type) {
      case 'insertText':
        yText.insert(appliedIndex, op.text)
        delta += op.text.length
        break
      case 'deleteText':
        yText.delete(appliedIndex, op.length)
        delta -= op.length
        break
      case 'replaceText':
        yText.delete(appliedIndex, op.length)
        yText.insert(appliedIndex, op.text)
        delta += op.text.length - op.length
        break
      case 'setTextAttributes':
        throw new PlainTextYjsError(
          'Plain-text Yjs binding cannot apply setTextAttributes to Y.Text'
        )
    }
  }
}

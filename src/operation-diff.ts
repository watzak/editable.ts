import type { EditableOperation } from './operation-types.js'

/**
 * Minimal character diff for confirmed before/after text snapshots.
 * Uses shared prefix/suffix trimming — sufficient for single-gesture input capture.
 */
export function diffToOperations(oldText: string, newText: string): EditableOperation[] {
  if (oldText === newText) return []

  let prefix = 0
  const minLength = Math.min(oldText.length, newText.length)
  while (prefix < minLength && oldText[prefix] === newText[prefix]) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldEnd = oldText.length - suffix
  const newEnd = newText.length - suffix
  const removed = oldText.slice(prefix, oldEnd)
  const inserted = newText.slice(prefix, newEnd)

  if (!removed && !inserted) return []
  if (removed && inserted) {
    return [{ type: 'replaceText', index: prefix, length: removed.length, text: inserted }]
  }
  if (removed) {
    return [{ type: 'deleteText', index: prefix, length: removed.length }]
  }
  return [{ type: 'insertText', index: prefix, text: inserted }]
}

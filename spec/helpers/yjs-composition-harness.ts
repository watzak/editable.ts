import type { Editable } from '../../src/core.js'
import { getBlockOperationText } from '../../src/operation-text-model.js'
import { createCursorAtEnd, createSelection } from './yjs-sync-harness.js'

/** Synthetic IME-style composition — not a real OS input method. */
export function beginSyntheticComposition(
  host: HTMLElement,
  editable: Editable,
  cursorOffset?: number
): void {
  if (cursorOffset !== undefined) {
    createSelection(host, cursorOffset, cursorOffset)
  } else {
    createCursorAtEnd(host)
  }
  editable.dispatcher.selectionWatcher.syncSelection()
  host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, cancelable: true }))
}

/** Completes synthetic composition and commits through the editable pipeline. */
export function endSyntheticComposition(
  host: HTMLElement,
  editable: Editable,
  composedText: string
): void {
  host.textContent = composedText
  host.dispatchEvent(
    new CompositionEvent('compositionend', {
      bubbles: true,
      cancelable: true,
      data: composedText
    })
  )
  editable.dispatcher.selectionWatcher.syncSelection()
}

export function hostPlainText(host: HTMLElement): string {
  return getBlockOperationText(host)
}

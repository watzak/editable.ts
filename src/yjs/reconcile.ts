import { getBlockOperationText } from '../operation-text-model.js'
import { getOperationTextLength } from '../operation-offset.js'
import type { Editable } from '../core.js'
import type * as Y from 'yjs'

export interface ReconcileDiagnostics {
  hostText: string
  yText: string
  action: 'none' | 'applied-y-to-host'
  reason?: string
}

/**
 * Explicit recovery path when host operation text diverges from canonical {@link Y.Text}.
 * Y.Text wins — never silently overwrites Y with host content.
 */
export function reconcileHostToCanonicalYText(
  editable: Editable,
  host: HTMLElement,
  yText: Y.Text,
  reason?: string
): ReconcileDiagnostics {
  const hostText = getBlockOperationText(host)
  const canonical = yText.toString()

  if (hostText === canonical) {
    return { hostText, yText: canonical, action: 'none', reason }
  }

  const hostLength = getOperationTextLength(host)
  const operations =
    hostLength === 0
      ? [{ type: 'insertText' as const, index: 0, text: canonical }]
      : [{ type: 'replaceText' as const, index: 0, length: hostLength, text: canonical }]

  editable.applyOperations(
    host,
    { source: 'remote', operations },
    { preserveSelection: true, emitChange: false }
  )

  return { hostText, yText: canonical, action: 'applied-y-to-host', reason }
}

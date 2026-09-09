import { getBlockOperationText } from '../operation-text-model.js'
import { getOperationTextLength } from '../operation-offset.js'
import { OPERATION_LINE_BREAK } from '../operation-types.js'
import type { TextAttributes } from '../operation-types.js'
import type { Editable } from '../core.js'
import type { EditableOperation } from '../operation-types.js'
import type * as Y from 'yjs'
import { insertHostRunsIntoYText } from './dom-to-ytext.js'
import {
  applyHostInlineMarkupToYText,
  getBlockTextRuns,
  hostDomHasFormattingMarkup,
  textRunsToPlainText
} from './dom-text-runs.js'
import { textRunsEqual, textRunsFromYText } from './remote-sync-state.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'

export interface ReconcileDiagnostics {
  hostText: string
  yText: string
  action: 'none' | 'applied-y-to-host' | 'promoted-host-to-y'
  reason?: string
}

export { hostDomHasFormattingMarkup } from './dom-text-runs.js'

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

/** Recovery-only: append each Y.Text delta run at the host tail (avoids index skew from inline wrappers). */
export function applyYTextDeltaToHostDom(
  host: HTMLElement,
  yText: Y.Text,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): void {
  clearHostChildren(host)

  for (const op of yText.toDelta() as Array<{
    insert?: string | unknown
    attributes?: Record<string, unknown>
  }>) {
    if (typeof op.insert !== 'string' || op.insert.length === 0) continue
    const attributes = registry.sanitizeDeltaAttributes(op.attributes, doc)
    appendStyledRun(doc, host, op.insert, attributes, registry)
  }
}

export function yTextHasInlineAttributes(yText: Y.Text): boolean {
  return (yText.toDelta() as Array<{ attributes?: Record<string, unknown> }>).some(
    (op) => op.attributes && Object.keys(op.attributes).length > 0
  )
}

export function hostHasInlineAttributes(
  host: HTMLElement,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  if (getBlockTextRuns(host, registry).some((run) => Object.keys(run.attributes).length > 0)) {
    return true
  }
  return hostDomHasFormattingMarkup(host)
}

export function promoteHostInlineFormatsToYText(
  yText: Y.Text,
  host: HTMLElement,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): void {
  const yDoc = yText.doc
  if (!yDoc) return
  yDoc.transact(() => {
    if (yText.length > 0) {
      yText.delete(0, yText.length)
    }
    insertHostRunsIntoYText(yText, host, doc, registry)
    if (!yTextHasInlineAttributes(yText) && hostDomHasFormattingMarkup(host)) {
      applyHostInlineMarkupToYText(yText, host, doc, registry)
    }
  })
}

export interface ReconcileHostOptions {
  richText?: boolean
  registry?: InlineFormatRegistry
  doc?: Document
}

/** Builds delete-all + insert-from-delta ops to mirror canonical {@link Y.Text} in the host. */
export function buildCopyYTextDeltaToHostOperations(
  yText: Y.Text,
  hostLength: number,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): EditableOperation[] {
  const operations: EditableOperation[] = []
  if (hostLength > 0) {
    operations.push({ type: 'deleteText', index: 0, length: hostLength })
  }

  let index = 0
  const delta = yText.toDelta() as Array<{
    insert?: string | unknown
    attributes?: Record<string, unknown>
  }>

  for (const op of delta) {
    if (typeof op.insert !== 'string' || op.insert.length === 0) continue
    const attributes = registry.sanitizeDeltaAttributes(op.attributes, doc)
    operations.push({
      type: 'insertText',
      index,
      text: op.insert,
      ...(attributes ? { attributes } : {})
    })
    index += op.insert.length
  }

  return operations
}

/** True when DOM inline runs match the canonical {@link Y.Text} delta (text + attributes). */
export function hostRichTextMatchesYText(
  host: HTMLElement,
  yText: Y.Text,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  if (textRunsToPlainText(getBlockTextRuns(host, registry)) !== yText.toString()) {
    return false
  }
  const domFormatted = hostHasInlineAttributes(host, registry)
  const yFormatted = yTextHasInlineAttributes(yText)
  if (domFormatted !== yFormatted) {
    return false
  }
  return textRunsEqual(getBlockTextRuns(host, registry), textRunsFromYText(yText, doc, registry))
}

/**
 * Explicit recovery path when host operation text diverges from canonical {@link Y.Text}.
 * Y.Text wins — never silently overwrites Y with host content.
 *
 * Rich-text hosts additionally rebuild inline formatting from the Y.Text delta when
 * plain operation text already matches but DOM attributes do not.
 */
export function reconcileHostToCanonicalYText(
  editable: Editable,
  host: HTMLElement,
  yText: Y.Text,
  reason?: string,
  options: ReconcileHostOptions = {}
): ReconcileDiagnostics {
  const richText = options.richText ?? false
  const registry = options.registry ?? defaultInlineFormatRegistry
  const doc = options.doc ?? host.ownerDocument ?? undefined

  const hostText = getBlockOperationText(host)
  const canonical = yText.toString()

  if (richText) {
    if (!doc) {
      throw new Error('Rich-text reconcile requires a Document')
    }
    if (hostRichTextMatchesYText(host, yText, doc, registry)) {
      return { hostText, yText: canonical, action: 'none', reason }
    }

    // Promote host formatting only when the text itself already matches — otherwise Y.Text
    // stays canonical and host content is rebuilt from it below. Remote recovery paths
    // always apply canonical Y.Text to the host (never promote stale DOM markup).
    const allowPromoteHostToY =
      reason !== 'rich-format-recovery' &&
      reason !== 'incremental-apply-incomplete' &&
      !reason?.startsWith('remote-')
    if (
      allowPromoteHostToY &&
      !yTextHasInlineAttributes(yText) &&
      hostHasInlineAttributes(host, registry) &&
      textRunsToPlainText(getBlockTextRuns(host, registry)) === canonical
    ) {
      promoteHostInlineFormatsToYText(yText, host, doc, registry)
      return {
        hostText,
        yText: yText.toString(),
        action: 'promoted-host-to-y',
        reason
      }
    }

    applyYTextDeltaToHostDom(host, yText, doc, registry)

    return { hostText, yText: canonical, action: 'applied-y-to-host', reason }
  }

  if (hostText === canonical) {
    return { hostText, yText: canonical, action: 'none', reason }
  }

  const hostLength = getOperationTextLength(host)
  const operations =
    hostLength === 0
      ? [{ type: 'insertText' as const, index: 0, text: canonical }]
      : [
          {
            type: 'replaceText' as const,
            index: 0,
            length: hostLength,
            text: canonical
          }
        ]

  editable.applyOperations(
    host,
    { source: 'remote', operations },
    { preserveSelection: true, emitChange: false }
  )

  return { hostText, yText: canonical, action: 'applied-y-to-host', reason }
}

import { getBlockOperationText } from '../operation-text-model.js'
import { getOperationTextLength } from '../operation-offset.js'
import { OPERATION_LINE_BREAK } from '../operation-types.js'
import type { TextAttributes } from '../operation-types.js'
import type { Editable } from '../core.js'
import type { EditableOperation } from '../operation-types.js'
import type * as Y from 'yjs'
import { INITIAL_SYNC_ORIGIN } from './binding-origin.js'
import { applyLocalDomFormatsToYText } from './dom-to-ytext.js'
import {
  InitialSyncFormatConflictError,
  type InitialIdenticalTextFormatResolution,
  type InitialSyncPolicy
} from './initial-sync.js'
import {
  getBlockTextRuns,
  hostDomHasFormattingMarkup,
  textRunsToPlainText
} from './dom-text-runs.js'
import { textRunsEqual, textRunsFromYText } from './remote-sync-state.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'

export type ReconcileAction = 'none' | 'applied-y-to-host'

export interface ReconcileDiagnostics {
  hostText: string
  yText: string
  action: ReconcileAction
  /** Diagnostic label only — never selects sync direction. */
  diagnostic?: string
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

/**
 * Explicit local path: copy host inline attributes into {@link Y.Text} when plain text
 * already matches. Delegates to targeted {@link applyLocalDomFormatsToYText}.
 *
 * @deprecated Prefer {@link applyLocalDomFormatsToYText} from `./dom-to-ytext.js`.
 */
export function promoteHostInlineFormatsToYText(
  yText: Y.Text,
  host: HTMLElement,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): void {
  applyLocalDomFormatsToYText(yText, host, doc, registry)
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
 * Recovery path when the host diverges from canonical {@link Y.Text}.
 * Rebuilds the host from Y.Text — never modifies the CRDT (text or attributes).
 */
export function recoverHostFromCanonicalYText(
  editable: Editable,
  host: HTMLElement,
  yText: Y.Text,
  diagnostic?: string,
  options: ReconcileHostOptions = {}
): ReconcileDiagnostics {
  const richText = options.richText ?? false
  const registry = options.registry ?? defaultInlineFormatRegistry
  const doc = options.doc ?? host.ownerDocument ?? undefined

  const hostText = getBlockOperationText(host)
  const canonical = yText.toString()

  if (richText) {
    if (!doc) {
      throw new Error('Rich-text recovery requires a Document')
    }
    if (hostRichTextMatchesYText(host, yText, doc, registry)) {
      return { hostText, yText: canonical, action: 'none', diagnostic }
    }

    applyYTextDeltaToHostDom(host, yText, doc, registry)

    return { hostText, yText: canonical, action: 'applied-y-to-host', diagnostic }
  }

  if (hostText === canonical) {
    return { hostText, yText: canonical, action: 'none', diagnostic }
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

  return { hostText, yText: canonical, action: 'applied-y-to-host', diagnostic }
}

/**
 * @deprecated Use {@link recoverHostFromCanonicalYText}. The `diagnostic` parameter is
 * never used to select sync direction.
 */
export function reconcileHostToCanonicalYText(
  editable: Editable,
  host: HTMLElement,
  yText: Y.Text,
  diagnostic?: string,
  options: ReconcileHostOptions = {}
): ReconcileDiagnostics {
  return recoverHostFromCanonicalYText(editable, host, yText, diagnostic, options)
}

function resolveInitialFormatConflict(
  policy: InitialSyncPolicy,
  hostFormatted: boolean,
  yFormatted: boolean
): InitialIdenticalTextFormatResolution {
  const configured = policy.bothIdenticalFormatsDiffer
  if (configured) return configured
  if (hostFormatted && !yFormatted) return 'copy-host-to-y'
  if (!hostFormatted && yFormatted) return 'copy-y-to-host'
  return 'error'
}

/** Local format adoption when plain text matches but Y.Text lacks host inline attributes. */
export function adoptLocalHostFormatsToYText(
  yText: Y.Text,
  host: HTMLElement,
  registry: InlineFormatRegistry,
  transactionOrigin?: unknown
): void {
  const doc = host.ownerDocument
  if (!doc) return
  if (yTextHasInlineAttributes(yText)) return
  if (!hostHasInlineAttributes(host, registry)) return
  if (textRunsToPlainText(getBlockTextRuns(host, registry)) !== yText.toString()) return

  const apply = () => applyLocalDomFormatsToYText(yText, host, doc, registry)
  if (transactionOrigin && yText.doc) {
    yText.doc.transact(apply, transactionOrigin)
  } else {
    apply()
  }
}

/** Rich-text initial sync when plain text matches but inline attributes differ. */
export function reconcileInitialRichTextFormats(
  host: HTMLElement,
  yText: Y.Text,
  policy: InitialSyncPolicy,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): void {
  const doc = host.ownerDocument
  if (!doc) return
  if (hostRichTextMatchesYText(host, yText, doc, registry)) return

  const hostText = getBlockOperationText(host)
  const resolution = resolveInitialFormatConflict(
    policy,
    hostHasInlineAttributes(host, registry),
    yTextHasInlineAttributes(yText)
  )

  switch (resolution) {
    case 'copy-host-to-y':
      yText.doc!.transact(() => {
        applyLocalDomFormatsToYText(yText, host, doc, registry)
      }, INITIAL_SYNC_ORIGIN)
      return
    case 'copy-y-to-host':
      applyYTextDeltaToHostDom(host, yText, doc, registry)
      return
    case 'error':
      throw new InitialSyncFormatConflictError(hostText, yText.toString())
    default: {
      const _exhaustive: never = resolution
      throw new Error(`Initial sync: unsupported format resolution ${String(_exhaustive)}`)
    }
  }
}

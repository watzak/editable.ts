import * as Y from 'yjs'
import type { Editable } from '../core.js'
import type { JsonValue } from '../operation-types.js'
import { captureSelectionSnapshot, setSelectionFromSnapshot } from '../operation-selection.js'
import type { SelectionSnapshot } from '../operation-types.js'
import { offsetsToRelativePositionJson, resolvePresenceSelection } from './relative-position.js'
import type { DocumentComponentView, DocumentDirectiveRef } from './document-adapter.js'

export interface ActiveDirectiveSelection {
  componentId: string
  directiveKey: string
  host: HTMLElement
  yText: Y.Text | null
  snapshot: SelectionSnapshot
  relativeAnchor: JsonValue | null
  relativeHead: JsonValue | null
}

export interface FocusFallback {
  host: HTMLElement
  componentId: string
  directiveKey: string
  selection: SelectionSnapshot
}

export type ResolveDirectiveYText = (
  componentId: string,
  directiveKey: string
) => Y.Text | undefined

/** Captures the active editable selection, encoding relative positions when Y.Text is known. */
export function captureActiveDirectiveSelection(
  editable: Editable,
  resolveYText?: ResolveDirectiveYText
): ActiveDirectiveSelection | null {
  const selection = editable.dispatcher.selectionWatcher.getFreshSelection()
  if (!selection?.isSelection) return null

  const host = selection.host
  const directiveKey = host.dataset.directiveKey
  const componentEl = host.closest('[data-component-id]')
  const componentId =
    componentEl instanceof HTMLElement ? componentEl.dataset.componentId : undefined
  if (!directiveKey || !componentId) return null

  const snapshot = captureSelectionSnapshot(host, selection)
  if (!snapshot) return null

  const yText = resolveYText?.(componentId, directiveKey) ?? null
  if (!yText) {
    return {
      componentId,
      directiveKey,
      host,
      yText: null,
      snapshot,
      relativeAnchor: null,
      relativeHead: null
    }
  }

  const { anchor, head } = offsetsToRelativePositionJson(
    yText,
    snapshot.anchor,
    snapshot.head,
    yText.length
  )

  return {
    componentId,
    directiveKey,
    host,
    yText,
    snapshot,
    relativeAnchor: anchor,
    relativeHead: head
  }
}

/** Restores selection from relative positions when the same Y.Text is still mounted. */
export function restoreDirectiveSelectionFromRelative(
  doc: Y.Doc,
  host: HTMLElement,
  yText: Y.Text,
  relativeAnchor: JsonValue | null,
  relativeHead: JsonValue | null
): SelectionSnapshot | null {
  const resolved = resolvePresenceSelection(doc, yText, relativeAnchor, relativeHead)
  if (!resolved) return null
  const snapshot: SelectionSnapshot = {
    anchor: resolved.anchor,
    head: resolved.head,
    direction: resolved.head >= resolved.anchor ? 'forward' : 'backward'
  }
  host.focus()
  setSelectionFromSnapshot(host, snapshot)
  return snapshot
}

/** Deterministic fallback when a focused component is removed remotely. */
export function resolveFocusFallbackAfterRemove(options: {
  removedComponentId: string
  refs: DocumentDirectiveRef[]
  views: ReadonlyMap<string, DocumentComponentView>
  previousIndex: number
  parentComponentId?: string
  containerId?: string
}): FocusFallback | null {
  const siblings = options.refs
    .filter(
      (ref) =>
        ref.directiveKey === 'body' &&
        ref.parentComponentId === options.parentComponentId &&
        ref.containerId === options.containerId
    )
    .sort((a, b) => a.siblingIndex - b.siblingIndex)

  const tryRef = (ref: DocumentDirectiveRef | undefined): FocusFallback | null => {
    if (!ref || ref.componentId === options.removedComponentId) return null
    const host = options.views.get(ref.componentId)?.directiveHosts.get(ref.directiveKey)
    if (!host) return null
    return {
      host,
      componentId: ref.componentId,
      directiveKey: ref.directiveKey,
      selection: { anchor: 0, head: 0, direction: 'none' }
    }
  }

  const after = siblings.find(
    (ref) =>
      ref.componentId !== options.removedComponentId && ref.siblingIndex > options.previousIndex
  )
  const before = [...siblings]
    .reverse()
    .find(
      (ref) =>
        ref.componentId !== options.removedComponentId && ref.siblingIndex < options.previousIndex
    )

  return (
    tryRef(after) ??
    tryRef(before) ??
    tryRef(siblings.find((ref) => ref.componentId !== options.removedComponentId))
  )
}

export function repositionElementAtIndex(
  element: HTMLElement,
  parent: HTMLElement,
  index: number
): void {
  const ref = parent.children[index] ?? null
  if (ref === element) return
  if (ref) parent.insertBefore(element, ref)
  else parent.appendChild(element)
}

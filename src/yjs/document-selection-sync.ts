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

export interface FocusedDirectiveRef {
  componentId: string
  directiveKey: string
  host: HTMLElement
}

/** Resolves the focused directive host from mounted views (no global document assumptions). */
export function captureFocusedDirectiveHost(
  views: ReadonlyMap<string, DocumentComponentView>
): FocusedDirectiveRef | null {
  for (const view of views.values()) {
    const ownerDoc = view.rootElement.ownerDocument
    const active = ownerDoc?.activeElement
    if (!active) continue
    for (const [directiveKey, host] of view.directiveHosts.entries()) {
      if (active === host || host.contains(active)) {
        return { componentId: view.componentId, directiveKey, host }
      }
    }
  }
  return null
}

/** Captures the active editable selection, encoding relative positions when Y.Text is known. */
export function captureActiveDirectiveSelection(
  editable: Editable,
  resolveYText?: ResolveDirectiveYText
): ActiveDirectiveSelection | null {
  const selection = editable.dispatcher.selectionWatcher.getFreshSelection()
  if (!selection) return null

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

function resolveDirectiveHost(
  ref: DocumentDirectiveRef,
  views: ReadonlyMap<string, DocumentComponentView>,
  preferredDirectiveKey?: string
): { host: HTMLElement; directiveKey: string } | null {
  const view = views.get(ref.componentId)
  if (!view) return null
  if (preferredDirectiveKey && view.directiveHosts.has(preferredDirectiveKey)) {
    return {
      host: view.directiveHosts.get(preferredDirectiveKey)!,
      directiveKey: preferredDirectiveKey
    }
  }
  const firstHost = view.directiveHosts.values().next().value
  if (!firstHost) return null
  for (const [directiveKey, host] of view.directiveHosts.entries()) {
    if (host === firstHost) return { host, directiveKey }
  }
  return null
}

/** Deterministic fallback among sibling directives with mounted hosts. */
export function resolveFocusFallbackAmongDirectives(options: {
  excludeComponentId?: string
  refs: DocumentDirectiveRef[]
  views: ReadonlyMap<string, DocumentComponentView>
  previousIndex: number
  parentComponentId?: string
  containerId?: string
  preferredDirectiveKey?: string
}): FocusFallback | null {
  const siblings = options.refs
    .filter(
      (ref) =>
        ref.parentComponentId === options.parentComponentId &&
        ref.containerId === options.containerId
    )
    .sort((a, b) => {
      if (a.siblingIndex !== b.siblingIndex) return a.siblingIndex - b.siblingIndex
      return a.componentId.localeCompare(b.componentId)
    })

  const tryRef = (ref: DocumentDirectiveRef | undefined): FocusFallback | null => {
    if (!ref || ref.componentId === options.excludeComponentId) return null
    const resolved = resolveDirectiveHost(ref, options.views, options.preferredDirectiveKey)
    if (!resolved) return null
    return {
      host: resolved.host,
      componentId: ref.componentId,
      directiveKey: resolved.directiveKey,
      selection: { anchor: 0, head: 0, direction: 'none' }
    }
  }

  const after = siblings.find(
    (ref) =>
      ref.componentId !== options.excludeComponentId && ref.siblingIndex > options.previousIndex
  )
  const before = [...siblings]
    .reverse()
    .find(
      (ref) =>
        ref.componentId !== options.excludeComponentId && ref.siblingIndex < options.previousIndex
    )

  return (
    tryRef(after) ??
    tryRef(before) ??
    tryRef(siblings.find((ref) => ref.componentId !== options.excludeComponentId))
  )
}

/** Deterministic fallback when a focused component is removed remotely. */
export function resolveFocusFallbackAfterRemove(options: {
  removedComponentId: string
  refs: DocumentDirectiveRef[]
  views: ReadonlyMap<string, DocumentComponentView>
  previousIndex: number
  parentComponentId?: string
  containerId?: string
  preferredDirectiveKey?: string
}): FocusFallback | null {
  return resolveFocusFallbackAmongDirectives({
    excludeComponentId: options.removedComponentId,
    refs: options.refs,
    views: options.views,
    previousIndex: options.previousIndex,
    parentComponentId: options.parentComponentId,
    containerId: options.containerId,
    preferredDirectiveKey: options.preferredDirectiveKey
  })
}

/** Fallback when the active directive disappears after a component type change. */
export function resolveFocusFallbackAfterTypeChange(options: {
  componentId: string
  refs: DocumentDirectiveRef[]
  views: ReadonlyMap<string, DocumentComponentView>
  previousIndex: number
  parentComponentId?: string
  containerId?: string
  lostDirectiveKey: string
}): FocusFallback | null {
  const sameComponentRefs = options.refs.filter((ref) => ref.componentId === options.componentId)
  for (const ref of sameComponentRefs) {
    if (ref.directiveKey === options.lostDirectiveKey) continue
    const resolved = resolveDirectiveHost(ref, options.views, ref.directiveKey)
    if (resolved) {
      return {
        host: resolved.host,
        componentId: options.componentId,
        directiveKey: resolved.directiveKey,
        selection: { anchor: 0, head: 0, direction: 'none' }
      }
    }
  }

  return resolveFocusFallbackAmongDirectives({
    excludeComponentId: options.componentId,
    refs: options.refs,
    views: options.views,
    previousIndex: options.previousIndex,
    parentComponentId: options.parentComponentId,
    containerId: options.containerId,
    preferredDirectiveKey: options.lostDirectiveKey
  })
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

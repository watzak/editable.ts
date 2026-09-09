import type * as Y from 'yjs'
import type { Editable } from '../core.js'
import type { BindingTransactionOrigin } from './binding-origin.js'
import type { EditableYjsBinding } from './editable-yjs-binding.js'
import type { InitialSyncPolicy } from './initial-sync.js'
import type { EditableYjsStructuralAdapter } from './structural-adapter.js'

/**
 * Stable reference to one editable directive field inside a component.
 * Maps to one {@link Y.Text} and one DOM host after mount.
 */
export interface DocumentDirectiveRef {
  componentId: string
  componentType: string
  directiveKey: string
  parentComponentId?: string
  containerId?: string
  siblingIndex: number
  yText: Y.Text
}

/** Component tree node — includes container-only components without editable directives. */
export interface DocumentComponentNode {
  componentId: string
  componentType: string
  parentComponentId?: string
  containerId?: string
  siblingIndex: number
}

export interface DocumentComponentValidationValid {
  status: 'valid'
  node: DocumentComponentNode
}

export interface DocumentComponentValidationInvalid {
  status: 'invalid'
  componentId: string
  reason: string
  detail?: string
}

export type DocumentComponentValidation =
  | DocumentComponentValidationValid
  | DocumentComponentValidationInvalid

/** Mounted component view — DOM is owned by the adapter, lifecycle by the document binding. */
export interface DocumentComponentView {
  componentId: string
  componentType: string
  rootElement: HTMLElement
  directiveHosts: ReadonlyMap<string, HTMLElement>
}

/** Runtime passed to adapter factories (structural hooks, mount helpers). */
export interface DocumentBindingRuntime {
  editable: Editable
  doc: Y.Doc
  root: unknown
  transactionOrigin: BindingTransactionOrigin
  initialSync: InitialSyncPolicy
  sharedUndoManager: Y.UndoManager | null
  mountDirective(ref: DocumentDirectiveRef, host: HTMLElement): EditableYjsBinding
  unmountDirective(componentId: string, directiveKey: string): void
  getDirectiveBinding(componentId: string, directiveKey: string): EditableYjsBinding | undefined
  getComponentView(componentId: string): DocumentComponentView | undefined
  remountStructure(): void
  stopUndoCapturing(): void
}

/**
 * Neutral document adapter — describes CRDT shape, DOM mounting, and structural intents.
 * No CMS-specific schema is imposed by the library.
 */
export interface EditableYjsDocumentAdapter {
  /** Returns the canonical root node inside {@link Y.Doc}. */
  getRoot(doc: Y.Doc): unknown

  /** Flat list of editable directives that require {@link EditableYjsBinding}. */
  listDirectives(root: unknown): DocumentDirectiveRef[]

  /** All component nodes including containers without text directives. */
  listComponents?(root: unknown): DocumentComponentNode[]

  /**
   * Optional validated component listing. Invalid entries are reported and skipped —
   * the binding continues syncing the rest of the document.
   */
  listComponentsWithValidation?(root: unknown): DocumentComponentValidation[]

  /** Parent element where a new component root should be appended (adapter decides placement). */
  getComponentMountParent(
    node: DocumentComponentNode,
    root: unknown,
    mounted: ReadonlyMap<string, DocumentComponentView>
  ): HTMLElement

  /** Creates or updates DOM for one component; returns directive host elements keyed by directiveKey. */
  renderComponent(
    componentId: string,
    componentType: string,
    root: unknown,
    mountParent: HTMLElement,
    siblingIndex: number
  ): DocumentComponentView

  /** Optional cleanup before the document binding removes DOM nodes. */
  destroyComponentView?(view: DocumentComponentView): void

  /** Structural command hooks wired into each text binding. */
  createStructuralAdapter(runtime: DocumentBindingRuntime): EditableYjsStructuralAdapter

  /** Subscribe to CRDT structure changes; return unsubscribe. */
  observeStructure(root: unknown, onChange: () => void): () => void

  /** Generate collision-resistant component IDs for local inserts. */
  createComponentId(): string

  /** Resolve a Y.Text back to its directive ref, if known to this adapter. */
  resolveDirective?(root: unknown, yText: Y.Text): DocumentDirectiveRef | null
}

export function directiveBindingKey(componentId: string, directiveKey: string): string {
  return `${componentId}:${directiveKey}`
}

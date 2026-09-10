import * as Y from 'yjs'
import type { Editable } from '../core.js'
import { setSelectionFromSnapshot } from '../operation-selection.js'
import {
  createBindingTransactionOrigin,
  type BindingTransactionOrigin,
  isBindingTransactionOrigin
} from './binding-origin.js'
import { EditableYjsBinding } from './editable-yjs-binding.js'
import type { InitialSyncPolicy } from './initial-sync.js'
import {
  directiveBindingKey,
  type DocumentBindingRuntime,
  type DocumentComponentNode,
  type DocumentComponentView,
  type DocumentDirectiveRef,
  type EditableYjsDocumentAdapter
} from './document-adapter.js'
import type { EditableYjsStructuralAdapter } from './structural-adapter.js'
import {
  captureActiveDirectiveSelection,
  captureFocusedDirectiveHost,
  repositionElementAtIndex,
  resolveFocusFallbackAfterRemove,
  resolveFocusFallbackAfterTypeChange,
  restoreDirectiveSelectionFromRelative,
  type ActiveDirectiveSelection
} from './document-selection-sync.js'
import {
  directiveStructureSignature,
  hasDocumentStructureChanges
} from './document-structure-reconcile.js'
import {
  diffStructureSnapshots,
  parseStructureSnapshot,
  type DocumentStructureDiagnostic
} from './document-structure-sync.js'
import type { YjsSyncDiagnosticHandler } from './sync-lifecycle.js'

/** Persistent activation state of an {@link EditableYjsDocumentBinding}. */
export type DocumentBindingLifecycleState = 'deferred' | 'active' | 'destroyed'

export interface EditableYjsDocumentBindingOptions {
  editable: Editable
  yDoc: Y.Doc
  /** Opaque root node — typically returned by {@link EditableYjsDocumentAdapter.getRoot}. */
  root: unknown
  adapter: EditableYjsDocumentAdapter
  /** Top-level mount container for component views (adapter may nest internally). */
  mountContainer: HTMLElement
  initialSync?: InitialSyncPolicy
  /**
   * When true, starts in {@link DocumentBindingLifecycleState} `deferred` until
   * {@link activate}. Call after provider `synced` or IndexedDB hydration.
   */
  deferInitialSync?: boolean
  onSyncDiagnostic?: YjsSyncDiagnosticHandler
  undo?: boolean | { captureTimeout?: number }
  onStructureDiagnostic?: (diagnostic: DocumentStructureDiagnostic) => void
  /** Invoked when a structure reconcile pass actually runs (not when skipped for text-only updates). */
  onStructureReconcile?: (reason: string) => void
}

interface MountedDirective {
  ref: DocumentDirectiveRef
  host: HTMLElement
  binding: EditableYjsBinding
}

/**
 * @experimental Document-wide Yjs collaboration controller.
 *
 * Manages component mount/unmount, per-directive {@link EditableYjsBinding} lifecycle,
 * shared undo scope, bidirectional remote structure sync, and structural adapter wiring.
 * Does not render CMS templates — that remains the adapter's responsibility.
 */
export class EditableYjsDocumentBinding {
  readonly editable: Editable
  readonly yDoc: Y.Doc
  readonly root: unknown
  readonly adapter: EditableYjsDocumentAdapter
  readonly mountContainer: HTMLElement
  readonly transactionOrigin: BindingTransactionOrigin
  readonly initialSync: InitialSyncPolicy

  private _lifecycleState: DocumentBindingLifecycleState
  private readonly sharedUndoManager: Y.UndoManager | null
  private readonly structuralAdapter: EditableYjsStructuralAdapter
  private readonly runtime: DocumentBindingRuntime
  private readonly directiveBindings = new Map<string, MountedDirective>()
  private readonly componentViews = new Map<string, DocumentComponentView>()
  private readonly trackedBindingOrigins = new Set<BindingTransactionOrigin>()
  private readonly onStructureDiagnostic?: (diagnostic: DocumentStructureDiagnostic) => void
  private unobserveStructure: (() => void) | null = null
  private unobserveTransactions: (() => void) | null = null
  private reconcileScheduled = false
  private pendingReconcileReason: string | null = null
  private localStructureDepth = 0
  private lastComponentNodes = new Map<string, DocumentComponentNode>()
  private lastDirectiveSignature = ''
  private lastStructureDiagnostics: DocumentStructureDiagnostic[] = []
  private pendingActiveSelection: ActiveDirectiveSelection | null = null
  private readonly onSyncDiagnostic?: YjsSyncDiagnosticHandler
  private readonly onStructureReconcile?: (reason: string) => void

  constructor(options: EditableYjsDocumentBindingOptions) {
    this.editable = options.editable
    this.yDoc = options.yDoc
    this.root = options.root
    this.adapter = options.adapter
    this.mountContainer = options.mountContainer
    this.onStructureDiagnostic = options.onStructureDiagnostic
    this.onStructureReconcile = options.onStructureReconcile
    this._lifecycleState = options.deferInitialSync === true ? 'deferred' : 'active'
    this.onSyncDiagnostic = options.onSyncDiagnostic
    this.transactionOrigin = createBindingTransactionOrigin()
    this.initialSync = options.initialSync ?? {
      yEmptyHostFilled: 'copy-host-to-y',
      hostEmptyYFilled: 'copy-y-to-host',
      bothFilledDiffer: 'error'
    }

    const undoEnabled = options.undo !== false
    this.sharedUndoManager = undoEnabled
      ? new Y.UndoManager(options.yDoc, {
          trackedOrigins: new Set([this.transactionOrigin]),
          captureTimeout:
            typeof options.undo === 'object' ? (options.undo.captureTimeout ?? 500) : 500
        })
      : null

    this.runtime = {
      editable: this.editable,
      doc: this.yDoc,
      root: this.root,
      transactionOrigin: this.transactionOrigin,
      initialSync: this.initialSync,
      sharedUndoManager: this.sharedUndoManager,
      mountDirective: (ref, host) => this.mountDirective(ref, host),
      unmountDirective: (componentId, directiveKey) =>
        this.unmountDirective(componentId, directiveKey),
      getDirectiveBinding: (componentId, directiveKey) =>
        this.getDirectiveBinding(componentId, directiveKey),
      getComponentView: (componentId) => this.componentViews.get(componentId),
      remountStructure: () => {
        this.stopUndoCapturing()
        this.reconcile('adapter-requested')
        queueMicrotask(() => this.stopUndoCapturing())
      },
      stopUndoCapturing: () => this.stopUndoCapturing()
    }

    this.structuralAdapter = this.adapter.createStructuralAdapter(this.runtime)

    const afterTransaction = (transaction: Y.Transaction) => {
      if (this._lifecycleState === 'destroyed') return
      if (transaction.origin === this.transactionOrigin) {
        this.scheduleReconcile('local-structure-transaction')
        return
      }
      if (this.isLocalTrackedOrigin(transaction.origin)) return
      this.scheduleReconcileIfStructureChanged('remote-transaction')
    }
    this.yDoc.on('afterTransaction', afterTransaction)
    this.unobserveTransactions = () => this.yDoc.off('afterTransaction', afterTransaction)

    this.unobserveStructure = this.adapter.observeStructure(this.root, () => {
      if (this.localStructureDepth > 0) return
      this.scheduleReconcileIfStructureChanged('remote-structure')
    })

    if (this._lifecycleState === 'deferred') {
      this.onSyncDiagnostic?.({
        kind: 'binding-deferred',
        scope: 'document',
        message: 'Document bindings deferred — call activate() after provider/persistence is ready'
      })
    }

    this.reconcile('initial')
  }

  /**
   * Persistent lifecycle state. {@link activate} moves `deferred` → `active`;
   * {@link destroy} moves any state → `destroyed`.
   */
  get lifecycleState(): DocumentBindingLifecycleState {
    return this._lifecycleState
  }

  /**
   * Activates the document and all currently mounted directive bindings.
   * Idempotent — later mounts auto-activate while the document remains `active`.
   */
  activate(): void {
    this.assertNotDestroyed()
    if (this._lifecycleState === 'active') return

    for (const mounted of this.directiveBindings.values()) {
      if (mounted.binding.isActivated) continue
      mounted.binding.activate()
    }

    this._lifecycleState = 'active'
    this.onSyncDiagnostic?.({
      kind: 'binding-activated',
      scope: 'document',
      message: 'Document activated; directive bindings initialized'
    })
  }

  /** True when lifecycle is `active` and every mounted directive binding is activated. */
  get isActivated(): boolean {
    if (this._lifecycleState !== 'active') return false
    for (const mounted of this.directiveBindings.values()) {
      if (!mounted.binding.isActivated) return false
    }
    return true
  }

  private assertNotDestroyed(): void {
    if (this._lifecycleState === 'destroyed') {
      throw new Error('EditableYjsDocumentBinding has been destroyed')
    }
  }

  get isDestroyed(): boolean {
    return this._lifecycleState === 'destroyed'
  }

  get structureDiagnostics(): readonly DocumentStructureDiagnostic[] {
    return this.lastStructureDiagnostics
  }

  getDirectiveBinding(componentId: string, directiveKey: string): EditableYjsBinding | undefined {
    return this.directiveBindings.get(directiveBindingKey(componentId, directiveKey))?.binding
  }

  getComponentView(componentId: string): DocumentComponentView | undefined {
    return this.componentViews.get(componentId)
  }

  listMountedDirectiveKeys(): string[] {
    return [...this.directiveBindings.keys()]
  }

  canUndo(): boolean {
    return this.sharedUndoManager?.canUndo() ?? false
  }

  canRedo(): boolean {
    return this.sharedUndoManager?.canRedo() ?? false
  }

  undo(): boolean {
    if (!this.sharedUndoManager?.canUndo()) return false
    this.sharedUndoManager.undo()
    this.reconcile('undo')
    this.focusAfterHistory('undo')
    return true
  }

  redo(): boolean {
    if (!this.sharedUndoManager?.canRedo()) return false
    this.sharedUndoManager.redo()
    this.reconcile('redo')
    this.focusAfterHistory('redo')
    return true
  }

  stopUndoCapturing(): void {
    this.sharedUndoManager?.stopCapturing()
  }

  /** Sync mounted views and bindings to the adapter's directive list. */
  reconcile(reason?: string): void {
    if (this._lifecycleState === 'destroyed') return
    this.reconcileStructure(reason ?? 'unspecified')
  }

  destroy(): void {
    if (this._lifecycleState === 'destroyed') return
    this._lifecycleState = 'destroyed'

    this.unobserveStructure?.()
    this.unobserveStructure = null
    this.unobserveTransactions?.()
    this.unobserveTransactions = null

    for (const componentId of [...this.componentViews.keys()]) {
      this.unmountComponent(componentId, { preserveSelection: false })
    }

    this.directiveBindings.clear()
    this.componentViews.clear()
    this.lastComponentNodes.clear()
    this.sharedUndoManager?.destroy()
    this.trackedBindingOrigins.clear()
  }

  private isLocalTrackedOrigin(origin: unknown): boolean {
    if (origin === this.transactionOrigin) return true
    for (const bindingOrigin of this.trackedBindingOrigins) {
      if (isBindingTransactionOrigin(origin, bindingOrigin)) return true
    }
    return false
  }

  private scheduleReconcile(reason: string): void {
    if (this._lifecycleState === 'destroyed' || this.reconcileScheduled) return
    this.reconcileScheduled = true
    this.pendingReconcileReason = reason
    queueMicrotask(() => {
      this.reconcileScheduled = false
      const pendingReason = this.pendingReconcileReason ?? reason
      this.pendingReconcileReason = null
      if (this._lifecycleState !== 'destroyed') this.reconcile(pendingReason)
    })
  }

  private scheduleReconcileIfStructureChanged(reason: string): void {
    if (this._lifecycleState === 'destroyed') return
    if (
      !hasDocumentStructureChanges(
        this.adapter,
        this.root,
        this.lastComponentNodes,
        this.lastDirectiveSignature
      )
    ) {
      return
    }
    this.scheduleReconcile(reason)
  }

  private reconcileStructure(reason: string): void {
    this.onStructureReconcile?.(reason)
    const activeSelection = captureActiveDirectiveSelection(
      this.editable,
      (componentId, directiveKey) => this.getDirectiveBinding(componentId, directiveKey)?.yText
    )
    if (activeSelection) this.pendingActiveSelection = activeSelection

    const snapshot = parseStructureSnapshot(this.adapter, this.root)
    this.lastStructureDiagnostics = snapshot.diagnostics
    for (const diagnostic of snapshot.diagnostics) {
      this.onStructureDiagnostic?.(diagnostic)
    }

    const diff = diffStructureSnapshots(this.lastComponentNodes, snapshot.nodes)

    for (const entry of diff) {
      if (entry.kind !== 'remove') continue
      this.unmountComponent(entry.componentId, {
        preserveSelection: true,
        removedNode: entry.previous
      })
    }

    for (const entry of diff) {
      if (entry.kind !== 'typeChange') continue
      this.replaceComponentView(entry.next!, entry.previous!)
    }

    for (const entry of diff) {
      if (entry.kind === 'remove' || entry.kind === 'typeChange') continue
      const node = entry.next!
      this.ensureComponentMounted(node, entry.kind === 'move')
    }

    this.syncDirectiveBindings(snapshot.directives, snapshot.nodes)
    this.lastComponentNodes = snapshot.nodes
    this.lastDirectiveSignature = directiveStructureSignature(snapshot.directives)

    this.restorePendingSelection()
  }

  private ensureComponentMounted(node: DocumentComponentNode, repositionOnly: boolean): void {
    let view = this.componentViews.get(node.componentId)
    const mountParent = this.adapter.getComponentMountParent(node, this.root, this.componentViews)

    if (!view) {
      view = this.adapter.renderComponent(
        node.componentId,
        node.componentType,
        this.root,
        mountParent,
        node.siblingIndex
      )
      this.componentViews.set(node.componentId, view)
      return
    }

    if (view.componentType !== node.componentType) {
      this.replaceComponentView(node)
      return
    }

    if (repositionOnly || view.rootElement.parentElement !== mountParent) {
      repositionElementAtIndex(view.rootElement, mountParent, node.siblingIndex)
    }
  }

  /** Replaces DOM and directive bindings when {@link componentType} changes for a stable id. */
  private replaceComponentView(
    node: DocumentComponentNode,
    previous?: DocumentComponentNode
  ): void {
    const existing = this.componentViews.get(node.componentId)
    if (existing && existing.componentType === node.componentType) {
      const mountParent = this.adapter.getComponentMountParent(node, this.root, this.componentViews)
      repositionElementAtIndex(existing.rootElement, mountParent, node.siblingIndex)
      return
    }

    this.prepareSelectionForComponentTypeChange(node, previous)

    if (existing) {
      for (const directiveKey of [...existing.directiveHosts.keys()]) {
        this.unmountDirective(node.componentId, directiveKey)
      }
      this.adapter.destroyComponentView?.(existing)
      existing.rootElement.remove()
      this.componentViews.delete(node.componentId)
    }

    const mountParent = this.adapter.getComponentMountParent(node, this.root, this.componentViews)
    const view = this.adapter.renderComponent(
      node.componentId,
      node.componentType,
      this.root,
      mountParent,
      node.siblingIndex
    )
    this.componentViews.set(node.componentId, view)
  }

  private prepareSelectionForComponentTypeChange(
    node: DocumentComponentNode,
    previous?: DocumentComponentNode
  ): void {
    const active = this.resolveActiveDirectiveSelection(node.componentId)
    if (!active) return

    const nextRefs = this.adapter
      .listDirectives(this.root)
      .filter((ref) => ref.componentId === node.componentId)
    const sameDirective = nextRefs.find((ref) => ref.directiveKey === active.directiveKey)
    if (sameDirective && active.relativeAnchor !== null) {
      this.pendingActiveSelection = {
        ...active,
        yText: sameDirective.yText
      }
      return
    }

    const fallback = resolveFocusFallbackAfterTypeChange({
      componentId: node.componentId,
      refs: this.adapter.listDirectives(this.root),
      views: this.componentViews,
      previousIndex: previous?.siblingIndex ?? node.siblingIndex,
      parentComponentId: node.parentComponentId,
      containerId: node.containerId,
      lostDirectiveKey: active.directiveKey
    })
    if (fallback) {
      this.pendingActiveSelection = {
        componentId: fallback.componentId,
        directiveKey: fallback.directiveKey,
        host: fallback.host,
        yText: this.getDirectiveBinding(fallback.componentId, fallback.directiveKey)?.yText ?? null,
        snapshot: fallback.selection,
        relativeAnchor: null,
        relativeHead: null
      }
      return
    }

    this.pendingActiveSelection = null
  }

  private resolveActiveDirectiveSelection(componentId?: string): ActiveDirectiveSelection | null {
    const captured =
      this.pendingActiveSelection ??
      captureActiveDirectiveSelection(
        this.editable,
        (cid, directiveKey) => this.getDirectiveBinding(cid, directiveKey)?.yText
      )
    if (captured && (!componentId || captured.componentId === componentId)) {
      return captured
    }

    const focused = captureFocusedDirectiveHost(this.componentViews)
    if (!focused || (componentId && focused.componentId !== componentId)) {
      return null
    }

    const yText = this.getDirectiveBinding(focused.componentId, focused.directiveKey)?.yText ?? null
    return {
      componentId: focused.componentId,
      directiveKey: focused.directiveKey,
      host: focused.host,
      yText,
      snapshot: { anchor: 0, head: 0, direction: 'none' },
      relativeAnchor: null,
      relativeHead: null
    }
  }

  private syncDirectiveBindings(
    directives: DocumentDirectiveRef[],
    activeNodes: Map<string, DocumentComponentNode>
  ): void {
    const nextKeys = new Set(
      directives.map((d) => directiveBindingKey(d.componentId, d.directiveKey))
    )

    for (const [key, mounted] of [...this.directiveBindings.entries()]) {
      if (!nextKeys.has(key)) {
        this.unmountDirective(mounted.ref.componentId, mounted.ref.directiveKey)
      }
    }

    for (const ref of directives) {
      const view = this.componentViews.get(ref.componentId)
      const host = view?.directiveHosts.get(ref.directiveKey)
      if (!host) continue

      const key = directiveBindingKey(ref.componentId, ref.directiveKey)
      const existing = this.directiveBindings.get(key)
      if (existing) {
        if (existing.host !== host || existing.ref.yText !== ref.yText) {
          existing.binding.destroy()
          this.trackedBindingOrigins.delete(existing.binding.transactionOrigin)
          this.directiveBindings.delete(key)
          this.mountDirective(ref, host)
        }
        continue
      }
      this.mountDirective(ref, host)
    }

    for (const [componentId] of [...this.componentViews.entries()]) {
      if (!activeNodes.has(componentId)) {
        this.unmountComponent(componentId, { preserveSelection: false })
      }
    }
  }

  private restorePendingSelection(): void {
    const pending = this.pendingActiveSelection
    if (!pending) return

    const binding = this.getDirectiveBinding(pending.componentId, pending.directiveKey)
    const host =
      this.getComponentView(pending.componentId)?.directiveHosts.get(pending.directiveKey) ??
      pending.host

    if (
      binding &&
      pending.relativeAnchor !== null &&
      restoreDirectiveSelectionFromRelative(
        this.yDoc,
        host,
        binding.yText,
        pending.relativeAnchor,
        pending.relativeHead
      )
    ) {
      this.pendingActiveSelection = null
      return
    }

    const ownerDoc = host.ownerDocument
    if (ownerDoc?.contains(host)) {
      host.focus()
      setSelectionFromSnapshot(host, pending.snapshot)
    }
    this.pendingActiveSelection = null
  }

  private focusAfterHistory(kind: 'undo' | 'redo'): void {
    void kind
    const captured = captureActiveDirectiveSelection(
      this.editable,
      (componentId, directiveKey) => this.getDirectiveBinding(componentId, directiveKey)?.yText
    )
    if (captured) {
      const host = this.getComponentView(captured.componentId)?.directiveHosts.get(
        captured.directiveKey
      )
      if (host) {
        host.focus()
        setSelectionFromSnapshot(host, captured.snapshot)
        return
      }
    }
    const first = this.directiveBindings.values().next().value as MountedDirective | undefined
    first?.host.focus()
  }

  private mountDirective(ref: DocumentDirectiveRef, host: HTMLElement): EditableYjsBinding {
    const key = directiveBindingKey(ref.componentId, ref.directiveKey)
    if (this.directiveBindings.has(key)) {
      return this.directiveBindings.get(key)!.binding
    }

    if (!this.editable.ownsBlock(host)) {
      this.editable.add(host, { plainText: false })
    }

    if (this.sharedUndoManager) {
      this.sharedUndoManager.addToScope(ref.yText)
    }

    const binding = new EditableYjsBinding({
      editable: this.editable,
      host,
      yText: ref.yText,
      initialSync: this.initialSync,
      deferInitialSync: this._lifecycleState !== 'active',
      onSyncDiagnostic: this.onSyncDiagnostic,
      undo: this.sharedUndoManager ? { undoManager: this.sharedUndoManager } : false,
      structuralAdapter: this.structuralAdapter
    })

    this.trackedBindingOrigins.add(binding.transactionOrigin)
    if (this.sharedUndoManager) {
      this.sharedUndoManager.addTrackedOrigin(binding.transactionOrigin)
    }

    this.directiveBindings.set(key, { ref, host, binding })
    return binding
  }

  private unmountDirective(componentId: string, directiveKey: string): void {
    const key = directiveBindingKey(componentId, directiveKey)
    const mounted = this.directiveBindings.get(key)
    if (!mounted) return

    mounted.binding.destroy()
    this.trackedBindingOrigins.delete(mounted.binding.transactionOrigin)
    this.sharedUndoManager?.removeTrackedOrigin(mounted.binding.transactionOrigin)
    this.directiveBindings.delete(key)

    if (this.editable.ownsBlock(mounted.host)) {
      this.editable.remove(mounted.host)
    }
  }

  private unmountComponent(
    componentId: string,
    options: { preserveSelection: boolean; removedNode?: DocumentComponentNode }
  ): void {
    const view = this.componentViews.get(componentId)
    if (!view) return

    if (options.preserveSelection && options.removedNode) {
      const active =
        this.pendingActiveSelection ??
        captureActiveDirectiveSelection(
          this.editable,
          (cid, key) => this.getDirectiveBinding(cid, key)?.yText
        )
      if (active?.componentId === componentId) {
        const fallback = resolveFocusFallbackAfterRemove({
          removedComponentId: componentId,
          refs: this.adapter.listDirectives(this.root),
          views: this.componentViews,
          previousIndex: options.removedNode.siblingIndex,
          parentComponentId: options.removedNode.parentComponentId,
          containerId: options.removedNode.containerId,
          preferredDirectiveKey: active.directiveKey
        })
        if (fallback) {
          this.pendingActiveSelection = {
            componentId: fallback.componentId,
            directiveKey: fallback.directiveKey,
            host: fallback.host,
            yText:
              this.getDirectiveBinding(fallback.componentId, fallback.directiveKey)?.yText ?? null,
            snapshot: fallback.selection,
            relativeAnchor: null,
            relativeHead: null
          }
        } else {
          this.pendingActiveSelection = null
        }
      }
    }

    for (const directiveKey of view.directiveHosts.keys()) {
      this.unmountDirective(componentId, directiveKey)
    }

    this.adapter.destroyComponentView?.(view)
    view.rootElement.remove()
    this.componentViews.delete(componentId)
  }
}

import * as Y from 'yjs'
import type { Editable } from '../core.js'
import { createBindingTransactionOrigin, type BindingTransactionOrigin } from './binding-origin.js'
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

export interface EditableYjsDocumentBindingOptions {
  editable: Editable
  yDoc: Y.Doc
  /** Opaque root node — typically returned by {@link EditableYjsDocumentAdapter.getRoot}. */
  root: unknown
  adapter: EditableYjsDocumentAdapter
  /** Top-level mount container for component views (adapter may nest internally). */
  mountContainer: HTMLElement
  initialSync?: InitialSyncPolicy
  undo?: boolean | { captureTimeout?: number }
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
 * shared undo scope, and structural adapter wiring. Does not render CMS templates —
 * that remains the adapter's responsibility.
 */
export class EditableYjsDocumentBinding {
  readonly editable: Editable
  readonly yDoc: Y.Doc
  readonly root: unknown
  readonly adapter: EditableYjsDocumentAdapter
  readonly mountContainer: HTMLElement
  readonly transactionOrigin: BindingTransactionOrigin
  readonly initialSync: InitialSyncPolicy

  private destroyed = false
  private readonly sharedUndoManager: Y.UndoManager | null
  private readonly structuralAdapter: EditableYjsStructuralAdapter
  private readonly runtime: DocumentBindingRuntime
  private readonly directiveBindings = new Map<string, MountedDirective>()
  private readonly componentViews = new Map<string, DocumentComponentView>()
  private unobserveStructure: (() => void) | null = null
  private reconcileScheduled = false

  constructor(options: EditableYjsDocumentBindingOptions) {
    this.editable = options.editable
    this.yDoc = options.yDoc
    this.root = options.root
    this.adapter = options.adapter
    this.mountContainer = options.mountContainer
    this.transactionOrigin = createBindingTransactionOrigin()
    this.initialSync = options.initialSync ?? {
      yEmptyHostFilled: 'copy-host-to-y',
      hostEmptyYFilled: 'copy-y-to-host',
      bothFilledDiffer: 'error'
    }

    const undoEnabled = options.undo !== false
    this.sharedUndoManager = undoEnabled
      ? new Y.UndoManager(options.yDoc, {
          captureTimeout:
            typeof options.undo === 'object' ? (options.undo.captureTimeout ?? 500) : 500
        })
      : null
    if (this.sharedUndoManager) {
      this.sharedUndoManager.addTrackedOrigin(this.transactionOrigin)
    }

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
    this.unobserveStructure = this.adapter.observeStructure(this.root, () => {
      this.scheduleReconcile('crdt-structure')
    })

    this.reconcile('initial')
  }

  get isDestroyed(): boolean {
    return this.destroyed
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
    return true
  }

  redo(): boolean {
    if (!this.sharedUndoManager?.canRedo()) return false
    this.sharedUndoManager.redo()
    this.reconcile('redo')
    return true
  }

  stopUndoCapturing(): void {
    this.sharedUndoManager?.stopCapturing()
  }

  /** Sync mounted views and bindings to the adapter's directive list. */
  reconcile(reason?: string): void {
    if (this.destroyed) return
    void reason

    const directives = this.adapter.listDirectives(this.root)
    const nextKeys = new Set(
      directives.map((d) => directiveBindingKey(d.componentId, d.directiveKey))
    )
    const componentsNeeded = new Map<string, DocumentDirectiveRef[]>()
    const componentNodes = new Map<string, DocumentComponentNode>()

    const nodes = this.adapter.listComponents?.(this.root) ?? []
    for (const node of nodes) {
      componentNodes.set(node.componentId, node)
      if (!componentsNeeded.has(node.componentId)) {
        componentsNeeded.set(node.componentId, [])
      }
    }

    for (const ref of directives) {
      const list = componentsNeeded.get(ref.componentId) ?? []
      list.push(ref)
      componentsNeeded.set(ref.componentId, list)
      if (!componentNodes.has(ref.componentId)) {
        componentNodes.set(ref.componentId, {
          componentId: ref.componentId,
          componentType: ref.componentType,
          parentComponentId: ref.parentComponentId,
          containerId: ref.containerId,
          siblingIndex: ref.siblingIndex
        })
      }
    }

    for (const [key, mounted] of [...this.directiveBindings.entries()]) {
      if (!nextKeys.has(key)) {
        this.unmountDirective(mounted.ref.componentId, mounted.ref.directiveKey)
      }
    }

    for (const [componentId, refs] of componentsNeeded.entries()) {
      const node = componentNodes.get(componentId)
      if (!node) continue
      let view = this.componentViews.get(componentId)
      if (!view) {
        const mountParent = this.adapter.getComponentMountParent(
          node,
          this.root,
          this.componentViews
        )
        view = this.adapter.renderComponent(
          componentId,
          node.componentType,
          this.root,
          mountParent,
          node.siblingIndex
        )
        this.componentViews.set(componentId, view)
      }

      for (const ref of refs) {
        const key = directiveBindingKey(ref.componentId, ref.directiveKey)
        const host = view.directiveHosts.get(ref.directiveKey)
        if (!host) continue
        const existing = this.directiveBindings.get(key)
        if (existing) {
          if (existing.host !== host || existing.ref.yText !== ref.yText) {
            existing.binding.destroy()
            this.directiveBindings.delete(key)
            this.mountDirective(ref, host)
          }
          continue
        }
        this.mountDirective(ref, host)
      }
    }

    for (const [componentId] of [...this.componentViews.entries()]) {
      if (!componentsNeeded.has(componentId)) {
        this.unmountComponent(componentId)
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    this.unobserveStructure?.()
    this.unobserveStructure = null

    for (const componentId of [...this.componentViews.keys()]) {
      this.unmountComponent(componentId)
    }

    this.directiveBindings.clear()
    this.componentViews.clear()
    this.sharedUndoManager?.destroy()
  }

  private scheduleReconcile(reason: string): void {
    if (this.destroyed || this.reconcileScheduled) return
    this.reconcileScheduled = true
    queueMicrotask(() => {
      this.reconcileScheduled = false
      if (!this.destroyed) this.reconcile(reason)
    })
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
      undo: this.sharedUndoManager ? { undoManager: this.sharedUndoManager } : false,
      structuralAdapter: this.structuralAdapter
    })

    this.directiveBindings.set(key, { ref, host, binding })
    return binding
  }

  private unmountDirective(componentId: string, directiveKey: string): void {
    const key = directiveBindingKey(componentId, directiveKey)
    const mounted = this.directiveBindings.get(key)
    if (!mounted) return

    mounted.binding.destroy()
    this.directiveBindings.delete(key)

    if (this.editable.ownsBlock(mounted.host)) {
      this.editable.remove(mounted.host)
    }
  }

  private unmountComponent(componentId: string): void {
    const view = this.componentViews.get(componentId)
    if (!view) return

    for (const directiveKey of view.directiveHosts.keys()) {
      this.unmountDirective(componentId, directiveKey)
    }

    this.adapter.destroyComponentView?.(view)
    view.rootElement.remove()
    this.componentViews.delete(componentId)
  }
}

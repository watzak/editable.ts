import * as Y from 'yjs'
import type { EditableYjsDocumentBinding } from './editable-yjs-document-binding.js'
import type { ComponentDeleteAnnotationPolicy } from './annotation-types.js'
import { AnnotationStore, getOrCreateAnnotationsMap } from './annotation-store.js'
import { EditableYjsAnnotations } from './editable-yjs-annotations.js'
import type { AnnotationRenderer } from './annotation-renderer.js'
import { createBindingTransactionOrigin } from './binding-origin.js'

export interface EditableYjsDocumentAnnotationsOptions {
  documentBinding: EditableYjsDocumentBinding
  /** Shared annotation map — persisted in Y.Doc, synced by your provider. */
  annotations?: Y.Map<unknown>
  authorId: string
  renderer?: AnnotationRenderer
  componentDeletePolicy?: ComponentDeleteAnnotationPolicy
  transactionOrigin?: unknown
}

/**
 * Wires persistent annotations across all directive hosts in a document binding.
 *
 * Call {@link sync} after {@link EditableYjsDocumentBinding.reconcile} so hosts stay aligned.
 */
export class EditableYjsDocumentAnnotations {
  readonly store: AnnotationStore
  readonly documentBinding: EditableYjsDocumentBinding

  private destroyed = false
  private readonly authorId: string
  private readonly renderer?: AnnotationRenderer
  private readonly componentDeletePolicy: ComponentDeleteAnnotationPolicy
  private readonly perDirective = new Map<string, EditableYjsAnnotations>()
  private knownComponentIds = new Set<string>()

  constructor(options: EditableYjsDocumentAnnotationsOptions) {
    this.documentBinding = options.documentBinding
    this.authorId = options.authorId
    this.renderer = options.renderer
    this.componentDeletePolicy = options.componentDeletePolicy ?? 'orphan'

    const doc = options.documentBinding.yDoc
    const map = options.annotations ?? getOrCreateAnnotationsMap(doc)
    const origin = options.transactionOrigin ?? createBindingTransactionOrigin()
    this.store = new AnnotationStore(map, origin)
  }

  sync(): void {
    if (this.destroyed) return

    const adapter = this.documentBinding.adapter
    const root = this.documentBinding.root
    const refs = adapter.listDirectives(root)
    const nextKeys = new Set<string>()
    const nextComponentIds = new Set<string>()

    for (const ref of refs) {
      nextComponentIds.add(ref.componentId)
      const binding = this.documentBinding.getDirectiveBinding(ref.componentId, ref.directiveKey)
      const view = this.documentBinding.getComponentView(ref.componentId)
      const host = view?.directiveHosts.get(ref.directiveKey)
      if (!binding || !host) continue

      const key = `${ref.componentId}:${ref.directiveKey}`
      nextKeys.add(key)

      let annotations = this.perDirective.get(key)
      if (!annotations) {
        annotations = new EditableYjsAnnotations({
          editable: this.documentBinding.editable,
          host,
          yText: binding.yText,
          store: this.store,
          authorId: this.authorId,
          componentId: ref.componentId,
          directiveId: ref.directiveKey,
          renderer: this.renderer
        })
        this.perDirective.set(key, annotations)
      }
    }

    for (const [key, annotations] of this.perDirective) {
      if (!nextKeys.has(key)) {
        annotations.destroy()
        this.perDirective.delete(key)
      }
    }

    for (const componentId of this.knownComponentIds) {
      if (nextComponentIds.has(componentId)) continue
      if (this.componentDeletePolicy === 'remove') {
        this.store.removeByComponent(componentId)
      } else {
        this.store.markOrphanedByComponent(componentId)
      }
    }
    this.knownComponentIds = nextComponentIds
  }

  getDirectiveAnnotations(
    componentId: string,
    directiveId: string
  ): EditableYjsAnnotations | undefined {
    return this.perDirective.get(`${componentId}:${directiveId}`)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const annotations of this.perDirective.values()) {
      annotations.destroy()
    }
    this.perDirective.clear()
  }
}

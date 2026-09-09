import * as Y from 'yjs'
import type { Editable } from '../core.js'
import { getOperationTextLength } from '../operation-offset.js'
import { captureSelectionSnapshot } from '../operation-selection.js'
import type { AnnotationType } from './annotation-types.js'
import { resolveAnnotationRange, resolveAnnotationsForHost } from './annotation-resolver.js'
import {
  defaultAnnotationRenderer,
  ensureAnnotationStyles,
  getOrCreateAnnotationLayer,
  removeAnnotationLayer,
  type AnnotationRenderer
} from './annotation-renderer.js'
import { AnnotationStore } from './annotation-store.js'
import { offsetsToRelativePositionJson } from './relative-position.js'
export interface EditableYjsAnnotationsOptions {
  editable: Editable
  host: HTMLElement
  yText: Y.Text
  store: AnnotationStore
  authorId: string
  componentId?: string
  directiveId?: string
  renderer?: AnnotationRenderer
  reducedMotion?: boolean
}

/**
 * Persistent collaborative annotations for one directive host.
 *
 * Overlays only — never mutates host HTML or Y.Text formatting attributes.
 */
export class EditableYjsAnnotations {
  readonly editable: Editable
  readonly host: HTMLElement
  readonly yText: Y.Text
  readonly store: AnnotationStore
  readonly componentId?: string
  readonly directiveId?: string

  private destroyed = false
  private readonly authorId: string
  private readonly renderer: AnnotationRenderer
  private readonly reducedMotion: boolean
  private readonly doc: Document
  private readonly win: Window
  private unobserveStore: (() => void) | null = null
  private disconnectObserver: MutationObserver | null = null

  private readonly onStoreChange: () => void
  private readonly onYTextChange: () => void
  private readonly onScrollOrResize: () => void

  constructor(options: EditableYjsAnnotationsOptions) {
    validateAnnotationOptions(options)

    this.editable = options.editable
    this.host = options.host
    this.yText = options.yText
    this.store = options.store
    this.authorId = options.authorId
    this.componentId = options.componentId
    this.directiveId = options.directiveId
    this.renderer = options.renderer ?? { render: defaultAnnotationRenderer }
    this.doc = options.host.ownerDocument
    this.win = this.doc.defaultView ?? options.editable.win
    this.reducedMotion =
      options.reducedMotion ??
      this.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false

    this.onStoreChange = () => this.scheduleRender()
    this.onYTextChange = () => this.scheduleRender()
    this.onScrollOrResize = () => this.scheduleRender()

    ensureAnnotationStyles(this.doc)
    this.attachListeners()
    this.attachHostDisconnectObserver()
    this.render()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.detachListeners()
    this.disconnectObserver?.disconnect()
    this.disconnectObserver = null
    this.renderer.destroy?.(getOrCreateAnnotationLayer(this.host))
    removeAnnotationLayer(this.host)
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  /** Creates a collapsed annotation at the current caret. */
  createAtCursor(type: AnnotationType, data?: { body?: string }): string | null {
    const snapshot = captureSelectionSnapshot(
      this.host,
      this.editable.dispatcher.selectionWatcher.getFreshSelection()
    )
    if (!snapshot) return null
    return this.createAtOffsets(type, snapshot.anchor, snapshot.head, data)
  }

  /** Creates an annotation for an explicit UTF-16 range (collapsed or expanded). */
  createAtOffsets(
    type: AnnotationType,
    anchor: number,
    head: number,
    data?: { body?: string }
  ): string | null {
    if (this.destroyed) return null
    const doc = this.yText.doc
    if (!doc) return null

    const textLength = getOperationTextLength(this.host)
    const positions = offsetsToRelativePositionJson(this.yText, anchor, head, textLength)
    if (positions.anchor === null || positions.head === null) return null

    return this.store.create({
      type,
      componentId: this.componentId,
      directiveId: this.directiveId,
      anchor: positions.anchor,
      head: positions.head,
      authorId: this.authorId,
      data
    })
  }

  addReply(annotationId: string, body: string): boolean {
    return this.store.addReply(annotationId, { authorId: this.authorId, body })
  }

  resolve(annotationId: string): boolean {
    return this.store.resolve(annotationId, this.authorId)
  }

  reopen(annotationId: string): boolean {
    return this.store.reopen(annotationId)
  }

  refresh(): void {
    if (this.destroyed) return
    this.reconcileOrphanedStatuses()
    this.render()
  }

  private attachListeners(): void {
    this.unobserveStore = this.store.observe(this.onStoreChange)
    this.yText.observe(this.onYTextChange)
    this.win.addEventListener('scroll', this.onScrollOrResize, true)
    this.win.addEventListener('resize', this.onScrollOrResize)
  }

  private detachListeners(): void {
    this.unobserveStore?.()
    this.unobserveStore = null
    this.yText.unobserve(this.onYTextChange)
    this.win.removeEventListener('scroll', this.onScrollOrResize, true)
    this.win.removeEventListener('resize', this.onScrollOrResize)
  }

  private attachHostDisconnectObserver(): void {
    if (typeof MutationObserver === 'undefined') return
    const root = this.doc.documentElement
    if (!root) return

    this.disconnectObserver = new MutationObserver(() => {
      if (!this.destroyed && !this.host.isConnected) this.destroy()
    })
    this.disconnectObserver.observe(root, { childList: true, subtree: true })
  }

  private scheduleRender(): void {
    if (this.destroyed) return
    requestAnimationFrame(() => {
      if (!this.destroyed) {
        this.reconcileOrphanedStatuses()
        this.render()
      }
    })
  }

  private reconcileOrphanedStatuses(): void {
    const doc = this.yText.doc
    if (!doc) return

    for (const record of this.store.list()) {
      if (record.status === 'orphaned') continue
      if (this.componentId && record.componentId && record.componentId !== this.componentId) {
        continue
      }
      if (this.directiveId && record.directiveId && record.directiveId !== this.directiveId) {
        continue
      }

      const resolved = resolveAnnotationRange(record, {
        doc,
        yText: this.yText,
        componentId: this.componentId,
        directiveId: this.directiveId
      })
      if (resolved?.orphaned) {
        this.store.markOrphaned(record.id)
      }
    }
  }

  private render(): void {
    if (this.destroyed || !this.host.isConnected) return
    const doc = this.yText.doc
    if (!doc) return

    const records = this.store.list().filter((record) => {
      if (this.componentId && record.componentId && record.componentId !== this.componentId) {
        return false
      }
      if (this.directiveId && record.directiveId && record.directiveId !== this.directiveId) {
        return false
      }
      return true
    })

    const views = resolveAnnotationsForHost(records, {
      doc,
      yText: this.yText,
      componentId: this.componentId,
      directiveId: this.directiveId
    })

    const layer = getOrCreateAnnotationLayer(this.host)
    this.renderer.render({
      host: this.host,
      layer,
      annotations: views,
      reducedMotion: this.reducedMotion
    })
  }
}

function validateAnnotationOptions(options: EditableYjsAnnotationsOptions): void {
  const { editable, host, yText, store, authorId } = options
  if (!editable?.ownsBlock(host)) {
    throw new Error('EditableYjsAnnotations: host is not registered with the Editable instance')
  }
  if (!host.isConnected) {
    throw new Error('EditableYjsAnnotations: host is not connected to the document')
  }
  if (!(yText instanceof Y.Text)) {
    throw new Error('EditableYjsAnnotations: yText must be a Y.Text instance')
  }
  if (!yText.doc) {
    throw new Error('EditableYjsAnnotations: yText must belong to a Y.Doc')
  }
  if (!store) {
    throw new Error('EditableYjsAnnotations: store is required')
  }
  if (!authorId) {
    throw new Error('EditableYjsAnnotations: authorId is required')
  }
}

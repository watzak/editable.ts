import * as Y from 'yjs'
import type { Editable } from '../core.js'
import { getOperationTextLength } from '../operation-offset.js'
import { captureSelectionSnapshot, setSelectionFromSnapshot } from '../operation-selection.js'
import type { EditableOperationBatch } from '../operation-types.js'
import type { BindingTransactionOrigin } from './binding-origin.js'
import { offsetsToRelativePositionJson, resolvePresenceSelection } from './relative-position.js'

/** Stack-item metadata key for UTF-16 selection restored after undo/redo. */
export const UNDO_SELECTION_META_KEY = 'editable.ts:undo:selection:v1'

export interface YjsBindingUndoStatus {
  canUndo: boolean
  canRedo: boolean
}

export interface BindingUndoOptions {
  /** When omitted and {@link BindingUndoOptions.enabled}, an internal manager is created. */
  undoManager?: Y.UndoManager
  /** Enables undo integration. Default: true when this options object is provided. */
  enabled?: boolean
  /** Keystroke merge window in ms. Default: 500 */
  captureTimeout?: number
  onStatusChange?: (status: YjsBindingUndoStatus) => void
}

interface PendingSelectionMeta {
  anchor: ReturnType<typeof offsetsToRelativePositionJson>['anchor']
  head: ReturnType<typeof offsetsToRelativePositionJson>['head']
}

interface UndoStackItemEvent {
  stackItem: { meta: Map<unknown, unknown> }
  type: 'undo' | 'redo'
  origin: unknown
}

type StackItemHandler = (event: UndoStackItemEvent) => void

/**
 * Wraps {@link Y.UndoManager} for one {@link EditableYjsBinding}.
 * Tracks only the binding transaction origin; remote edits are excluded.
 */
export class YjsBindingUndoController {
  readonly undoManager: Y.UndoManager
  private readonly ownsUndoManager: boolean
  private readonly host: HTMLElement
  private readonly yText: Y.Text
  private readonly editable: Editable
  private readonly transactionOrigin: BindingTransactionOrigin
  private readonly onStatusChange?: (status: YjsBindingUndoStatus) => void

  private pendingSelectionMeta: PendingSelectionMeta | null = null
  private destroyed = false

  private readonly onStackItemAdded: StackItemHandler
  private readonly onStackItemPopped: StackItemHandler
  private readonly onBeforeInput: (event: Event) => void

  constructor(options: {
    editable: Editable
    host: HTMLElement
    yText: Y.Text
    transactionOrigin: BindingTransactionOrigin
    undo?: BindingUndoOptions
  }) {
    const undoOptions = options.undo
    if (!undoOptions) {
      throw new Error('YjsBindingUndoController requires undo options')
    }

    this.editable = options.editable
    this.host = options.host
    this.yText = options.yText
    this.transactionOrigin = options.transactionOrigin
    this.onStatusChange = undoOptions.onStatusChange

    if (undoOptions.undoManager) {
      this.undoManager = undoOptions.undoManager
      this.ownsUndoManager = false
      this.undoManager.addTrackedOrigin(this.transactionOrigin)
    } else {
      this.undoManager = new Y.UndoManager(this.yText, {
        trackedOrigins: new Set([this.transactionOrigin]),
        captureTimeout: undoOptions.captureTimeout ?? 500
      })
      this.ownsUndoManager = true
    }

    this.onStackItemAdded = ({ stackItem }) => {
      if (this.pendingSelectionMeta) {
        stackItem.meta.set(UNDO_SELECTION_META_KEY, this.pendingSelectionMeta)
      }
      this.notifyStatusChange()
    }

    this.onStackItemPopped = ({ stackItem }) => {
      this.restoreSelectionFromMeta(stackItem.meta.get(UNDO_SELECTION_META_KEY))
      this.notifyStatusChange()
    }

    this.onBeforeInput = (event: Event) => {
      const input = event as InputEvent
      if (input.inputType !== 'historyUndo' && input.inputType !== 'historyRedo') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (input.inputType === 'historyUndo') {
        this.undo()
      } else {
        this.redo()
      }
    }

    this.undoManager.on('stack-item-added', this.onStackItemAdded)
    this.undoManager.on('stack-item-popped', this.onStackItemPopped)
    this.host.addEventListener('beforeinput', this.onBeforeInput, true)
    this.notifyStatusChange()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    this.undoManager.off('stack-item-added', this.onStackItemAdded)
    this.undoManager.off('stack-item-popped', this.onStackItemPopped)
    this.host.removeEventListener('beforeinput', this.onBeforeInput, true)

    if (this.ownsUndoManager) {
      this.undoManager.destroy()
    } else {
      this.undoManager.removeTrackedOrigin(this.transactionOrigin)
    }
  }

  canUndo(): boolean {
    return !this.destroyed && this.undoManager.canUndo()
  }

  canRedo(): boolean {
    return !this.destroyed && this.undoManager.canRedo()
  }

  undo(): boolean {
    if (!this.canUndo()) return false
    this.undoManager.undo()
    this.notifyStatusChange()
    return true
  }

  redo(): boolean {
    if (!this.canRedo()) return false
    this.undoManager.redo()
    this.notifyStatusChange()
    return true
  }

  /** Call immediately before a local binding transaction. */
  prepareTransaction(batch: EditableOperationBatch): void {
    if (this.destroyed) return
    if (shouldStopCapturing(batch)) {
      this.undoManager.stopCapturing()
    }

    const selectionWatcher = this.editable.dispatcher.selectionWatcher
    const snapshot = captureSelectionSnapshot(this.host, selectionWatcher.getFreshSelection())
    const textLength = getOperationTextLength(this.host)
    if (!snapshot) {
      this.pendingSelectionMeta = null
      return
    }

    this.pendingSelectionMeta = offsetsToRelativePositionJson(
      this.yText,
      snapshot.anchor,
      snapshot.head,
      textLength
    )
  }

  /** Forces the next edit to start a fresh undo stack item (e.g. structural intent). */
  stopCapturing(): void {
    if (!this.destroyed) this.undoManager.stopCapturing()
  }

  clearStack(): void {
    if (!this.destroyed) this.undoManager.clear(true, true)
    this.notifyStatusChange()
  }

  private restoreSelectionFromMeta(meta: unknown): void {
    if (!meta || typeof meta !== 'object') return
    const doc = this.yText.doc
    if (!doc) return

    const candidate = meta as PendingSelectionMeta
    const resolved = resolvePresenceSelection(doc, this.yText, candidate.anchor, candidate.head)
    if (!resolved) return

    setSelectionFromSnapshot(this.host, {
      anchor: resolved.anchor,
      head: resolved.head,
      direction: resolved.head >= resolved.anchor ? 'forward' : 'backward'
    })
    this.editable.dispatcher.selectionWatcher.syncSelection()
  }

  private notifyStatusChange(): void {
    this.onStatusChange?.({
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    })
  }
}

export function shouldStopCapturing(batch: EditableOperationBatch): boolean {
  if (batch.source === 'paste' || batch.source === 'composition') return true
  if (batch.source === 'api') return true
  if (batch.operations.some((op) => op.type === 'setTextAttributes')) return true
  return false
}

export function resolveBindingUndoOptions(
  undo: boolean | BindingUndoOptions | undefined
): BindingUndoOptions | undefined {
  if (undo === undefined || undo === false) return undefined
  if (undo === true) return { enabled: true }
  return undo
}

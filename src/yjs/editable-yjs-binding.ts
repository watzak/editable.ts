import * as Y from 'yjs'
import type { Editable } from '../core.js'
import { isPlainTextBlock } from '../block.js'
import { diffToOperations } from '../operation-diff.js'
import { applyLiveOperationBatchToDom } from '../operation-apply.js'
import { getBlockOperationText } from '../operation-text-model.js'
import { getOperationTextLength } from '../operation-offset.js'
import { applyEditableOperationsToYText } from './apply-operations-to-ytext.js'
import {
  createBindingTransactionOrigin,
  INITIAL_SYNC_ORIGIN,
  isBindingTransactionOrigin,
  type BindingTransactionOrigin
} from './binding-origin.js'
import {
  resolveBindingUndoOptions,
  YjsBindingUndoController,
  type BindingUndoOptions,
  type YjsBindingUndoStatus
} from './binding-undo.js'
import {
  classifyInitialSync,
  InitialSyncConflictError,
  type InitialSyncPolicy
} from './initial-sync.js'
import { insertHostRunsIntoYText } from './dom-to-ytext.js'
import { PlainTextYjsError } from './plain-text-yjs-error.js'
import {
  buildCopyYTextDeltaToHostOperations,
  hostHasInlineAttributes,
  hostRichTextMatchesYText,
  promoteHostInlineFormatsToYText,
  reconcileHostToCanonicalYText,
  yTextHasInlineAttributes,
  type ReconcileDiagnostics
} from './reconcile.js'
import { YjsStructuralBridge } from './structural-bridge.js'
import type { EditableYjsStructuralAdapter } from './structural-adapter.js'
import { getBlockTextRuns, textRunsToPlainText } from './dom-text-runs.js'
import { yTextDeltaToOperations, type YTextDeltaOp } from './ytext-delta-to-operations.js'
import { captureSelectionSnapshot } from '../operation-selection.js'
import type { EditableOperation, EditableOperationBatch } from '../operation-types.js'

export interface EditableYjsBindingOptions {
  editable: Editable
  host: HTMLElement
  yText: Y.Text
  initialSync: InitialSyncPolicy
  /** Enables {@link Y.UndoManager} integration scoped to this binding origin. */
  undo?: boolean | BindingUndoOptions
  /** Optional block-structure hooks — no global schema is imposed. */
  structuralAdapter?: EditableYjsStructuralAdapter
}

type OperationHandler = (host: HTMLElement, batch: EditableOperationBatch) => void
type YTextObserver = (event: Y.YTextEvent, transaction: Y.Transaction) => void

/**
 * Yjs adapter for a single block host and {@link Y.Text}.
 *
 * Plain-text hosts (`data-plaintext="true"`) sync character data only.
 * Rich-text hosts additionally sync inline formats via Y.Text delta attributes
 * through the {@link InlineFormatRegistry} default codecs.
 *
 * After initialization {@link Y.Text} is canonical. Local {@link EditableOperationBatch}
 * objects are applied in one {@link Y.Doc} transaction; foreign deltas patch the host.
 */
export class EditableYjsBinding {
  readonly editable: Editable
  readonly host: HTMLElement
  readonly yText: Y.Text
  readonly transactionOrigin: BindingTransactionOrigin
  readonly richText: boolean

  private destroyed = false
  private canonicalYText = ''
  private readonly operationHandler: OperationHandler
  private readonly yTextObserver: YTextObserver
  private readonly undoController: YjsBindingUndoController | null
  private readonly structuralBridge: YjsStructuralBridge | null

  constructor(options: EditableYjsBindingOptions) {
    validateBindingOptions(options)

    this.editable = options.editable
    this.host = options.host
    this.yText = options.yText
    this.transactionOrigin = createBindingTransactionOrigin()
    this.richText = !isPlainTextBlock(options.host)

    const undoOptions = resolveBindingUndoOptions(options.undo)
    this.undoController = undoOptions
      ? new YjsBindingUndoController({
          editable: this.editable,
          host: this.host,
          yText: this.yText,
          transactionOrigin: this.transactionOrigin,
          undo: undoOptions
        })
      : null

    this.structuralBridge = options.structuralAdapter
      ? new YjsStructuralBridge(this, options.structuralAdapter)
      : null

    this.operationHandler = (host, batch) => {
      this.handleLocalOperationBatch(host, batch)
    }
    this.yTextObserver = (event, transaction) => {
      this.handleYTextChange(event, transaction)
    }

    runInitialSync(this, options.initialSync)
    this.canonicalYText = this.yText.toString()
    this.undoController?.clearStack()
    this.attachSyncListeners()
    this.syncEditableConfirmedState()
  }

  /** External {@link Y.UndoManager} when configured; otherwise the internal instance. */
  get undoManager(): Y.UndoManager | null {
    return this.undoController?.undoManager ?? null
  }

  canUndo(): boolean {
    return this.undoController?.canUndo() ?? false
  }

  canRedo(): boolean {
    return this.undoController?.canRedo() ?? false
  }

  undo(): boolean {
    if (!this.undoController?.undo()) return false
    this.canonicalYText = this.yText.toString()
    this.syncEditableConfirmedState()
    return true
  }

  redo(): boolean {
    if (!this.undoController?.redo()) return false
    this.canonicalYText = this.yText.toString()
    this.syncEditableConfirmedState()
    return true
  }

  /** Forces the next local edit to become a separate undo stack item. */
  stopUndoCapturing(): void {
    this.undoController?.stopCapturing()
  }

  /** Releases listeners and references. Idempotent. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.editable.off('operation', this.operationHandler)
    this.yText.unobserve(this.yTextObserver)
    this.structuralBridge?.destroy()
    this.undoController?.destroy()
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  assertActive(): void {
    if (this.destroyed) {
      throw new Error('EditableYjsBinding has been destroyed')
    }
  }

  /**
   * Recovery when host operation text diverges from canonical {@link Y.Text}.
   * Applies Y.Text to the host — never overwrites Y from the host.
   */
  reconcile(reason?: string): ReconcileDiagnostics {
    this.assertActive()
    const run = () =>
      reconcileHostToCanonicalYText(
        this.editable,
        this.host,
        this.yText,
        reason,
        this.yjsApplyOptions()
      )

    // Rich-text reconcile may promote host formatting into Y.Text. Running it under the
    // binding origin keeps that write from re-entering our own Y.Text observer.
    const doc = this.yText.doc
    let result!: ReconcileDiagnostics
    if (doc) {
      doc.transact(() => {
        result = run()
      }, this.transactionOrigin)
    } else {
      result = run()
    }

    this.canonicalYText = this.yText.toString()
    this.syncEditableConfirmedState()
    return result
  }

  /**
   * Copies inline runs from the host into canonical {@link Y.Text} when they diverge
   * (e.g. DOM was formatted before the CRDT received attributes).
   */
  syncRichHostRunsToYText(): void {
    this.assertActive()
    this.syncRichYTextFromHostIfNeeded()
    this.syncEditableConfirmedState()
  }

  private attachSyncListeners(): void {
    this.editable.on('operation', this.operationHandler)
    this.yText.observe(this.yTextObserver)
  }

  private syncEditableConfirmedState(): void {
    const capture = this.editable.dispatcher.operationCapture
    const selectionWatcher = this.editable.dispatcher.selectionWatcher
    capture.syncConfirmedState(this.host, selectionWatcher)
  }

  private yjsApplyOptions() {
    return {
      richText: this.richText,
      doc: this.host.ownerDocument ?? undefined
    }
  }

  private handleLocalOperationBatch(host: HTMLElement, batch: EditableOperationBatch): void {
    if (this.destroyed || host !== this.host) return
    if (batch.operations.length === 0) return

    if (!this.richText) {
      assertPlainTextBatch(batch)
    }

    const doc = this.yText.doc
    if (!doc) {
      throw new PlainTextYjsError('EditableYjsBinding: Y.Text must belong to a Y.Doc')
    }

    this.undoController?.prepareTransaction(batch)

    doc.transact(() => {
      applyEditableOperationsToYText(this.yText, batch.operations, this.yjsApplyOptions())
    }, this.transactionOrigin)
    this.canonicalYText = this.yText.toString()
    const hostAfterLocal = getBlockOperationText(this.host)
    if (hostAfterLocal !== this.canonicalYText) {
      this.reconcile('post-local-batch')
      this.canonicalYText = this.yText.toString()
    }
    this.syncRichYTextFromHostIfNeeded()
  }

  /**
   * Copies host formatting into Y.Text after a local batch left the CRDT plain
   * (e.g. a toggle that only reached the DOM). Text content must already match, so this
   * never overwrites remote edits.
   */
  private syncRichYTextFromHostIfNeeded(): void {
    if (!this.richText) return
    const doc = this.host.ownerDocument
    if (!doc) return
    if (yTextHasInlineAttributes(this.yText)) return
    if (!hostHasInlineAttributes(this.host)) return
    if (textRunsToPlainText(getBlockTextRuns(this.host)) !== this.yText.toString()) return

    this.yText.doc?.transact(() => {
      promoteHostInlineFormatsToYText(this.yText, this.host, doc)
    }, this.transactionOrigin)
    this.canonicalYText = this.yText.toString()
  }

  private handleYTextChange(event: Y.YTextEvent, transaction: Y.Transaction): void {
    if (this.destroyed) return
    if (isBindingTransactionOrigin(transaction.origin, this.transactionOrigin)) return

    const hostText = getBlockOperationText(this.host)
    const targetY = this.yText.toString()

    // Incremental delta patching relies on host indices matching canonical Y.Text. That only
    // holds for attribute-only deltas; any insert/delete arriving while the host is mid-edit
    // (or after a sync race) would apply at shifted offsets. Text changes therefore go through
    // the full reconcile path, which rebuilds the host from canonical Y.Text.
    if (hostText === targetY && isAttributeOnlyDelta(event.delta)) {
      const operations = yTextDeltaToOperations(event.delta, this.yjsApplyOptions())
      if (operations.length > 0) {
        this.applyRemoteOperationsToHost(operations)
        this.syncHostToCanonicalYText('delta')
      }
    } else {
      this.reconcile('remote-yjs-drift')
    }

    this.canonicalYText = this.yText.toString()
    this.ensureRichHostMatchesYText()
    this.syncEditableConfirmedState()
  }

  private applyRemoteOperationsToHost(operations: readonly EditableOperation[]): void {
    const capture = this.editable.dispatcher.operationCapture
    const selectionWatcher = this.editable.dispatcher.selectionWatcher
    const selectionBefore = captureSelectionSnapshot(
      this.host,
      selectionWatcher.getFreshSelection()
    )

    capture.beginRemoteApply(this.host)
    try {
      applyLiveOperationBatchToDom(
        this.host,
        { source: 'remote', operations },
        { preserveSelection: true, selectionBefore }
      )
    } finally {
      capture.endRemoteApply(this.host)
    }
  }

  /** Rebuilds inline formatting from {@link Y.Text} when plain text matches but attributes do not. */
  private ensureRichHostMatchesYText(): void {
    if (!this.richText) return
    const doc = this.host.ownerDocument
    if (!doc) return
    if (hostRichTextMatchesYText(this.host, this.yText, doc)) return

    this.syncRichYTextFromHostIfNeeded()
    if (hostRichTextMatchesYText(this.host, this.yText, doc)) return

    const hostLength = getOperationTextLength(this.host)
    const capture = this.editable.dispatcher.operationCapture
    capture.beginRemoteApply(this.host)
    try {
      applyLiveOperationBatchToDom(
        this.host,
        {
          source: 'remote',
          operations: buildCopyYTextDeltaToHostOperations(this.yText, hostLength, doc)
        },
        { preserveSelection: true }
      )
    } finally {
      capture.endRemoteApply(this.host)
    }
    this.canonicalYText = this.yText.toString()
  }

  /** Recovery when delta-based apply did not reach canonical {@link Y.Text}. */
  private syncHostToCanonicalYText(reason: string): void {
    const target = this.yText.toString()
    let hostText = getBlockOperationText(this.host)

    if (hostText === target) {
      this.canonicalYText = target
      return
    }

    const repairOps = diffToOperations(hostText, target)
    if (repairOps.length > 0) {
      applyLiveOperationBatchToDom(this.host, {
        source: 'remote',
        operations: repairOps
      })
      hostText = getBlockOperationText(this.host)
    }

    if (hostText !== target) {
      // Throwing here would escape through the Y.Text observer and tear down the sync
      // pipeline for every later edit. Rebuild the host from canonical Y.Text instead.
      this.reconcile(reason)
    }

    this.canonicalYText = this.yText.toString()
  }
}

export type { BindingUndoOptions, YjsBindingUndoStatus }

/** True when a delta only changes formatting, leaving every text offset untouched. */
function isAttributeOnlyDelta(delta: readonly YTextDeltaOp[]): boolean {
  return delta.every((op) => op.insert === undefined && op.delete === undefined)
}

function validateBindingOptions(options: EditableYjsBindingOptions): void {
  const { editable, host, yText, initialSync } = options
  if (!editable?.ownsBlock(host)) {
    throw new Error('EditableYjsBinding: host is not registered with the Editable instance')
  }
  if (!host.isConnected) {
    throw new Error('EditableYjsBinding: host is not connected to the document')
  }
  if (!(yText instanceof Y.Text)) {
    throw new Error('EditableYjsBinding: yText must be a Y.Text instance')
  }
  if (!yText.doc) {
    throw new Error('EditableYjsBinding: yText must belong to a Y.Doc')
  }
  if (!initialSync || typeof initialSync !== 'object') {
    throw new Error('EditableYjsBinding: initialSync policy is required')
  }
  if (initialSync.yEmptyHostFilled !== 'copy-host-to-y') {
    throw new Error('EditableYjsBinding: yEmptyHostFilled must be "copy-host-to-y"')
  }
  if (initialSync.hostEmptyYFilled !== 'copy-y-to-host') {
    throw new Error('EditableYjsBinding: hostEmptyYFilled must be "copy-y-to-host"')
  }
  const differ = initialSync.bothFilledDiffer
  if (differ !== 'error' && (typeof differ !== 'object' || typeof differ.resolve !== 'function')) {
    throw new Error('EditableYjsBinding: bothFilledDiffer must be "error" or a conflict resolver')
  }
}

function assertPlainTextBatch(batch: EditableOperationBatch): void {
  for (const op of batch.operations) {
    if (op.type === 'setTextAttributes') {
      throw new PlainTextYjsError(
        'Plain-text Yjs binding cannot sync setTextAttributes operations to Y.Text'
      )
    }
    if (
      (op.type === 'insertText' || op.type === 'replaceText') &&
      op.attributes &&
      Object.keys(op.attributes).length > 0
    ) {
      throw new PlainTextYjsError(
        'Plain-text Yjs binding cannot sync attributed insert/replace operations to Y.Text'
      )
    }
  }
}

function runInitialSync(binding: EditableYjsBinding, policy: InitialSyncPolicy): void {
  const hostText = getBlockOperationText(binding.host)
  const yText = binding.yText.toString()
  const scenario = classifyInitialSync(hostText, yText)

  switch (scenario) {
    case 'both-empty':
    case 'both-identical':
      return
    case 'y-empty-host-filled':
      if (policy.yEmptyHostFilled !== 'copy-host-to-y') {
        throw new Error('Initial sync: unexpected yEmptyHostFilled policy')
      }
      copyHostToY(binding, hostText)
      return
    case 'host-empty-y-filled':
      if (policy.hostEmptyYFilled !== 'copy-y-to-host') {
        throw new Error('Initial sync: unexpected hostEmptyYFilled policy')
      }
      copyYToHost(binding, yText)
      return
    case 'both-filled-differ': {
      const resolution = resolveConflict(policy, hostText, yText)
      if (resolution === 'host') {
        copyHostToY(binding, hostText)
      } else {
        copyYToHost(binding, yText)
      }
      return
    }
    default: {
      const _exhaustive: never = scenario
      throw new Error(`Initial sync: unsupported scenario ${String(_exhaustive)}`)
    }
  }
}

function resolveConflict(policy: InitialSyncPolicy, hostText: string, yText: string): 'host' | 'y' {
  const differ = policy.bothFilledDiffer
  if (differ === 'error') {
    throw new InitialSyncConflictError(hostText, yText)
  }
  return differ.resolve({ hostText, yText })
}

function copyHostToY(binding: EditableYjsBinding, hostText: string): void {
  const doc = binding.yText.doc!
  doc.transact(() => {
    if (binding.yText.length > 0) {
      binding.yText.delete(0, binding.yText.length)
    }
    if (hostText.length > 0) {
      if (binding.richText) {
        insertHostRunsIntoYText(binding.yText, binding.host, binding.host.ownerDocument!)
      } else {
        binding.yText.insert(0, hostText)
      }
    }
  }, INITIAL_SYNC_ORIGIN)
}

function copyYToHost(binding: EditableYjsBinding, text: string): void {
  const hostLength = getOperationTextLength(binding.host)
  const doc = binding.host.ownerDocument!

  if (binding.richText) {
    applyLiveOperationBatchToDom(
      binding.host,
      {
        source: 'remote',
        operations: buildCopyYTextDeltaToHostOperations(binding.yText, hostLength, doc)
      },
      { preserveSelection: false }
    )
    return
  }

  const operations =
    hostLength === 0
      ? [{ type: 'insertText' as const, index: 0, text }]
      : [{ type: 'replaceText' as const, index: 0, length: hostLength, text }]

  binding.editable.applyOperations(
    binding.host,
    { source: 'remote', operations },
    { preserveSelection: false, emitChange: false }
  )
}

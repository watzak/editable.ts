import { isBlockComposing } from './composition-state.js'
import {
  applyOperationBatchToDom,
  OperationValidationError,
  type ApplyOperationsOptions,
  type ApplyOperationsResult
} from './operation-apply.js'
import { captureSelectionSnapshot } from './operation-selection.js'
import { OperationRemoteQueue } from './operation-remote-queue.js'
import type { EditableOperationBatch } from './operation-types.js'
import type { ChangeDetails } from './command-types.js'
import type { Editable } from './core.js'

const remoteQueues = new OperationRemoteQueue()

export function getOperationRemoteQueue(): OperationRemoteQueue {
  return remoteQueues
}

export function applyOperationsForEditable(
  editable: Editable,
  host: HTMLElement,
  batch: EditableOperationBatch,
  options: ApplyOperationsOptions = {}
): ApplyOperationsResult {
  if (!editable.ownsBlock(host)) {
    throw new Error('applyOperations: host is not registered with this Editable instance')
  }
  if (!host.isConnected) {
    throw new Error('applyOperations: host is not connected to the document')
  }

  const preserveSelection = options.preserveSelection !== false
  const emitChange = options.emitChange !== false

  if (isBlockComposing(host)) {
    let resolved: ApplyOperationsResult = { applied: false, queued: true }
    remoteQueues.enqueue(host, {
      batch,
      options,
      resolve: (result) => {
        resolved = result
      }
    })
    return resolved
  }

  return applyOperationsNow(editable, host, batch, {
    preserveSelection,
    emitChange,
    origin: options.origin
  })
}

export function flushQueuedOperations(editable: Editable, host: HTMLElement): void {
  const pending = remoteQueues.drain(host)
  for (const entry of pending) {
    const result = applyOperationsNow(editable, host, entry.batch, {
      preserveSelection: entry.options.preserveSelection !== false,
      emitChange: entry.options.emitChange !== false,
      origin: entry.options.origin
    })
    entry.resolve(result)
  }
}

function applyOperationsNow(
  editable: Editable,
  host: HTMLElement,
  batch: EditableOperationBatch,
  options: {
    preserveSelection: boolean
    emitChange: boolean
    origin?: EditableOperationBatch['origin']
  }
): ApplyOperationsResult {
  const capture = editable.dispatcher.operationCapture
  const selectionWatcher = editable.dispatcher.selectionWatcher

  const hadSelectionInHost =
    options.preserveSelection &&
    captureSelectionSnapshot(host, selectionWatcher.getFreshSelection()) !== undefined

  const selectionBefore = hadSelectionInHost
    ? captureSelectionSnapshot(host, selectionWatcher.getFreshSelection())
    : undefined

  capture.beginRemoteApply(host)
  try {
    applyOperationBatchToDom(host, batch, {
      preserveSelection: hadSelectionInHost,
      selectionBefore
    })
  } finally {
    capture.endRemoteApply(host)
  }

  capture.syncConfirmedState(host, selectionWatcher)

  if (options.emitChange) {
    const source = batch.source === 'paste' ? 'paste' : batch.source === 'remote' ? 'api' : 'api'
    const details: ChangeDetails = {
      source,
      inputType: batch.inputType
    }
    editable.dispatcher.notify('change', host, details)
  }

  return { applied: true }
}

export { OperationValidationError }

import * as Y from 'yjs'
import { Editable } from '../../src/core.js'
import { getBlockOperationText } from '../../src/operation-text-model.js'
import { EditableYjsBinding } from '../../src/yjs/index.js'
import { applyLiveOperationBatchToDom } from '../../src/operation-apply.js'
import { dispatchEditableOperations } from '../../src/operation-pipeline.js'
import {
  buildLinkOperation,
  buildToggleFormatOperation,
  buildUnlinkOperation
} from '../../src/format-operations.js'
import { captureSelectionSnapshot } from '../../src/operation-selection.js'
import { getBlockTextRuns } from '../../src/yjs/dom-text-runs.js'
import {
  createCursorAtEnd,
  createSelection,
  defaultInitialSyncPolicy,
  mergeDocs,
  simulateInsertText,
  syncDocToTarget
} from './yjs-sync-harness.js'
import type Selection from '../../src/selection.js'
import type { EditableOperationBatch } from '../../src/operation-types.js'

export {
  defaultInitialSyncPolicy,
  mergeDocs,
  syncDocToTarget,
  createCursorAtEnd,
  simulateInsertText
}

export function createRichHost(): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute('contenteditable', 'true')
  host.setAttribute('data-plaintext', 'false')
  document.body.appendChild(host)
  return host
}

export function createRichPeer(name: string) {
  const doc = new Y.Doc()
  const yText = doc.getText(name)
  const host = createRichHost()
  const editable = new Editable({ defaultBehavior: true })
  editable.add(host)
  host.focus()
  return { doc, yText, host, editable }
}

export function bindRichPeer(peer: ReturnType<typeof createRichPeer>) {
  return new EditableYjsBinding({
    editable: peer.editable,
    host: peer.host,
    yText: peer.yText,
    initialSync: defaultInitialSyncPolicy
  })
}

export function emitFormatBatch(
  editable: Editable,
  host: HTMLElement,
  batch: EditableOperationBatch
): void {
  dispatchEditableOperations(editable.dispatcher.notify, host, batch)
}

export function applyAndEmitOperations(
  editable: Editable,
  host: HTMLElement,
  operations: EditableOperationBatch['operations']
): void {
  applyLiveOperationBatchToDom(host, { source: 'remote', operations }, { preserveSelection: true })
  dispatchEditableOperations(editable.dispatcher.notify, host, { source: 'api', operations })
}

export function simulateToggleBold(
  host: HTMLElement,
  editable: Editable,
  start: number,
  end: number
): void {
  createSelection(host, start, end)
  editable.dispatcher.selectionWatcher.syncSelection()
  const selection = editable.dispatcher.selectionWatcher.getFreshSelection()
  if (!selection || !selection.isSelection) return
  const textSelection = selection as Selection
  const selectionBefore = captureSelectionSnapshot(host, textSelection)!
  const operation = buildToggleFormatOperation(host, selectionBefore, 'bold')!
  textSelection.toggleBold()
  editable.dispatcher.operationCapture.commitFormatMutation(
    editable.dispatcher.notify,
    host,
    editable.dispatcher.selectionWatcher,
    {
      operations: [operation],
      selectionBefore
    }
  )
}

export function simulateToggleItalic(
  host: HTMLElement,
  editable: Editable,
  start: number,
  end: number
): void {
  createSelection(host, start, end)
  editable.dispatcher.selectionWatcher.syncSelection()
  const selection = editable.dispatcher.selectionWatcher.getFreshSelection()
  if (!selection || !selection.isSelection) return
  const textSelection = selection as Selection
  const selectionBefore = captureSelectionSnapshot(host, textSelection)!
  const operation = buildToggleFormatOperation(host, selectionBefore, 'italic')!
  textSelection.toggleEmphasis()
  editable.dispatcher.operationCapture.commitFormatMutation(
    editable.dispatcher.notify,
    host,
    editable.dispatcher.selectionWatcher,
    {
      operations: [operation],
      selectionBefore
    }
  )
}

export function simulateLink(
  host: HTMLElement,
  editable: Editable,
  start: number,
  end: number,
  href: string,
  attrs: { rel?: string; target?: string } = {}
): void {
  createSelection(host, start, end)
  editable.dispatcher.selectionWatcher.syncSelection()
  const selection = editable.dispatcher.selectionWatcher.getFreshSelection()
  if (!selection || !selection.isSelection) return
  const textSelection = selection as Selection
  const selectionBefore = captureSelectionSnapshot(host, textSelection)!
  const operation = buildLinkOperation(host, selectionBefore, href, attrs)
  if (!operation) return
  textSelection.link(href, attrs)
  editable.dispatcher.operationCapture.commitFormatMutation(
    editable.dispatcher.notify,
    host,
    editable.dispatcher.selectionWatcher,
    {
      operations: [operation],
      selectionBefore
    }
  )
}

export function simulateUnlink(
  host: HTMLElement,
  editable: Editable,
  start: number,
  end: number
): void {
  createSelection(host, start, end)
  editable.dispatcher.selectionWatcher.syncSelection()
  const selection = editable.dispatcher.selectionWatcher.getFreshSelection()
  if (!selection || !selection.isSelection) return
  const textSelection = selection as Selection
  const selectionBefore = captureSelectionSnapshot(host, textSelection)!
  const operation = buildUnlinkOperation(host, selectionBefore)!
  textSelection.unlink()
  editable.dispatcher.operationCapture.commitFormatMutation(
    editable.dispatcher.notify,
    host,
    editable.dispatcher.selectionWatcher,
    {
      operations: [operation],
      selectionBefore
    }
  )
}

export function hostInnerHtml(host: HTMLElement): string {
  return host.innerHTML
}

export function hostTextRuns(host: HTMLElement) {
  return getBlockTextRuns(host)
}

export function hostPlainText(host: HTMLElement): string {
  return getBlockOperationText(host)
}

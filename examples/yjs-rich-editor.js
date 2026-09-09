import * as Y from 'yjs'
import { Editable } from '../lib/core.js'
import { EditableYjsBinding } from '../lib/yjs/index.js'
import {
  buildLinkOperation,
  buildToggleFormatOperation,
  captureSelectionBeforeFormat
} from '../lib/format-operations.js'

const policy = {
  yEmptyHostFilled: 'copy-host-to-y',
  hostEmptyYFilled: 'copy-y-to-host',
  bothFilledDiffer: 'error'
}

const docA = new Y.Doc()
const docB = new Y.Doc()
const yTextA = docA.getText('demo')
docB.getText('demo')

const hostA = document.querySelector('#editor-a')
const hostB = document.querySelector('#editor-b')

const editableA = new Editable()
const editableB = new Editable()
editableA.add(hostA)
editableB.add(hostB)

const bindingA = new EditableYjsBinding({
  editable: editableA,
  host: hostA,
  yText: yTextA,
  initialSync: policy
})

const bindingB = new EditableYjsBinding({
  editable: editableB,
  host: hostB,
  yText: docB.getText('demo'),
  initialSync: policy
})

let lastPeer = { editable: editableA, host: hostA, binding: bindingA }
let syncing = false
let docSyncTimer = null

function sync(from, to) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from))
}

function syncBoth() {
  if (syncing) return
  syncing = true
  try {
    sync(docA, docB)
    sync(docB, docA)
  } finally {
    syncing = false
  }
}

function scheduleDocSync() {
  if (docSyncTimer !== null) clearTimeout(docSyncTimer)
  docSyncTimer = setTimeout(() => {
    docSyncTimer = null
    syncBoth()
  }, 80)
}

function trackPeer(editable, host, binding) {
  lastPeer = { editable, host, binding }
}

hostA.addEventListener('focusin', () => trackPeer(editableA, hostA, bindingA))
hostB.addEventListener('focusin', () => trackPeer(editableB, hostB, bindingB))

editableA.on('operation', scheduleDocSync)
editableB.on('operation', scheduleDocSync)

document.querySelectorAll('[data-cmd]').forEach((button) => {
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', () => {
    const { editable, host } = lastPeer
    const selection = editable.dispatcher.selectionWatcher.getFreshSelection()
    if (!selection?.isSelection) return

    const selectionBefore = captureSelectionBeforeFormat(selection)
    if (!selectionBefore) return

    const cmd = button.getAttribute('data-cmd')

    if (cmd === 'bold') {
      const operation = buildToggleFormatOperation(host, selectionBefore, 'bold')
      selection.toggleBold()
      if (operation) {
        editable.dispatcher.operationCapture.commitFormatMutation(
          editable.dispatcher.notify,
          host,
          editable.dispatcher.selectionWatcher,
          { operations: [operation], selectionBefore }
        )
      }
    } else if (cmd === 'italic') {
      const operation = buildToggleFormatOperation(host, selectionBefore, 'italic')
      selection.toggleEmphasis()
      if (operation) {
        editable.dispatcher.operationCapture.commitFormatMutation(
          editable.dispatcher.notify,
          host,
          editable.dispatcher.selectionWatcher,
          { operations: [operation], selectionBefore }
        )
      }
    } else if (cmd === 'underline') {
      const operation = buildToggleFormatOperation(host, selectionBefore, 'underline')
      selection.toggleUnderline()
      if (operation) {
        editable.dispatcher.operationCapture.commitFormatMutation(
          editable.dispatcher.notify,
          host,
          editable.dispatcher.selectionWatcher,
          { operations: [operation], selectionBefore }
        )
      }
    } else if (cmd === 'link') {
      const href = window.prompt('Link URL (https://…)', 'https://example.com')
      if (!href) return
      const operation = buildLinkOperation(host, selectionBefore, href, { target: '_blank' })
      if (!operation) return
      selection.link(href, { target: '_blank' })
      editable.dispatcher.operationCapture.commitFormatMutation(
        editable.dispatcher.notify,
        host,
        editable.dispatcher.selectionWatcher,
        { operations: [operation], selectionBefore }
      )
    }

    scheduleDocSync()
  })
})

window.__yjsRichE2E = {
  docA,
  docB,
  bindingA,
  bindingB,
  syncBoth,
  scheduleDocSync,
  getYTextA: () => yTextA.toString(),
  getYTextB: () => docB.getText('demo').toString(),
  getYDeltaJson: () => JSON.stringify(yTextA.toDelta())
}

window.addEventListener('beforeunload', () => {
  if (docSyncTimer !== null) clearTimeout(docSyncTimer)
  bindingA.destroy()
  bindingB.destroy()
  editableA.unload()
  editableB.unload()
})

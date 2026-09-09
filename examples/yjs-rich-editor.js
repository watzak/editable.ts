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
const yText = docA.getText('demo')
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
  yText,
  initialSync: policy
})

const bindingB = new EditableYjsBinding({
  editable: editableB,
  host: hostB,
  yText: docB.getText('demo'),
  initialSync: policy
})

function sync(from, to) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from))
}

function syncBoth() {
  sync(docA, docB)
  sync(docB, docA)
}

hostA.addEventListener('input', syncBoth)
hostB.addEventListener('input', syncBoth)

function activeEditable() {
  return document.activeElement === hostA ? editableA : editableB
}

function activeHost() {
  return document.activeElement === hostA ? hostA : hostB
}

document.querySelectorAll('[data-cmd]').forEach((button) => {
  button.addEventListener('click', () => {
    const editable = activeEditable()
    const host = activeHost()
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

    syncBoth()
  })
})

window.addEventListener('beforeunload', () => {
  bindingA.destroy()
  bindingB.destroy()
  editableA.unload()
  editableB.unload()
})

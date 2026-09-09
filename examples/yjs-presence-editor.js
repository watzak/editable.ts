import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import { Editable } from '../lib/core.js'
import { EditableYjsBinding, EditableYjsPresence } from '../lib/yjs/index.js'

const policy = {
  yEmptyHostFilled: 'copy-host-to-y',
  hostEmptyYFilled: 'copy-y-to-host',
  bothFilledDiffer: 'error'
}

const docA = new Y.Doc()
const docB = new Y.Doc()
const yTextA = docA.getText('demo')
docB.getText('demo')

const awarenessA = new Awareness(docA)
const awarenessB = new Awareness(docB)

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

const presenceA = new EditableYjsPresence({
  editable: editableA,
  host: hostA,
  yText: yTextA,
  awareness: awarenessA,
  user: { name: 'Ada', color: '#ef4444' },
  throttleMs: 50
})

const presenceB = new EditableYjsPresence({
  editable: editableB,
  host: hostB,
  yText: docB.getText('demo'),
  awareness: awarenessB,
  user: { name: 'Grace', color: '#3b82f6' },
  throttleMs: 50
})

function syncDocs(from, to) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from))
}

function syncAwareness(from, to) {
  const clients = Array.from(from.getStates().keys())
  if (clients.length === 0) return
  const update = encodeAwarenessUpdate(from, clients)
  applyAwarenessUpdate(to, update, 'demo-sync')
}

function syncDocsBothWays() {
  syncDocs(docA, docB)
  syncDocs(docB, docA)
}

function syncAwarenessBothWays() {
  syncAwareness(awarenessA, awarenessB)
  syncAwareness(awarenessB, awarenessA)
}

function syncBothWays() {
  syncDocsBothWays()
  syncAwarenessBothWays()
}

let docSyncTimer = null
function scheduleDocSync() {
  if (docSyncTimer !== null) clearTimeout(docSyncTimer)
  docSyncTimer = setTimeout(() => {
    docSyncTimer = null
    syncDocsBothWays()
  }, 80)
}

hostA.addEventListener('input', scheduleDocSync)
hostB.addEventListener('input', scheduleDocSync)

awarenessA.on('update', syncAwarenessBothWays)
awarenessB.on('update', syncAwarenessBothWays)

function countRemoteCarets(doc = document) {
  return doc.querySelectorAll('.editable-yjs-presence-caret').length
}

function serializedDocHasPresence(doc) {
  const update = Y.encodeStateAsUpdate(doc)
  const text = new TextDecoder().decode(update)
  return text.includes('editable.ts:presence') || text.includes('presence:v1')
}

window.__yjsPresenceE2E = {
  hostA,
  hostB,
  docA,
  docB,
  awarenessA,
  awarenessB,
  syncBothWays,
  syncAwarenessBothWays,
  countRemoteCarets,
  serializedDocHasPresence,
  getYText: () => yTextA.toString(),
  getYDeltaJson: () => JSON.stringify(yTextA.toDelta())
}

window.addEventListener('beforeunload', () => {
  presenceA.destroy()
  presenceB.destroy()
  bindingA.destroy()
  bindingB.destroy()
  editableA.unload()
  editableB.unload()
})

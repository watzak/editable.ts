import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import { Editable } from '../lib/core.js'
import { EditableYjsBinding, EditableYjsPresence } from '../lib/yjs/index.js'
import {
  buildToggleFormatOperation,
  captureSelectionBeforeFormat
} from '../lib/format-operations.js'
import {
  createExampleArrayStructuralAdapter,
  createExampleBlocksArray
} from './yjs-array-structural-adapter.js'
import { buildSplitBlockCommand } from '../lib/command-builder.js'
import { dispatchEditableCommand } from '../lib/command-pipeline.js'
import * as content from '../lib/content.js'

const policy = {
  yEmptyHostFilled: 'copy-host-to-y',
  hostEmptyYFilled: 'copy-y-to-host',
  bothFilledDiffer: 'error'
}

const statusEl = document.querySelector('[data-testid="collab-status"]')

class ManualNetwork {
  constructor() {
    this.offline = new Set()
    this.pending = new Map()
  }

  isOnline(clientId) {
    return !this.offline.has(clientId)
  }

  setOffline(clientId, value) {
    if (value) this.offline.add(clientId)
    else {
      this.offline.delete(clientId)
      this.applyPendingFor(clientId)
    }
  }

  applyPendingFor(clientId) {
    if (clientId === 'b' && clientB) {
      this.flushPending('b', (update) => Y.applyUpdate(clientB.doc, update))
    }
    if (clientId === 'a' && clientA) {
      this.flushPending('a', (update) => Y.applyUpdate(clientA.doc, update))
    }
  }

  queue(fromId, toId, update) {
    const key = `${fromId}->${toId}`
    const list = this.pending.get(key) ?? []
    list.push(update)
    this.pending.set(key, list)
  }

  flushPending(clientId, applyUpdate) {
    for (const key of [...this.pending.keys()]) {
      if (!key.endsWith(`->${clientId}`)) continue
      const updates = this.pending.get(key) ?? []
      this.pending.delete(key)
      for (const update of updates) applyUpdate(update)
    }
  }

  syncDoc(fromDoc, toDoc, fromId, toId) {
    const update = Y.encodeStateAsUpdate(fromDoc)
    if (!this.isOnline(toId)) {
      this.queue(fromId, toId, update)
      return
    }
    Y.applyUpdate(toDoc, update)
  }

  syncAwareness(from, to, fromId, toId) {
    const clients = Array.from(from.getStates().keys())
    if (clients.length === 0) return
    const update = encodeAwarenessUpdate(from, clients)
    if (!this.isOnline(toId)) return
    applyAwarenessUpdate(to, update, 'demo')
  }
}

const network = new ManualNetwork()
let richMode = false
let clientA = null
let clientB = null
let syncing = false
let syncTimer = null
let awarenessTimer = null

function createBlockHost(container, plain, clientId, options = {}) {
  const host = document.createElement('div')
  host.className = 'block-host'
  host.setAttribute('contenteditable', 'true')
  if (options.primary) {
    host.dataset.testPrimaryHost = clientId
  }
  container.appendChild(host)
  return host
}

function createClient(id, label, color, containerId, options = {}) {
  const doc = options.doc ?? new Y.Doc()
  const blocks = options.blocks ?? createExampleBlocksArray(doc)
  const awareness = options.awareness ?? new Awareness(doc)

  const container = document.querySelector(`#${containerId}`)
  const blocksEl = document.createElement('div')
  blocksEl.className = 'blocks-inner'
  container.replaceChildren(blocksEl)

  const editable = new Editable({ defaultBehavior: true })
  const registryMap = new Map()
  const registry = {
    get: (key) => registryMap.get(key),
    set: (key, val) => registryMap.set(key, val),
    delete: (key) => registryMap.delete(key)
  }

  const state = {
    id,
    label,
    color,
    doc,
    blocks,
    editable,
    registry,
    registryMap,
    bindings: [],
    presences: [],
    primaryBlockId: options.primaryBlockId ?? null,
    blocksEl,
    offline: false
  }

  const adapter = createExampleArrayStructuralAdapter({
    blocks,
    registry,
    initialSync: policy,
    createHost() {
      return createBlockHost(state.blocksEl, !richMode, id)
    }
  })

  function mountBlock(mountId, bodyText, host, isPrimary = false) {
    editable.add(host, { plainText: !richMode })
    if (isPrimary) {
      host.dataset.testPrimaryHost = id
    }
    const binding = new EditableYjsBinding({
      editable,
      host,
      yText: bodyText,
      initialSync: policy,
      undo: { captureTimeout: 500 },
      structuralAdapter: richMode ? adapter : undefined
    })
    const presence = new EditableYjsPresence({
      editable,
      host,
      yText: bodyText,
      awareness,
      user: { name: label, color },
      throttleMs: 50
    })
    registry.set(mountId, { host, binding, presence, body: bodyText })
    state.bindings.push(binding)
    state.presences.push(presence)
    host.addEventListener('input', scheduleSync)
    return { binding, presence }
  }

  if (!options.skipInitialBlock) {
    const blockId = crypto.randomUUID()
    const body = new Y.Text()
    const map = new Y.Map()
    map.set('id', blockId)
    map.set('body', body)
    blocks.insert(0, [map])
    const host = createBlockHost(blocksEl, !richMode, id, { primary: true })
    mountBlock(blockId, body, host, true)
    state.primaryBlockId = blockId
  }

  state.mountBlock = mountBlock
  state.adapter = adapter
  state.awareness = awareness
  return state
}

function scheduleSync() {
  if (syncTimer !== null) return
  syncTimer = setTimeout(() => {
    syncTimer = null
    syncAll()
  }, 80)
}

function scheduleAwarenessSync() {
  if (awarenessTimer !== null) return
  awarenessTimer = setTimeout(() => {
    awarenessTimer = null
    if (!clientA || !clientB) return
    network.syncAwareness(clientA.awareness, clientB.awareness, 'a', 'b')
    network.syncAwareness(clientB.awareness, clientA.awareness, 'b', 'a')
    updateStatus()
  }, 50)
}

function syncAll() {
  if (!clientA || !clientB || syncing) return
  syncing = true
  try {
    network.syncDoc(clientA.doc, clientB.doc, 'a', 'b')
    network.syncDoc(clientB.doc, clientA.doc, 'b', 'a')
    network.syncAwareness(clientA.awareness, clientB.awareness, 'a', 'b')
    network.syncAwareness(clientB.awareness, clientA.awareness, 'b', 'a')
    reconcileBlockHosts(clientA)
    reconcileBlockHosts(clientB)
    updateStatus()
  } finally {
    syncing = false
  }
}

function reconcileBlockHosts(client) {
  const ids = []
  for (let i = 0; i < client.blocks.length; i += 1) {
    const map = client.blocks.get(i)
    const id = map?.get('id')
    const body = map?.get('body')
    if (typeof id === 'string' && body instanceof Y.Text) {
      ids.push(id)
      if (!client.registry.get(id)) {
        const isPrimary = i === 0
        const host = createBlockHost(client.blocksEl, !richMode, client.id, { primary: isPrimary })
        client.mountBlock(id, body, host, isPrimary)
        if (isPrimary) client.primaryBlockId = id
      }
    }
  }
  for (const [id, entry] of [...client.registryMap.entries()]) {
    if (!ids.includes(id)) {
      entry.presence?.destroy()
      entry.binding?.destroy()
      entry.host?.remove()
      client.registry.delete(id)
    }
  }
}

function destroyClient(client) {
  if (!client) return
  for (const [, entry] of client.registryMap.entries()) {
    entry.presence?.destroy()
    entry.binding?.destroy()
    entry.host?.remove()
  }
  client.registryMap.clear()
  client.bindings = []
  client.presences = []
  client.editable.unload()
}

function bootClients() {
  destroyClient(clientA)
  destroyClient(clientB)
  clientA = createClient('a', 'Ada', '#ef4444', 'blocks-a')
  clientB = createClient('b', 'Grace', '#3b82f6', 'blocks-b', { skipInitialBlock: true })
  Y.applyUpdate(clientB.doc, Y.encodeStateAsUpdate(clientA.doc))
  clientB.blocks = createExampleBlocksArray(clientB.doc)
  clientB.primaryBlockId = clientA.primaryBlockId
  reconcileBlockHosts(clientB)
  clientA.awareness.on('update', scheduleAwarenessSync)
  clientB.awareness.on('update', scheduleAwarenessSync)
  syncAll()
}

function getPrimary(client) {
  if (client.primaryBlockId) {
    const entry = client.registry.get(client.primaryBlockId)
    if (entry) return entry
  }
  const map = client.blocks.get(0)
  const id = map?.get('id')
  if (typeof id === 'string') {
    const entry = client.registry.get(id)
    if (entry) return entry
  }
  return [...client.registryMap.values()][0]
}

function getPrimaryYText(client) {
  const map = client.blocks.get(0)
  const body = map?.get('body')
  return body instanceof Y.Text ? body : getPrimary(client)?.body
}

function updateStatus() {
  if (!clientA || !clientB || !statusEl) return
  const bodyA = getPrimaryYText(clientA)
  const bodyB = getPrimaryYText(clientB)
  const yA = bodyA?.toString() ?? ''
  const yB = bodyB?.toString() ?? ''
  const deltaMatch =
    JSON.stringify(bodyA?.toDelta() ?? []) === JSON.stringify(bodyB?.toDelta() ?? [])
  statusEl.textContent = [
    `mode: ${richMode ? 'rich' : 'plain'}`,
    `A online: ${network.isOnline('a')}  B online: ${network.isOnline('b')}`,
    `A canUndo: ${getPrimary(clientA)?.binding?.canUndo?.() ?? false}  canRedo: ${getPrimary(clientA)?.binding?.canRedo?.() ?? false}`,
    `Y.Text equal: ${yA === yB}  delta equal: ${deltaMatch}`,
    `A blocks: ${clientA.blocks.length}  B blocks: ${clientB.blocks.length}`,
    `A text: ${JSON.stringify(yA)}`,
    `B text: ${JSON.stringify(yB)}`
  ].join('\n')
}

function splitPrimaryBlock(client) {
  const entry = getPrimary(client)
  if (!entry?.host) return
  const host = entry.host
  const cursor = client.editable.createCursorAtEnd(host)
  if (!cursor || cursor.isAtBeginning() || cursor.isAtTextEnd()) return
  const command = buildSplitBlockCommand(
    host,
    content.getInnerHtmlOfFragment(cursor.before()),
    content.getInnerHtmlOfFragment(cursor.after()),
    cursor,
    'api'
  )
  dispatchEditableCommand(client.editable.dispatcher.notify, command, { cursor })
  syncAll()
}

function remountClientA() {
  if (!clientA) return
  const preserved = {
    doc: clientA.doc,
    blocks: clientA.blocks,
    awareness: clientA.awareness,
    primaryBlockId: clientA.primaryBlockId
  }
  destroyClient(clientA)
  clientA = createClient('a', 'Ada', '#ef4444', 'blocks-a', {
    doc: preserved.doc,
    blocks: preserved.blocks,
    awareness: preserved.awareness,
    primaryBlockId: preserved.primaryBlockId,
    skipInitialBlock: true
  })
  clientA.awareness.on('update', scheduleAwarenessSync)
  reconcileBlockHosts(clientA)
  syncAll()
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.getAttribute('data-action')
    if (action === 'mode-plain') {
      richMode = false
      document.querySelector('[data-action="mode-plain"]')?.classList.add('active')
      document.querySelector('[data-action="mode-rich"]')?.classList.remove('active')
      bootClients()
    } else if (action === 'mode-rich') {
      richMode = true
      document.querySelector('[data-action="mode-rich"]')?.classList.add('active')
      document.querySelector('[data-action="mode-plain"]')?.classList.remove('active')
      bootClients()
    } else if (action === 'offline-a') {
      network.setOffline('a', !network.offline.has('a'))
      updateStatus()
    } else if (action === 'offline-b') {
      network.setOffline('b', !network.offline.has('b'))
      updateStatus()
    } else if (action === 'reconnect') {
      network.setOffline('a', false)
      network.setOffline('b', false)
      syncAll()
    } else if (action === 'undo-a') {
      getPrimary(clientA)?.binding?.undo()
      syncAll()
    } else if (action === 'redo-a') {
      getPrimary(clientA)?.binding?.redo()
      syncAll()
    } else if (action === 'bold') {
      const entry = getPrimary(clientA)
      if (!entry?.host) return
      const selection = clientA.editable.dispatcher.selectionWatcher.getFreshSelection()
      if (!selection?.isSelection) return
      const selectionBefore = captureSelectionBeforeFormat(selection)
      if (!selectionBefore) return
      const op = buildToggleFormatOperation(entry.host, selectionBefore, 'bold')
      selection.toggleBold()
      if (op) {
        clientA.editable.dispatcher.operationCapture.commitFormatMutation(
          clientA.editable.dispatcher.notify,
          entry.host,
          clientA.editable.dispatcher.selectionWatcher,
          { operations: [op], selectionBefore }
        )
      }
      syncAll()
    } else if (action === 'split') {
      splitPrimaryBlock(clientA)
    } else if (action === 'destroy-remount') {
      remountClientA()
    }
  })
})

bootClients()

window.__yjsCollabE2E = {
  clientA: () => clientA,
  clientB: () => clientB,
  syncAll,
  network,
  getPrimary,
  getPrimaryYText: (client) => getPrimaryYText(client),
  updateStatus,
  remountClientA,
  splitPrimaryBlock
}

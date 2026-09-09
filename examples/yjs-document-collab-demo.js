import * as Y from 'yjs'
import { Editable } from '../lib/core.js'
import { EditableYjsDocumentBinding } from '../lib/yjs/index.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  deleteCmsComponent,
  findCmsComponentByYText,
  insertCmsComponent,
  listCmsComponents,
  moveCmsComponent
} from './yjs-cms-document-adapter.ts'

const statusEl = document.querySelector('[data-testid="doc-collab-status"]')

class ManualNetwork {
  constructor() {
    this.offline = new Set()
    this.pending = new Map()
  }

  isOnline(id) {
    return !this.offline.has(id)
  }

  setOffline(id, value) {
    if (value) this.offline.add(id)
    else {
      this.offline.delete(id)
      this.flushPending(id)
    }
  }

  queue(fromId, toId, update) {
    const key = `${fromId}->${toId}`
    const list = this.pending.get(key) ?? []
    list.push(update)
    this.pending.set(key, list)
  }

  flushPending(clientId) {
    for (const key of [...this.pending.keys()]) {
      if (!key.endsWith(`->${clientId}`)) continue
      const updates = this.pending.get(key) ?? []
      this.pending.delete(key)
      const target = clientId === 'a' ? clientA : clientB
      for (const update of updates) {
        Y.applyUpdate(target.doc, update)
        target.binding.reconcile('network-flush')
      }
    }
  }

  syncDoc(fromDoc, toDoc, fromId, toId) {
    const update = Y.encodeStateAsUpdate(fromDoc, Y.encodeStateVector(toDoc))
    if (!this.isOnline(toId)) {
      this.queue(fromId, toId, update)
      return
    }
    Y.applyUpdate(toDoc, update)
    const target = toId === 'a' ? clientA : clientB
    target.binding.reconcile('network-sync')
  }

  syncAll() {
    if (!clientA || !clientB) return
    this.syncDoc(clientA.doc, clientB.doc, 'a', 'b')
    this.syncDoc(clientB.doc, clientA.doc, 'b', 'a')
  }
}

const network = new ManualNetwork()
let clientA = null
let clientB = null

function logStatus() {
  if (!statusEl || !clientA || !clientB) return
  const aCount = listCmsComponents(clientA.root).length
  const bCount = listCmsComponents(clientB.root).length
  statusEl.textContent = [
    `A components: ${aCount}`,
    `B components: ${bCount}`,
    `A undo: ${clientA.binding.canUndo()}`,
    `B undo: ${clientB.binding.canUndo()}`,
    `A offline: ${!network.isOnline('a')}`,
    `B offline: ${!network.isOnline('b')}`
  ].join('\n')
}

function createClient(id, containerId) {
  const doc = new Y.Doc()
  const root = createCmsDocumentRoot(doc)
  const mountContainer = document.getElementById(containerId)
  const editable = new Editable({ defaultBehavior: true })
  const adapter = createCmsDocumentAdapter({ mountContainer })
  const binding = new EditableYjsDocumentBinding({
    editable,
    yDoc: doc,
    root,
    adapter,
    mountContainer,
    undo: true,
    onStructureDiagnostic: (d) => console.warn('[cms-diagnostic]', d)
  })

  editable.on('change', () => {
    scheduleSync()
    logStatus()
  })

  return { id, doc, root, editable, adapter, binding, mountContainer }
}

function scheduleSync() {
  queueMicrotask(() => {
    network.syncAll()
    logStatus()
  })
}

function seed(root) {
  const intro = insertCmsComponent(root, 'paragraph', 0)
  intro.body?.insert(0, 'Shared document — edit on either client.')
}

function findFocused(client) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node = sel.anchorNode
  while (node && node !== client.mountContainer) {
    if (node instanceof HTMLElement && node.dataset.directiveKey) {
      const componentEl = node.closest('[data-component-id]')
      const componentId = componentEl?.dataset.componentId
      if (!componentId) return null
      const binding = client.binding.getDirectiveBinding(componentId, node.dataset.directiveKey)
      return { host: node, componentId, binding, yText: binding?.yText }
    }
    node = node.parentNode
  }
  return null
}

function boot() {
  clientA = createClient('a', 'cms-document-a')
  clientB = createClient('b', 'cms-document-b')
  seed(clientA.root)
  network.syncAll()
  clientA.binding.reconcile('boot-a')
  clientB.binding.reconcile('boot-b')
  logStatus()
}

boot()

document.querySelector('.toolbar')?.addEventListener('click', (event) => {
  const action = event.target instanceof HTMLButtonElement ? event.target.dataset.action : null
  if (!action || !clientA || !clientB) return

  switch (action) {
    case 'insert-a':
      insertCmsComponent(clientA.root, 'paragraph', clientA.root.length)
      clientA.binding.reconcile('insert-a')
      scheduleSync()
      break
    case 'insert-b':
      insertCmsComponent(clientB.root, 'quote', clientB.root.length)
      clientB.binding.reconcile('insert-b')
      scheduleSync()
      break
    case 'insert-two-column-a':
      insertCmsComponent(clientA.root, 'two-column', clientA.root.length)
      clientA.binding.reconcile('insert-two-column-a')
      scheduleSync()
      break
    case 'move-nested-a':
      moveFirstParagraphToLeftColumn(clientA)
      break
    case 'move-a': {
      const first = listCmsComponents(clientA.root)[0]
      if (!first) break
      moveCmsComponent(
        clientA.root,
        first.componentId,
        clientA.root,
        clientA.root.length - 1,
        clientA.binding.transactionOrigin
      )
      clientA.binding.reconcile('move-a')
      scheduleSync()
      break
    }
    case 'delete-a': {
      const focused = findFocused(clientA)
      if (!focused) break
      deleteCmsComponent(clientA.root, focused.componentId, clientA.binding.transactionOrigin)
      clientA.binding.reconcile('delete-a')
      scheduleSync()
      break
    }
    case 'offline-a':
      network.setOffline('a', !network.offline.has('a'))
      logStatus()
      break
    case 'offline-b':
      network.setOffline('b', !network.offline.has('b'))
      logStatus()
      break
    case 'reconnect':
      network.setOffline('a', false)
      network.setOffline('b', false)
      scheduleSync()
      break
    case 'undo-a':
      clientA.binding.undo()
      scheduleSync()
      break
    case 'destroy-a':
      clientA.binding.destroy()
      clientA.editable.unload()
      logStatus()
      break
    default:
      break
  }
})

function findContainerArray(root, componentId, containerKey) {
  let target = null
  walkRootForContainer(root, componentId, containerKey, (arr) => {
    target = arr
  })
  return target
}

function walkRootForContainer(array, componentId, containerKey, onMatch) {
  for (let i = 0; i < array.length; i += 1) {
    const map = array.get(i)
    if (!(map instanceof Y.Map)) continue
    const id = map.get('id')
    if (id === componentId) {
      const containers = map.get('containers')
      if (containers instanceof Y.Map) {
        const arr = containers.get(containerKey)
        if (arr instanceof Y.Array) onMatch(arr)
      }
      return
    }
    const containers = map.get('containers')
    if (containers instanceof Y.Map) {
      containers.forEach((childArray) => {
        if (childArray instanceof Y.Array) {
          walkRootForContainer(childArray, componentId, containerKey, onMatch)
        }
      })
    }
  }
}

function insertAt(client, type, index) {
  insertCmsComponent(client.root, type, index, undefined)
  client.binding.reconcile(`insert-${client.id}`)
  scheduleSync()
}

function moveFirstParagraphToLeftColumn(client) {
  const twoCol = listCmsComponents(client.root).find((c) => c.componentType === 'two-column')
  const paragraph = listCmsComponents(client.root).find((c) => c.componentType === 'paragraph')
  if (!twoCol || !paragraph) return false
  const left = findContainerArray(client.root, twoCol.componentId, 'left')
  if (!left) return false
  moveCmsComponent(
    client.root,
    paragraph.componentId,
    left,
    left.length,
    client.binding.transactionOrigin
  )
  client.binding.reconcile(`move-nested-${client.id}`)
  scheduleSync()
  return true
}

function getDirectiveText(client, componentIndex, directiveKey = 'body') {
  const components = listCmsComponents(client.root)
  const record = components[componentIndex]
  if (!record) return null
  const view = client.binding.getComponentView(record.componentId)
  const host = view?.directiveHosts.get(directiveKey)
  return host?.textContent ?? null
}

function deleteComponent(client, componentId) {
  deleteCmsComponent(client.root, componentId, client.binding.transactionOrigin)
  client.binding.reconcile(`delete-${client.id}`)
  scheduleSync()
}

window.__yjsDocumentCollabE2E = {
  clientA: () => clientA,
  clientB: () => clientB,
  network,
  syncAll: () => network.syncAll(),
  logStatus,
  listComponents(client) {
    return listCmsComponents(client.root)
  },
  findCmsComponentByYText,
  insertAt,
  moveFirstParagraphToLeftColumn,
  getDirectiveText,
  deleteComponent,
  findFocused: (client) => findFocused(client)
}

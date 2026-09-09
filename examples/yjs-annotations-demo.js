import * as Y from 'yjs'
import { Editable } from '../lib/core.js'
import {
  AnnotationStore,
  EditableYjsAnnotations,
  EditableYjsBinding,
  getOrCreateAnnotationsMap
} from '../lib/yjs/index.js'

const statusEl = document.querySelector('[data-testid="annotations-status"]')

function syncDocs(from, to) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
}

function createClient(id, hostId, seedText) {
  const doc = new Y.Doc()
  const yText = doc.getText('shared-body')
  if (seedText) yText.insert(0, seedText)

  const host = document.getElementById(hostId)
  const editable = new Editable({ defaultBehavior: true })
  editable.add(host)

  const binding = new EditableYjsBinding({
    editable,
    host,
    yText,
    initialSync: {
      yEmptyHostFilled: 'copy-host-to-y',
      hostEmptyYFilled: 'copy-y-to-host',
      bothFilledDiffer: 'error'
    }
  })

  const store = new AnnotationStore(getOrCreateAnnotationsMap(doc))
  const annotations = new EditableYjsAnnotations({
    editable,
    host,
    yText,
    store,
    authorId: id
  })

  editable.on('change', () => scheduleSync())

  return { id, doc, host, editable, binding, store, annotations, yText }
}

let clientA = null
let clientB = null

function scheduleSync() {
  queueMicrotask(() => {
    if (!clientA || !clientB) return
    syncDocs(clientA.doc, clientB.doc)
    syncDocs(clientB.doc, clientA.doc)
    clientA.annotations.refresh()
    clientB.annotations.refresh()
    logStatus()
  })
}

function logStatus() {
  if (!statusEl || !clientA || !clientB) return
  statusEl.textContent = [
    `A annotations: ${clientA.store.list().length}`,
    `B annotations: ${clientB.store.list().length}`,
    `A text: ${clientA.yText.toString()}`,
    `B text: ${clientB.yText.toString()}`
  ].join('\n')
}

function selectionOffsets(host) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  if (!host.contains(sel.anchorNode)) return null
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(host)
  pre.setEnd(range.startContainer, range.startOffset)
  const anchor = pre.toString().length
  pre.setEnd(range.endContainer, range.endOffset)
  const head = pre.toString().length
  return { anchor, head }
}

function boot() {
  clientA = createClient('author-a', 'editor-a', 'Collaborative annotations demo text.')
  clientB = createClient('author-b', 'editor-b', '')
  syncDocs(clientA.doc, clientB.doc)
  clientB.binding.reconcile('boot')
  logStatus()
}

boot()

document.querySelector('.toolbar')?.addEventListener('click', (event) => {
  const action = event.target instanceof HTMLButtonElement ? event.target.dataset.action : null
  if (!action || !clientA || !clientB) return

  switch (action) {
    case 'comment-a': {
      const offsets = selectionOffsets(clientA.host)
      if (!offsets) break
      clientA.annotations.createAtOffsets('comment', offsets.anchor, offsets.head, {
        body: 'Comment from A'
      })
      scheduleSync()
      break
    }
    case 'issue-b': {
      const offsets = selectionOffsets(clientB.host)
      if (!offsets) break
      clientB.annotations.createAtOffsets('issue', offsets.anchor, offsets.head, {
        body: 'Issue from B'
      })
      scheduleSync()
      break
    }
    case 'resolve-a': {
      const first = clientA.store.list()[0]
      if (first) clientA.annotations.resolve(first.id)
      scheduleSync()
      break
    }
    case 'sync':
      scheduleSync()
      break
    default:
      break
  }
})

window.__yjsAnnotationsE2E = {
  clientA: () => clientA,
  clientB: () => clientB,
  syncAll: () => scheduleSync(),
  countAnnotations: (client) => client.store.list().length
}

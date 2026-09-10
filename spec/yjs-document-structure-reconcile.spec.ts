import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  insertCmsComponent
} from '../examples/yjs-cms-document-adapter.js'
import { flushMicrotasks } from './helpers/yjs-convergence-harness.js'

function syncPeer(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
}

describe('EditableYjsDocumentBinding structure reconcile scheduling', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
  })

  function createPeer(label: string, onStructureReconcile?: (reason: string) => void) {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    mountContainer.dataset.testPeer = label
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })
    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer,
      undo: true,
      onStructureReconcile
    })
    return { doc, root, mountContainer, editable, adapter, binding }
  }

  it('does not structure-reconcile for remote text-only updates', async function () {
    const reasons: string[] = []
    const a = createPeer('a', (reason) => reasons.push(reason))
    const b = createPeer('b')
    const paragraph = insertCmsComponent(a.root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Seed')
    syncPeer(a.doc, b.doc)
    await flushMicrotasks()
    b.binding.reconcile('seed')
    reasons.length = 0

    for (let i = 0; i < 40; i += 1) {
      a.doc.transact(() => {
        paragraph.body!.insert(paragraph.body!.length, String(i % 10))
      }, 'remote-text')
      syncPeer(a.doc, b.doc)
      await flushMicrotasks()
    }

    expect(reasons).toEqual([])
    expect(b.binding.getComponentView(paragraph.map.get('id') as string)).toBeTruthy()
    expect(
      b.binding.getDirectiveBinding(paragraph.map.get('id') as string, 'body')?.yText.toString()
    ).toContain('Seed')

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('structure-reconciles on remote component insert', async function () {
    const reasons: string[] = []
    const a = createPeer('a')
    const b = createPeer('b', (reason) => reasons.push(reason))
    insertCmsComponent(a.root, 'paragraph', 0)
    syncPeer(a.doc, b.doc)
    await flushMicrotasks()
    b.binding.reconcile('seed')
    reasons.length = 0

    insertCmsComponent(a.root, 'quote', 1)
    syncPeer(a.doc, b.doc)
    await flushMicrotasks()

    expect(reasons.some((reason) => reason.startsWith('remote-'))).toBe(true)
    expect(b.root.length).toBe(2)
    expect(b.mountContainer.querySelectorAll('.cms-component').length).toBe(2)

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('does not schedule structure reconcile after destroy', async function () {
    const reasons: string[] = []
    const peer = createPeer('a', (reason) => reasons.push(reason))
    const paragraph = insertCmsComponent(peer.root, 'paragraph', 0)
    await flushMicrotasks()
    reasons.length = 0

    peer.binding.destroy()
    peer.editable.unload()

    peer.doc.transact(() => {
      paragraph.body!.insert(0, 'late')
    }, 'remote-after-destroy')
    await flushMicrotasks()

    expect(reasons).toEqual([])
  })
})

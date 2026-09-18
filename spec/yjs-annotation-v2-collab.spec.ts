import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { Editable } from '../src/core.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import { EditableYjsDocumentAnnotations } from '../src/yjs/editable-yjs-document-annotations.js'
import {
  AnnotationStore,
  coordinatedMigrateAnnotationsV1ToV2,
  getOrCreateAnnotationsMap,
  isV2AnnotationMap,
  parseAnnotationStorageValue
} from '../src/yjs/index.js'
import {
  changeCmsComponentType,
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  insertCmsComponent
} from '../examples/yjs-cms-document-adapter.js'
import { createRichPeer, bindRichPeer, simulateInsertText } from './helpers/yjs-rich-harness.js'
import { EditableYjsAnnotations } from '../src/yjs/editable-yjs-annotations.js'
import { syncDocToTarget } from './helpers/yjs-sync-harness.js'

function syncPeer(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
}

describe('annotation v2 CRDT storage', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
    document.querySelectorAll('.editable-yjs-annotation-layer').forEach((node) => node.remove())
  })

  it('merges concurrent replies from two docs (default v2 store)', function () {
    const seedDoc = new Y.Doc()
    const map = getOrCreateAnnotationsMap(seedDoc)
    const store = new AnnotationStore(map)
    const id = store.create({
      type: 'comment',
      anchor: null,
      head: null,
      authorId: 'author-a',
      data: { body: 'root' }
    })!

    const docA = new Y.Doc()
    const docB = new Y.Doc()
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(seedDoc))
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(seedDoc))

    const storeA = new AnnotationStore(getOrCreateAnnotationsMap(docA))
    const storeB = new AnnotationStore(getOrCreateAnnotationsMap(docB))
    expect(storeA.addReply(id, { id: 'r-a', authorId: 'peer-a', body: 'reply-a' })).toBe(true)
    expect(storeB.addReply(id, { id: 'r-b', authorId: 'peer-b', body: 'reply-b' })).toBe(true)

    syncPeer(docA, docB)
    syncPeer(docB, docA)

    const thread = new AnnotationStore(getOrCreateAnnotationsMap(docA)).get(id)?.data?.thread ?? []
    expect(thread.length).toBe(2)
    expect(thread.map((t) => t.body).sort()).toEqual(['reply-a', 'reply-b'])
    expect(isV2AnnotationMap(getOrCreateAnnotationsMap(docA).get(id))).toBe(true)
  })

  it('converges reply + resolve across two docs', function () {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    const storeA = new AnnotationStore(getOrCreateAnnotationsMap(docA))
    const id = storeA.create({
      type: 'issue',
      anchor: null,
      head: null,
      authorId: 'a',
      data: { body: 'fix' }
    })!
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))

    storeA.addReply(id, { authorId: 'a', body: 'details' })
    syncPeer(docA, docB)
    expect(new AnnotationStore(getOrCreateAnnotationsMap(docB)).get(id)?.data?.thread?.length).toBe(
      1
    )

    new AnnotationStore(getOrCreateAnnotationsMap(docB)).resolve(id, 'b')
    syncPeer(docB, docA)
    expect(new AnnotationStore(getOrCreateAnnotationsMap(docA)).get(id)?.resolvedAt).toBeTruthy()
  })

  it('coordinated migration converts v1 JSON to v2 map without losing replies', function () {
    const doc = new Y.Doc()
    const map = getOrCreateAnnotationsMap(doc)
    const v1Store = new AnnotationStore(map, null, { writeVersion: 1 })
    const id = v1Store.create({
      id: 'migrate-me',
      type: 'comment',
      anchor: null,
      head: null,
      authorId: 'a',
      data: { body: 'v1' }
    })!
    v1Store.addReply(id, { id: 'r1', authorId: 'a', body: 'legacy reply' })

    const { migrated } = coordinatedMigrateAnnotationsV1ToV2({ doc })
    expect(migrated).toBe(1)
    expect(isV2AnnotationMap(map.get(id))).toBe(true)
    expect(parseAnnotationStorageValue(map.get(id))?.data?.thread?.[0]?.body).toBe('legacy reply')
  })

  it('DocumentAnnotations.sync rebinds after component type change (no stale overlay host)', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })
    const paragraph = insertCmsComponent(root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Rebind body text')
    const componentId = paragraph.map.get('id') as string

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer
    })
    const documentAnnotations = new EditableYjsDocumentAnnotations({
      documentBinding: binding,
      authorId: 'author-a'
    })
    documentAnnotations.sync()

    const before = documentAnnotations.getDirectiveAnnotations(componentId, 'body')!
    const annId = before.createAtOffsets('comment', 0, 6, { body: 'note' })
    expect(annId).toBeTruthy()
    before.refresh()
    expect(document.querySelectorAll('.editable-yjs-annotation-layer').length).toBe(1)

    changeCmsComponentType(root, componentId, 'quote', binding.transactionOrigin)
    binding.reconcile('type-change')
    documentAnnotations.sync()

    const after = documentAnnotations.getDirectiveAnnotations(componentId, 'body')!
    expect(after).not.toBe(before)
    expect(before.isDestroyed).toBe(true)
    expect(after.host.isConnected).toBe(true)
    expect(after.isDestroyed).toBe(false)
    after.refresh()
    expect(documentAnnotations.store.get(annId!)?.status).toBe('active')
    expect(document.querySelector('[data-annotation-id]')).not.toBeNull()

    documentAnnotations.destroy()
    binding.destroy()
    editable.unload()
  })

  it('ignores malformed v2 and v1 payloads when listing', function () {
    const doc = new Y.Doc()
    const map = getOrCreateAnnotationsMap(doc)
    map.set('bad-v1', {
      v: 1,
      id: 'bad-v1',
      type: 'comment',
      anchor: 'nope',
      head: null,
      authorId: 'x',
      createdAt: 'not-date'
    })
    const broken = new Y.Map()
    broken.set('v', 2)
    broken.set('id', 'bad-v2')
    map.set('bad-v2', broken)

    expect(new AnnotationStore(map).list().length).toBe(0)
  })

  it('orphan + undo-style reopen on single host', function () {
    const peer = createRichPeer('orphan')
    const store = new AnnotationStore(getOrCreateAnnotationsMap(peer.doc))
    const binding = bindRichPeer(peer)
    const annotations = new EditableYjsAnnotations({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      store,
      authorId: 'a'
    })
    simulateInsertText(peer.host, peer.editable, 'gone')
    const id = annotations.createAtOffsets('comment', 0, 4, { body: 'x' })!
    peer.yText.delete(0, peer.yText.length)
    binding.reconcile('delete-all')
    annotations.refresh()
    expect(store.get(id)?.status).toBe('orphaned')

    peer.yText.insert(0, 'back')
    binding.reconcile('undo-ish')
    annotations.refresh()
    expect(store.get(id)?.status).toBe('orphaned')

    annotations.destroy()
    binding.destroy()
    peer.editable.unload()
  })

  it('destroy and remount directive annotations without duplicate layers', function () {
    const peer = createRichPeer('mount')
    const store = new AnnotationStore(getOrCreateAnnotationsMap(peer.doc))
    const binding = bindRichPeer(peer)
    const first = new EditableYjsAnnotations({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      store,
      authorId: 'a'
    })
    simulateInsertText(peer.host, peer.editable, 'text')
    first.createAtCursor('comment', { body: 'm' })
    first.destroy()

    const second = new EditableYjsAnnotations({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      store,
      authorId: 'a'
    })
    second.refresh()
    expect(document.querySelectorAll('.editable-yjs-annotation-layer').length).toBe(1)

    second.destroy()
    binding.destroy()
    peer.editable.unload()
  })
})

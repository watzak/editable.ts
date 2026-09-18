import * as Y from 'yjs'
import { vi } from 'vitest'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { setSelectionFromSnapshot } from '../src/operation-selection.js'
import {
  AnnotationStore,
  EditableYjsAnnotations,
  getOrCreateAnnotationsMap,
  captureAnnotationSnapshotsBeforeSplit,
  migrateAnnotationsOnMerge,
  migrateAnnotationsOnSplit,
  parseAnnotationRecord
} from '../src/yjs/index.js'
import { defaultAnnotationRenderer } from '../src/yjs/annotation-renderer.js'
import { createRichPeer, bindRichPeer, simulateInsertText } from './helpers/yjs-rich-harness.js'
import {
  createSelection,
  simulateInsertText as simulatePlainInsert,
  syncDocToTarget
} from './helpers/yjs-sync-harness.js'
import { createStructuralFixture, simulateSplitAt } from './helpers/yjs-structural-harness.js'

describe('Yjs collaborative annotations', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.editable-yjs-annotation-layer').forEach((node) => node.remove())
  })

  function createAnnotatedPeer(name: string, authorId: string) {
    const peer = createRichPeer(name)
    const store = new AnnotationStore(getOrCreateAnnotationsMap(peer.doc))
    const binding = bindRichPeer(peer)
    const annotations = new EditableYjsAnnotations({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      store,
      authorId
    })
    return { ...peer, binding, store, annotations }
  }

  it('creates a collapsed comment at the cursor', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'hello world')
    setSelectionFromSnapshot(peer.host, { anchor: 6, head: 6, direction: 'none' })
    peer.editable.dispatcher.selectionWatcher.syncSelection()

    const id = peer.annotations.createAtCursor('comment', { body: 'Check this word' })
    expect(id).toBeTruthy()
    expect(peer.store.list().length).toBe(1)
    expect(peer.store.get(id!)?.data?.body).toBe('Check this word')

    peer.annotations.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('creates a range comment on text selection', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'annotate me')
    createSelection(peer.host, 0, 8)

    const id = peer.annotations.createAtOffsets('issue', 0, 8, { body: 'Needs review' })
    expect(id).toBeTruthy()

    peer.annotations.refresh()
    expect(
      document.querySelector('.editable-yjs-annotation-list [data-annotation-id]')
    ).not.toBeNull()

    peer.annotations.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('does not mutate getContent() or Y.Text attributes when rendering', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'plain')
    createSelection(peer.host, 0, 5)

    peer.annotations.createAtOffsets('comment', 0, 5, { body: 'note' })
    const htmlBefore = peer.host.innerHTML
    const yBefore = JSON.stringify(peer.yText.toDelta())
    const contentBefore = peer.editable.getContent(peer.host)

    peer.annotations.refresh()

    expect(peer.host.innerHTML).toBe(htmlBefore)
    expect(JSON.stringify(peer.yText.toDelta())).toBe(yBefore)
    expect(peer.editable.getContent(peer.host)).toBe(contentBefore)

    peer.annotations.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('survives remote insert before the annotation range', function () {
    const a = createAnnotatedPeer('shared', 'author-a')
    const b = createAnnotatedPeer('shared', 'author-b')

    simulateInsertText(a.host, a.editable, 'abcdef')
    syncDocToTarget(a.doc, b.doc)
    b.binding.reconcile('sync')

    a.annotations.createAtOffsets('comment', 2, 4, { body: 'mid' })
    syncDocToTarget(a.doc, b.doc)

    b.yText.insert(0, 'XX')
    syncDocToTarget(b.doc, a.doc)
    a.binding.reconcile('remote-insert-before')

    const record = a.store.list()[0]
    expect(record?.status).toBe('active')
    a.annotations.refresh()
    expect(document.querySelector('[data-annotation-id]')).not.toBeNull()

    a.annotations.destroy()
    b.annotations.destroy()
    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('survives remote insert inside the annotation range', function () {
    const a = createAnnotatedPeer('shared', 'author-a')
    simulateInsertText(a.host, a.editable, 'abcdef')
    a.annotations.createAtOffsets('comment', 1, 5, { body: 'span' })

    a.yText.insert(3, 'Z')
    a.binding.reconcile('insert-inside')
    a.annotations.refresh()

    expect(a.store.list()[0]?.status).toBe('active')
    expect(
      document.querySelector('.editable-yjs-annotation-list [data-annotation-id]')
    ).not.toBeNull()

    a.annotations.destroy()
    a.binding.destroy()
    a.editable.unload()
  })

  it('marks annotation orphaned when target text is fully deleted', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'gone')
    const id = peer.annotations.createAtOffsets('comment', 0, 4, { body: 'temp' })

    peer.yText.delete(0, peer.yText.length)
    peer.binding.reconcile('full-delete')
    peer.annotations.refresh()

    peer.annotations.refresh()
    expect(peer.store.get(id!)?.status).toBe('orphaned')
    expect(document.querySelector('.editable-yjs-annotation-list li')?.textContent).toContain(
      'Orphaned'
    )

    peer.annotations.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('migrates annotations on split to the new directive when anchor is after split', function () {
    const fixture = createStructuralFixture()
    const store = new AnnotationStore(getOrCreateAnnotationsMap(fixture.doc))
    const annotations = new EditableYjsAnnotations({
      editable: fixture.editable,
      host: fixture.host,
      yText: fixture.body,
      store,
      authorId: 'author-a'
    })

    simulatePlainInsert(fixture.host, fixture.editable, 'headtail')
    const id = annotations.createAtOffsets('comment', 4, 8, { body: 'tail note' })
    expect(id).toBeTruthy()

    const secondBindingEntry = [...fixture.registryMap.values()][1]
    const snapshots = captureAnnotationSnapshotsBeforeSplit({
      store,
      splitOffset: 4,
      sourceYText: fixture.body,
      targetYText: secondBindingEntry?.binding.yText ?? fixture.body
    })

    simulateSplitAt(fixture.host, fixture.editable, 4)

    const secondHost = fixture.container.querySelectorAll('[contenteditable]')[1] as HTMLElement
    const secondBinding = [...fixture.registryMap.values()][1]?.binding
    expect(secondHost).toBeTruthy()
    expect(secondBinding).toBeTruthy()

    migrateAnnotationsOnSplit({
      store,
      splitOffset: 4,
      sourceYText: fixture.body,
      targetYText: secondBinding!.yText,
      sourceDirectiveId: 'body',
      targetDirectiveId: 'body',
      snapshots
    })

    const record = store.get(id!)
    expect(record?.status).toBe('active')
    expect(getBlockOperationText(secondHost)).toBe('tail')

    annotations.destroy()
    fixture.binding.destroy()
    for (const entry of fixture.registryMap.values()) entry.binding.destroy()
    fixture.editable.unload()
    fixture.container.remove()
  })

  it('migrates annotations on merge onto the surviving Y.Text', function () {
    const fixture = createStructuralFixture()
    const store = new AnnotationStore(getOrCreateAnnotationsMap(fixture.doc))
    const annotations = new EditableYjsAnnotations({
      editable: fixture.editable,
      host: fixture.host,
      yText: fixture.body,
      store,
      authorId: 'author-a',
      directiveId: 'body'
    })

    simulatePlainInsert(fixture.host, fixture.editable, 'one')
    simulateSplitAt(fixture.host, fixture.editable, 3)

    const hosts = fixture.container.querySelectorAll('[contenteditable]')
    const secondHost = hosts[1] as HTMLElement
    simulatePlainInsert(secondHost, fixture.editable, 'two')

    const secondEntry = [...fixture.registryMap.values()][1]
    const secondAnnotations = new EditableYjsAnnotations({
      editable: fixture.editable,
      host: secondHost,
      yText: secondEntry!.binding.yText,
      store,
      authorId: 'author-a',
      directiveId: 'body'
    })
    const id = secondAnnotations.createAtOffsets('comment', 0, 3, { body: 'second block' })
    expect(id).toBeTruthy()

    migrateAnnotationsOnMerge({
      store,
      mergeOffset: fixture.body.length,
      targetYText: fixture.body,
      sourceYText: secondEntry!.binding.yText,
      targetDirectiveId: 'body',
      sourceDirectiveId: 'body'
    })

    expect(store.get(id!)?.status).toBe('active')

    annotations.destroy()
    secondAnnotations.destroy()
    for (const entry of fixture.registryMap.values()) entry.binding.destroy()
    fixture.editable.unload()
    fixture.container.remove()
  })

  it('converges parallel comments from two clients', function () {
    const a = createAnnotatedPeer('shared', 'author-a')
    const b = createAnnotatedPeer('shared', 'author-b')

    simulateInsertText(a.host, a.editable, 'shared text')
    syncDocToTarget(a.doc, b.doc)
    b.binding.reconcile('sync')

    a.annotations.createAtOffsets('comment', 0, 6, { body: 'from A' })
    syncDocToTarget(a.doc, b.doc)

    b.binding.reconcile('text-sync')
    createSelection(b.host, 7, 11)
    b.annotations.createAtOffsets('issue', 7, 11, { body: 'from B' })
    syncDocToTarget(b.doc, a.doc)
    syncDocToTarget(a.doc, b.doc)

    expect(a.store.list().length).toBe(2)
    expect(b.store.list().length).toBe(2)

    a.annotations.destroy()
    b.annotations.destroy()
    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('supports resolve and reopen', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'review')
    const id = peer.annotations.createAtOffsets('issue', 0, 6, { body: 'fix' })

    expect(peer.annotations.resolve(id!)).toBe(true)
    expect(peer.store.get(id!)?.resolvedAt).toBeTruthy()
    peer.annotations.refresh()
    expect(document.querySelector('.editable-yjs-annotation-highlight')).toBeNull()

    expect(peer.annotations.reopen(id!)).toBe(true)
    expect(peer.store.get(id!)?.resolvedAt).toBeUndefined()

    peer.annotations.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('supports threaded replies with sanitization', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'thread')
    const id = peer.annotations.createAtOffsets('comment', 0, 6, { body: 'root' })

    expect(peer.annotations.addReply(id!, '  reply one  ')).toBe(true)
    expect(peer.store.get(id!)?.data?.thread?.[0]?.body).toBe('reply one')

    peer.annotations.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('ignores invalid remote annotation payloads', function () {
    const doc = new Y.Doc()
    const map = getOrCreateAnnotationsMap(doc)
    map.set('bad', {
      v: 1,
      id: 'bad',
      type: 'comment',
      anchor: 'not-json',
      head: null,
      authorId: '<script>',
      createdAt: 'not-a-date',
      data: { body: '<img onerror=alert(1)>' }
    })

    expect(parseAnnotationRecord(map.get('bad'))).toBeNull()
  })

  it('destroy stops further renders and remount is safe', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'text')
    peer.annotations.createAtCursor('comment', { body: 'x' })

    peer.annotations.destroy()
    expect(document.querySelector('.editable-yjs-annotation-layer')).toBeNull()

    const again = new EditableYjsAnnotations({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      store: peer.store,
      authorId: 'author-a'
    })
    again.refresh()
    expect(document.querySelector('.editable-yjs-annotation-layer')).not.toBeNull()

    again.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })

  it('uses accessible renderer output without innerHTML', function () {
    const peer = createAnnotatedPeer('a', 'author-a')
    simulateInsertText(peer.host, peer.editable, 'access')
    peer.annotations.createAtOffsets('suggestion', 0, 6, { body: 'safe label' })

    const renderSpy =
      vi.fn<(context: Parameters<typeof defaultAnnotationRenderer>[0]) => void>(
        defaultAnnotationRenderer
      )
    peer.annotations.destroy()

    const annotations = new EditableYjsAnnotations({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      store: peer.store,
      authorId: 'author-a',
      renderer: { render: renderSpy }
    })
    annotations.refresh()

    expect(renderSpy).toHaveBeenCalled()
    const layer = document.querySelector('.editable-yjs-annotation-layer')
    expect(layer?.querySelector('[role="list"]')).not.toBeNull()
    expect(layer?.innerHTML).not.toContain('<script>')

    annotations.destroy()
    peer.binding.destroy()
    peer.editable.unload()
  })
})

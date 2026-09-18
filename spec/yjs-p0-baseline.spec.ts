/**
 * P0 reproduction matrix for optional `./yjs` + CMS example adapter.
 * Seed: `20260918-p0-baseline` — see docs/YJS_P0_BASELINE.md for expected vs observed.
 */
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { OperationValidationError } from '../src/operation-apply.js'
import { dispatchEditableCommand } from '../src/command-pipeline.js'
import { buildPasteCommandAtOffset } from '../src/command-builder.js'
import {
  EditableYjsBinding,
  EditableYjsDocumentBinding,
  migrateAnnotationsOnSplit
} from '../src/yjs/index.js'
import { EditableYjsDocumentAnnotations } from '../src/yjs/editable-yjs-document-annotations.js'
import {
  changeCmsComponentType,
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  insertCmsComponent,
  moveCmsComponent
} from '../examples/yjs-cms-document-adapter.js'
import {
  createSelection,
  defaultInitialSyncPolicy,
  simulateInsertText
} from './helpers/yjs-sync-harness.js'
import { createStructuralFixture, simulateSplitAt } from './helpers/yjs-structural-harness.js'
import { AnnotationStore, getOrCreateAnnotationsMap } from '../src/yjs/annotation-store.js'

export const P0_BASELINE_SEED = '20260918-p0-baseline'

function syncPeer(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
}

function replayLine(label: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- intentional P0 replay artifact
  console.info(`[P0:${P0_BASELINE_SEED}] ${label}`, JSON.stringify(payload))
}

function bodyYTextForComponent(root: Y.Array<Y.Map<unknown>>, componentId: string): Y.Text | null {
  let found: Y.Text | null = null
  const walk = (array: Y.Array<Y.Map<unknown>>): void => {
    for (let i = 0; i < array.length; i += 1) {
      const map = array.get(i)
      if (!(map instanceof Y.Map)) continue
      if (map.get('id') === componentId) {
        const content = map.get('content')
        if (content instanceof Y.Map) {
          const body = content.get('body')
          if (body instanceof Y.Text) found = body
        }
        return
      }
      const containers = map.get('containers')
      if (containers instanceof Y.Map) {
        containers.forEach((child) => {
          if (child instanceof Y.Array) walk(child)
        })
      }
    }
  }
  walk(root)
  return found
}

describe(`Yjs P0 baseline (${P0_BASELINE_SEED})`, function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
  })

  describe('structure: two simultaneous moves', function () {
    it('converges root length and component ids after cross moves', function () {
      const aDoc = new Y.Doc()
      const bDoc = new Y.Doc()
      const aRoot = createCmsDocumentRoot(aDoc)
      const bRoot = createCmsDocumentRoot(bDoc)

      let idA = ''
      let idB = ''
      let idC = ''
      aDoc.transact(() => {
        idA = insertCmsComponent(aRoot, 'paragraph', 0).map.get('id') as string
        idB = insertCmsComponent(aRoot, 'paragraph', 1).map.get('id') as string
        idC = insertCmsComponent(aRoot, 'paragraph', 2).map.get('id') as string
      })
      syncPeer(aDoc, bDoc)

      aDoc.transact(() => moveCmsComponent(aRoot, idA, aRoot, 2, 'move-a'))
      bDoc.transact(() => moveCmsComponent(bRoot, idC, bRoot, 0, 'move-b'))

      syncPeer(aDoc, bDoc)
      syncPeer(bDoc, aDoc)

      replayLine('dual-move', {
        aLen: aRoot.length,
        bLen: bRoot.length,
        aOrder: [...Array(aRoot.length)].map((_, i) => (aRoot.get(i) as Y.Map<unknown>).get('id')),
        bOrder: [...Array(bRoot.length)].map((_, i) => (bRoot.get(i) as Y.Map<unknown>).get('id'))
      })

      expect(aRoot.length).toBe(bRoot.length)
      expect(aRoot.length).toBe(3)
      expect(new Set([idA, idB, idC]).size).toBe(3)
    })
  })

  describe('structure: multi-block paste with suffix', function () {
    it('drops Y.Text suffix after pasteBlocks (CMS example adapter)', function () {
      const doc = new Y.Doc()
      const root = createCmsDocumentRoot(doc)
      const mountContainer = document.createElement('div')
      document.body.appendChild(mountContainer)
      const editable = new Editable({ defaultBehavior: true })
      const adapter = createCmsDocumentAdapter({ mountContainer })
      const paragraph = insertCmsComponent(root, 'paragraph', 0)
      paragraph.body!.insert(0, 'prefixSUFFIX')
      const paragraphId = paragraph.map.get('id') as string

      const binding = new EditableYjsDocumentBinding({
        editable,
        yDoc: doc,
        root,
        adapter,
        mountContainer
      })

      const bodyHost = binding.getComponentView(paragraphId)!.directiveHosts.get('body')!
      const cursor = editable.createCursorAtCharacterOffset({ element: bodyHost, offset: 6 })
      cursor?.setVisibleSelection()

      const pasteCmd = buildPasteCommandAtOffset(
        bodyHost,
        ['<p>block-one</p>', '<p>block-two</p>'],
        6,
        'paste'
      )
      dispatchEditableCommand(editable.dispatcher.notify, pasteCmd, { cursor: cursor! })
      binding.reconcile('p0-paste-suffix')

      replayLine('paste-suffix', {
        sourceYText: paragraph.body!.toString(),
        rootLen: root.length,
        blockTexts: [...Array(root.length)].map((_, i) => {
          const body = ((root.get(i) as Y.Map<unknown>).get('content') as Y.Map<unknown>).get(
            'body'
          ) as Y.Text
          return body.toString()
        })
      })

      expect(paragraph.body!.toString()).toBe('prefix')
      expect(root.length).toBe(3)

      binding.destroy()
      editable.unload()
    })
  })

  describe('annotations: type change same componentId/directiveKey', function () {
    it('keeps document annotation active on remounted body host', function () {
      const doc = new Y.Doc()
      const root = createCmsDocumentRoot(doc)
      const mountContainer = document.createElement('div')
      document.body.appendChild(mountContainer)
      const editable = new Editable({ defaultBehavior: true })
      const adapter = createCmsDocumentAdapter({ mountContainer })
      const paragraph = insertCmsComponent(root, 'paragraph', 0)
      paragraph.body!.insert(0, 'Type change body')
      const id = paragraph.map.get('id') as string

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

      const directive = documentAnnotations.getDirectiveAnnotations(id, 'body')!
      const annId = directive.createAtOffsets('comment', 0, 4, { body: 'note' })
      expect(annId).toBeTruthy()

      const hostBefore = binding.getComponentView(id)!.directiveHosts.get('body')
      changeCmsComponentType(root, id, 'quote', binding.transactionOrigin)
      binding.reconcile('p0-type-change')
      documentAnnotations.sync()

      const hostAfter = binding.getComponentView(id)!.directiveHosts.get('body')
      replayLine('annotation-type-change', {
        sameHostReference: hostBefore === hostAfter,
        recordStatus: documentAnnotations.store.get(annId!)?.status
      })

      expect(hostBefore).not.toBe(hostAfter)
      expect(documentAnnotations.store.get(annId!)?.status).toBe('active')
      expect(documentAnnotations.store.get(annId!)?.componentId).toBe(id)

      documentAnnotations.destroy()
      binding.destroy()
      editable.unload()
    })
  })

  describe('host policy: allowedFormats [] and plainText', function () {
    it('rejects setTextAttributes on plainText host via applyOperations', function () {
      const doc = new Y.Doc()
      const yText = doc.getText('plain')
      const host = document.createElement('div')
      host.setAttribute('contenteditable', 'true')
      document.body.appendChild(host)
      const editable = new Editable({ defaultBehavior: false })
      editable.add(host, { plainText: true })
      const binding = new EditableYjsBinding({
        editable,
        host,
        yText,
        initialSync: defaultInitialSyncPolicy
      })
      host.textContent = 'plain'
      yText.insert(0, 'plain')

      expect(() =>
        editable.applyOperations(host, {
          source: 'api',
          operations: [
            { type: 'setTextAttributes', index: 0, length: 5, attributes: { bold: true } }
          ]
        })
      ).toThrow(OperationValidationError)

      expect(getBlockOperationText(host)).toBe('plain')
      expect(yText.toString()).toBe('plain')
      binding.destroy()
      editable.unload()
    })
  })

  describe('applyOperations on active Yjs binding (DOM-only semantics)', function () {
    it('updates DOM but does not mutate Y.Text (uses beginRemoteApply, no operation event)', function () {
      const doc = new Y.Doc()
      const yText = doc.getText('bound')
      const host = document.createElement('div')
      host.setAttribute('contenteditable', 'true')
      document.body.appendChild(host)
      const editable = new Editable({ defaultBehavior: false })
      editable.add(host)
      const binding = new EditableYjsBinding({
        editable,
        host,
        yText,
        initialSync: defaultInitialSyncPolicy
      })
      simulateInsertText(host, editable, 'base')
      const yBefore = yText.toString()

      editable.applyOperations(
        host,
        { source: 'api', operations: [{ type: 'insertText', index: 4, text: 'DOM' }] },
        { emitChange: false }
      )

      replayLine('applyOperations-dom-only', {
        yText: yText.toString(),
        dom: getBlockOperationText(host)
      })

      expect(getBlockOperationText(host)).toBe('baseDOM')
      expect(yText.toString()).toBe(yBefore)

      binding.destroy()
      editable.unload()
    })
  })

  describe('invalid multi-operations before CRDT apply', function () {
    it('throws OperationValidationError without changing Y.Text', function () {
      const doc = new Y.Doc()
      const yText = doc.getText('t')
      yText.insert(0, 'ab')
      const host = document.createElement('div')
      host.setAttribute('contenteditable', 'true')
      host.textContent = 'ab'
      document.body.appendChild(host)
      const editable = new Editable({ defaultBehavior: false })
      editable.add(host)
      const binding = new EditableYjsBinding({
        editable,
        host,
        yText,
        initialSync: defaultInitialSyncPolicy
      })

      expect(() =>
        editable.applyOperations(host, {
          source: 'api',
          operations: [
            { type: 'deleteText', index: 0, length: 1 },
            { type: 'insertText', index: 5, text: 'z' }
          ]
        })
      ).toThrow(OperationValidationError)
      expect(yText.toString()).toBe('ab')

      binding.destroy()
      editable.unload()
    })
  })

  describe('split with relative positions (annotation migration)', function () {
    it('migrates annotation onto split target Y.Text (structural harness replay)', function () {
      const fixture = createStructuralFixture()
      const store = new AnnotationStore(getOrCreateAnnotationsMap(fixture.doc))

      simulateInsertText(fixture.host, fixture.editable, 'headtail')
      createSelection(fixture.host, 4, 8)
      const id = store.create({
        type: 'comment',
        anchor: null,
        head: null,
        authorId: 'author-a',
        data: { body: 'tail note' }
      })
      expect(id).toBeTruthy()

      simulateSplitAt(fixture.host, fixture.editable, 4)
      const secondBinding = [...fixture.registryMap.values()][1]?.binding
      expect(secondBinding).toBeTruthy()

      migrateAnnotationsOnSplit({
        store,
        splitOffset: 4,
        sourceYText: fixture.body,
        targetYText: secondBinding!.yText,
        sourceDirectiveId: 'body',
        targetDirectiveId: 'body'
      })

      replayLine('split-rel-pos', { status: store.get(id!)?.status })
      expect(store.get(id!)?.status).toBe('active')

      fixture.binding.destroy()
      for (const entry of fixture.registryMap.values()) entry.binding.destroy()
      fixture.editable.unload()
      fixture.container.remove()
    })
  })
})

/** Gate: known P0 failures — must stay red until fixed (do not assert success here). */
describe(`Yjs P0 gate — known failures (${P0_BASELINE_SEED})`, function () {
  it.fails('moveCmsComponent clones Y.Text — concurrent remote edit targets pre-move body', function () {
    const aDoc = new Y.Doc()
    const bDoc = new Y.Doc()
    const aRoot = createCmsDocumentRoot(aDoc)
    const bRoot = createCmsDocumentRoot(bDoc)

    const p0 = insertCmsComponent(aRoot, 'paragraph', 0)
    insertCmsComponent(aRoot, 'paragraph', 1)
    const id = p0.map.get('id') as string
    p0.body!.insert(0, 'alpha')
    syncPeer(aDoc, bDoc)

    const bBodyBeforeMove = bodyYTextForComponent(bRoot, id)!
    bDoc.transact(() => bBodyBeforeMove.insert(5, '!'), 'remote-text')

    aDoc.transact(() => moveCmsComponent(aRoot, id, aRoot, 1, 'local-move'))
    syncPeer(aDoc, bDoc)
    syncPeer(bDoc, aDoc)

    const aBody = bodyYTextForComponent(aRoot, id)!
    const bBody = bodyYTextForComponent(bRoot, id)!

    replayLine('gate-move-vs-remote-text', {
      aYText: aBody.toString(),
      bYText: bBody.toString(),
      aOrder: [...Array(aRoot.length)].map((_, i) => (aRoot.get(i) as Y.Map<unknown>).get('id'))
    })

    expect(aBody.toString()).toBe('alpha!')
    expect(bBody.toString()).toBe('alpha!')
  })

  it.fails('v1 concurrent addReply loses one reply (whole-record Y.Map LWW)', function () {
    const seedDoc = new Y.Doc()
    const map = getOrCreateAnnotationsMap(seedDoc)
    const store = new AnnotationStore(map, null, { writeVersion: 1 })
    const id = `${P0_BASELINE_SEED}-lww-replies`
    store.create({
      id,
      type: 'comment',
      anchor: null,
      head: null,
      authorId: 'author-a',
      data: { body: 'root' }
    })

    const docA = new Y.Doc()
    const docB = new Y.Doc()
    const u = Y.encodeStateAsUpdate(seedDoc)
    Y.applyUpdate(docA, u)
    Y.applyUpdate(docB, u)

    const storeA = new AnnotationStore(getOrCreateAnnotationsMap(docA), null, { writeVersion: 1 })
    const storeB = new AnnotationStore(getOrCreateAnnotationsMap(docB), null, { writeVersion: 1 })
    expect(storeA.addReply(id, { authorId: 'peer-a', body: 'reply-a' })).toBe(true)
    expect(storeB.addReply(id, { authorId: 'peer-b', body: 'reply-b' })).toBe(true)

    syncPeer(docA, docB)
    syncPeer(docB, docA)

    const thread = new AnnotationStore(getOrCreateAnnotationsMap(docA)).get(id)?.data?.thread ?? []
    replayLine('gate-addReply-pre-sync', { threadBodies: thread.map((t) => t.body) })
    expect(thread.length).toBe(2)
    expect(thread.map((t) => t.body).sort()).toEqual(['reply-a', 'reply-b'])
  })
})

import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { setSelectionFromSnapshot } from '../src/operation-selection.js'
import { applyLiveOperationBatchToDom, OperationValidationError } from '../src/operation-apply.js'
import {
  EditableYjsBinding,
  applyHostInlineMarkupToYText,
  hostRichTextMatchesYText,
  reconcileHostToCanonicalYText
} from '../src/yjs/index.js'
import {
  bindRichPeer,
  createRichPeer,
  hostInnerHtml,
  hostPlainText,
  hostTextRuns,
  mergeDocs,
  applyAndEmitOperations,
  simulateLink,
  simulateToggleBold,
  simulateToggleItalic,
  syncDocToTarget
} from './helpers/yjs-rich-harness.js'
import {
  defaultInitialSyncPolicy,
  simulateInsertText as simulatePlainInsert
} from './helpers/yjs-sync-harness.js'
import {
  createExampleArrayStructuralAdapter,
  type ExampleBlockRegistry
} from '../examples/yjs-array-structural-adapter.js'

type ExampleBlockEntry = NonNullable<ReturnType<ExampleBlockRegistry['get']>>

function deltaHasBold(delta: unknown[]): boolean {
  return JSON.stringify(delta).includes('"bold":true')
}

describe('Yjs rich-text sync', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  function insertRichText(host: HTMLElement, editable: Editable, text: string): void {
    simulatePlainInsert(host, editable, text)
  }

  it('writes bold to Y.Text with structural adapter and undo enabled', function () {
    const BLOCKS_KEY = 'editable.ts:example:blocks'
    const doc = new Y.Doc()
    const blocks = doc.getArray<Y.Map<unknown>>(BLOCKS_KEY)
    const body = new Y.Text()
    const map = new Y.Map<unknown>()
    map.set('id', 'block-1')
    map.set('body', body)
    blocks.insert(0, [map])

    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    document.body.appendChild(host)
    const editable = new Editable({ defaultBehavior: true })
    editable.add(host)

    const registryMap = new Map<string, ExampleBlockEntry>()
    const registry: ExampleBlockRegistry = {
      get: (key) => registryMap.get(key),
      set: (key, entry) => {
        registryMap.set(key, entry)
      },
      delete: (key) => {
        registryMap.delete(key)
      }
    }

    const adapter = createExampleArrayStructuralAdapter({
      blocks,
      registry,
      initialSync: defaultInitialSyncPolicy,
      createHost: () => host
    })

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText: body,
      initialSync: defaultInitialSyncPolicy,
      undo: { captureTimeout: 500 },
      structuralAdapter: adapter
    })
    registry.set('block-1', { host, binding })

    insertRichText(host, editable, 'bold word')
    simulateToggleBold(host, editable, 0, 4)

    expect(deltaHasBold(body.toDelta())).toBe(true)

    binding.destroy()
    editable.unload()
  })

  it('collab demo bold on "Text ist bold." survives post-sync reconcile', function () {
    const doc = new Y.Doc()
    const blocks = doc.getArray<Y.Map<unknown>>('editable.ts:example:blocks')
    const body = new Y.Text()
    const map = new Y.Map<unknown>()
    map.set('id', 'block-1')
    map.set('body', body)
    blocks.insert(0, [map])

    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    document.body.appendChild(host)
    const editable = new Editable({ defaultBehavior: true })
    editable.add(host, { plainText: false })

    const registryMap = new Map<string, ExampleBlockEntry>()
    const registry: ExampleBlockRegistry = {
      get: (key) => registryMap.get(key),
      set: (key, entry) => {
        registryMap.set(key, entry)
      },
      delete: (key) => {
        registryMap.delete(key)
      }
    }

    const adapter = createExampleArrayStructuralAdapter({
      blocks,
      registry,
      initialSync: defaultInitialSyncPolicy,
      createHost: () => host
    })

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText: body,
      initialSync: defaultInitialSyncPolicy,
      undo: { captureTimeout: 500 },
      structuralAdapter: adapter
    })
    registry.set('block-1', { host, binding })

    insertRichText(host, editable, 'Text ist bold.')
    simulateToggleBold(host, editable, 9, 13)

    expect(deltaHasBold(body.toDelta())).toBe(true)

    const reconcileResult = binding.reconcile('post-sync')
    expect(reconcileResult.action).not.toBe('applied-y-to-host')
    expect(deltaHasBold(body.toDelta())).toBe(true)
    expect(hostTextRuns(host).some((run) => run.attributes.bold === true)).toBe(true)

    binding.destroy()
    editable.unload()
  })

  it('syncs bold to peer DOM with collab-style blocks-array documents', function () {
    const BLOCKS_KEY = 'editable.ts:example:blocks'
    const docA = new Y.Doc()
    const docB = new Y.Doc()

    const bodyA = new Y.Text()
    const mapA = new Y.Map()
    mapA.set('id', 'block-1')
    mapA.set('body', bodyA)
    docA.getArray(BLOCKS_KEY).insert(0, [mapA])

    const hostA = document.createElement('div')
    hostA.setAttribute('contenteditable', 'true')
    document.body.appendChild(hostA)
    const editableA = new Editable({ defaultBehavior: true })
    editableA.add(hostA)

    const bindingA = new EditableYjsBinding({
      editable: editableA,
      host: hostA,
      yText: bodyA,
      initialSync: defaultInitialSyncPolicy,
      undo: { captureTimeout: 500 }
    })

    insertRichText(hostA, editableA, 'test ist ')
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
    const bodyB = docB.getArray<Y.Map<unknown>>(BLOCKS_KEY).get(0).get('body') as Y.Text

    const hostB = document.createElement('div')
    hostB.setAttribute('contenteditable', 'true')
    document.body.appendChild(hostB)
    const editableB = new Editable({ defaultBehavior: true })
    editableB.add(hostB)

    const bindingB = new EditableYjsBinding({
      editable: editableB,
      host: hostB,
      yText: bodyB,
      initialSync: defaultInitialSyncPolicy,
      undo: { captureTimeout: 500 }
    })

    simulateToggleBold(hostA, editableA, 0, 4)
    syncDocToTarget(docA, docB)
    syncDocToTarget(docB, docA)

    expect(JSON.stringify(bodyB.toDelta())).toContain('"bold":true')
    expect(hostTextRuns(hostB).some((run) => run.attributes.bold === true)).toBe(true)
    expect(hostPlainText(hostB)).toBe('test ist ')

    bindingA.destroy()
    bindingB.destroy()
    editableA.unload()
    editableB.unload()
  })

  it('applyHostInlineMarkupToYText writes bold from strong tags into plain Y.Text', function () {
    const peer = createRichPeer('markup-fallback')
    insertRichText(peer.host, peer.editable, 'Text ist bold.')
    peer.host.innerHTML = 'Text ist <strong>bold</strong>.'

    peer.doc.transact(() => {
      if (peer.yText.length > 0) peer.yText.delete(0, peer.yText.length)
      peer.yText.insert(0, 'Text ist bold.')
      applyHostInlineMarkupToYText(peer.yText, peer.host, document)
    })

    expect(deltaHasBold(peer.yText.toDelta())).toBe(true)
    peer.editable.unload()
  })

  it('detects DOM-only bold as mismatch and promotes host markup into Y.Text on reconcile', function () {
    const peer = createRichPeer('dom-markup-mismatch')
    const binding = bindRichPeer(peer)

    insertRichText(peer.host, peer.editable, 'Text ist bold.')
    peer.host.innerHTML = 'Text ist <strong>bold</strong>.'

    expect(hostRichTextMatchesYText(peer.host, peer.yText, document)).toBe(false)

    const result = reconcileHostToCanonicalYText(peer.editable, peer.host, peer.yText, 'test', {
      richText: true,
      doc: document
    })

    expect(result.action).toBe('promoted-host-to-y')
    expect(deltaHasBold(peer.yText.toDelta())).toBe(true)

    binding.destroy()
    peer.editable.unload()
  })

  it('syncRichHostRunsToYText copies DOM bold into Y.Text', function () {
    const peer = createRichPeer('dom-to-y')
    const binding = bindRichPeer(peer)

    insertRichText(peer.host, peer.editable, 'hello')
    expect(JSON.stringify(peer.yText.toDelta())).not.toContain('"bold":true')

    const strong = document.createElement('strong')
    strong.textContent = 'hello'
    peer.host.replaceChildren(strong)

    binding.syncRichHostRunsToYText()

    expect(peer.yText.toDelta()).toEqual([{ insert: 'hello', attributes: { bold: true } }])

    binding.destroy()
    peer.editable.unload()
  })

  it('rebuilds DOM formatting when Y.Text carries attributes but host is plain', function () {
    const b = createRichPeer('format-drift')
    const bindingB = bindRichPeer(b)

    insertRichText(b.host, b.editable, 'hello world')
    expect(hostTextRuns(b.host).every((run) => run.attributes.bold !== true)).toBe(true)

    b.doc.transact(() => {
      b.yText.format(0, 5, { bold: true })
    }, 'remote-peer')

    expect(b.yText.toDelta()).toEqual([
      { insert: 'hello', attributes: { bold: true } },
      { insert: ' world' }
    ])
    expect(hostTextRuns(b.host)[0].attributes.bold).toBe(true)
    expect(hostPlainText(b.host)).toBe('hello world')

    bindingB.destroy()
    b.editable.unload()
  })

  it('syncs bold formatting between peers', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    const bindingA = bindRichPeer(a)
    const bindingB = bindRichPeer(b)

    insertRichText(a.host, a.editable, 'hello world')
    simulateToggleBold(a.host, a.editable, 0, 5)

    syncDocToTarget(a.doc, b.doc)

    expect(a.yText.toDelta()).toEqual([
      { insert: 'hello', attributes: { bold: true } },
      { insert: ' world' }
    ])
    expect(hostTextRuns(b.host)[0].attributes.bold).toBe(true)
    expect(hostPlainText(b.host)).toBe('hello world')

    bindingA.destroy()
    bindingB.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('syncs italic and combined bold+italic', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    insertRichText(a.host, a.editable, 'abcdef')
    simulateToggleBold(a.host, a.editable, 0, 3)
    simulateToggleItalic(a.host, a.editable, 1, 4)

    syncDocToTarget(a.doc, b.doc)

    expect(hostPlainText(b.host)).toBe('abcdef')
    expect(a.yText.toDelta()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ insert: 'a', attributes: { bold: true } }),
        expect.objectContaining({
          insert: 'bc',
          attributes: { bold: true, italic: true }
        })
      ])
    )

    a.editable.unload()
    b.editable.unload()
  })

  it('syncs link set and remove', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    insertRichText(a.host, a.editable, 'link')
    simulateLink(a.host, a.editable, 0, 4, 'https://example.com')
    syncDocToTarget(a.doc, b.doc)
    expect(b.host.querySelector('a')?.getAttribute('href')).toBe('https://example.com')

    applyAndEmitOperations(a.editable, a.host, [
      {
        type: 'setTextAttributes',
        index: 0,
        length: 4,
        attributes: { link: null }
      }
    ])
    expect(a.host.querySelector('a')).toBeNull()
    expect(a.yText.toDelta()).toEqual([{ insert: 'link' }])
    syncDocToTarget(a.doc, b.doc)
    expect(b.host.querySelector('a')).toBeNull()

    a.editable.unload()
    b.editable.unload()
  })

  it('blocks unsafe URLs from remote Y.Text deltas', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    insertRichText(a.host, a.editable, 'xss')
    a.yText.format(0, 3, {
      link: { href: 'javascript:alert(1)' }
    })

    syncDocToTarget(a.doc, b.doc)
    expect(b.host.querySelector('a')).toBeNull()
    expect(hostPlainText(b.host)).toBe('xss')

    a.editable.unload()
    b.editable.unload()
  })

  it('handles partially overlapping formats after merge', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    insertRichText(a.host, a.editable, 'abcdef')
    syncDocToTarget(a.doc, b.doc)

    simulateToggleBold(a.host, a.editable, 0, 4)
    simulateToggleItalic(b.host, b.editable, 2, 6)

    mergeDocs(a.doc, b.doc)

    expect(getBlockOperationText(a.host)).toBe(getBlockOperationText(b.host))
    expect(a.yText.toString()).toBe(b.yText.toString())

    a.editable.unload()
    b.editable.unload()
  })

  it('concurrent typing and formatting converge text', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    insertRichText(a.host, a.editable, 'aaa')
    insertRichText(b.host, b.editable, 'bbb')
    simulateToggleBold(a.host, a.editable, 0, 3)

    mergeDocs(a.doc, b.doc)

    const merged = a.yText.toString()
    expect(b.yText.toString()).toBe(merged)
    expect(hostPlainText(a.host)).toBe(merged)
    expect(hostPlainText(b.host)).toBe(merged)

    a.editable.unload()
    b.editable.unload()
  })

  it('preserves local selection when remote format arrives', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    insertRichText(a.host, a.editable, 'hello world')
    syncDocToTarget(a.doc, b.doc)

    b.host.focus()
    setSelectionFromSnapshot(b.host, {
      anchor: 6,
      head: 11,
      direction: 'forward'
    })
    b.editable.dispatcher.selectionWatcher.syncSelection()

    simulateToggleBold(a.host, a.editable, 0, 5)
    syncDocToTarget(a.doc, b.doc)

    expect(hostTextRuns(b.host).some((run) => run.attributes.bold === true)).toBe(true)
    expect(hostPlainText(b.host)).toBe('hello world')
    const browserSelection = window.getSelection()
    expect(browserSelection && browserSelection.rangeCount > 0).toBe(true)

    a.editable.unload()
    b.editable.unload()
  })

  it('handles link change concurrent with text deletion', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    insertRichText(a.host, a.editable, 'link me')
    simulateLink(a.host, a.editable, 0, 4, 'https://example.com')
    syncDocToTarget(a.doc, b.doc)

    applyAndEmitOperations(a.editable, a.host, [{ type: 'deleteText', index: 4, length: 3 }])
    applyAndEmitOperations(b.editable, b.host, [{ type: 'deleteText', index: 4, length: 3 }])
    mergeDocs(a.doc, b.doc)

    expect(hostPlainText(a.host)).toBe(hostPlainText(b.host))

    a.editable.unload()
    b.editable.unload()
  })

  it('supports line breaks and emoji at format boundaries', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    bindRichPeer(a)
    bindRichPeer(b)

    applyAndEmitOperations(a.editable, a.host, [{ type: 'insertText', index: 0, text: 'a\n😀b' }])
    simulateToggleBold(a.host, a.editable, 0, 1)
    simulateToggleBold(a.host, a.editable, 4, 5)

    syncDocToTarget(a.doc, b.doc)

    expect(hostPlainText(b.host)).toBe('a\n😀b')
    const runs = hostTextRuns(b.host)
    expect(runs.some((run) => run.text.startsWith('a') && run.attributes.bold === true)).toBe(true)
    expect(runs.some((run) => run.text.endsWith('b') && run.attributes.bold === true)).toBe(true)

    a.editable.unload()
    b.editable.unload()
  })

  it('leaves plain-text hosts on character-only sync', function () {
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

    simulatePlainInsert(host, editable, 'plain only')
    expect(yText.toString()).toBe('plain only')

    expect(() => {
      editable.applyOperations(host, {
        source: 'api',
        operations: [
          {
            type: 'setTextAttributes',
            index: 0,
            length: 5,
            attributes: { bold: true }
          }
        ]
      })
    }).toThrow(OperationValidationError)

    binding.destroy()
    editable.unload()
  })

  it('roundtrips DOM through delta operations back to DOM', function () {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('data-plaintext', 'false')
    document.body.appendChild(host)

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [
        { type: 'insertText', index: 0, text: 'start bold both end' },
        {
          type: 'setTextAttributes',
          index: 6,
          length: 4,
          attributes: { bold: true }
        },
        {
          type: 'setTextAttributes',
          index: 11,
          length: 4,
          attributes: { bold: true, italic: true }
        }
      ]
    })

    expect(hostInnerHtml(host)).toContain('<strong>')
    expect(hostInnerHtml(host)).toContain('<em>')
    host.remove()
  })

  it('keeps bold in Y.Text when bolding after bidirectional typing syncs', function () {
    const a = createRichPeer('bold-after-typing')
    const b = createRichPeer('bold-after-typing')
    const bindingA = bindRichPeer(a)
    const bindingB = bindRichPeer(b)

    for (const chunk of ['das ', 'ist ', 'ein ', 'bold ', 'Text.']) {
      insertRichText(a.host, a.editable, chunk)
      expect(() => mergeDocs(a.doc, b.doc)).not.toThrow()
    }
    expect(a.yText.toString()).toBe('das ist ein bold Text.')

    const start = a.yText.toString().indexOf('bold')
    simulateToggleBold(a.host, a.editable, start, start + 4)

    expect(deltaHasBold(a.yText.toDelta())).toBe(true)

    mergeDocs(a.doc, b.doc)

    expect(deltaHasBold(b.yText.toDelta())).toBe(true)
    expect(hostTextRuns(b.host).some((run) => run.attributes.bold === true)).toBe(true)
    expect(hostPlainText(b.host)).toBe('das ist ein bold Text.')

    bindingA.destroy()
    bindingB.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('keeps Y.Text canonical when a formatted host also drifted in text', function () {
    const peer = createRichPeer('promote-guard')
    const binding = bindRichPeer(peer)

    insertRichText(peer.host, peer.editable, 'hello')
    peer.host.innerHTML = '<strong>hello world</strong>'

    const result = reconcileHostToCanonicalYText(peer.editable, peer.host, peer.yText, 'test', {
      richText: true,
      doc: document
    })

    expect(result.action).toBe('applied-y-to-host')
    expect(peer.yText.toString()).toBe('hello')
    expect(hostPlainText(peer.host)).toBe('hello')

    binding.destroy()
    peer.editable.unload()
  })
})

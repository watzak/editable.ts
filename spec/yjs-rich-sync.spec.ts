import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { setSelectionFromSnapshot } from '../src/operation-selection.js'
import { applyLiveOperationBatchToDom, OperationValidationError } from '../src/operation-apply.js'
import { EditableYjsBinding } from '../src/yjs/index.js'
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

describe('Yjs rich-text sync', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  function insertRichText(host: HTMLElement, editable: Editable, text: string): void {
    simulatePlainInsert(host, editable, text)
  }

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
        expect.objectContaining({ insert: 'bc', attributes: { bold: true, italic: true } })
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
      { type: 'setTextAttributes', index: 0, length: 4, attributes: { link: null } }
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
    setSelectionFromSnapshot(b.host, { anchor: 6, head: 11, direction: 'forward' })
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
        { type: 'setTextAttributes', index: 6, length: 4, attributes: { bold: true } },
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
})

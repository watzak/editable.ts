import * as Y from 'yjs'
import { vi } from 'vitest'
import { Editable } from '../src/core.js'
import { InlineFormatRegistry } from '../src/inline-format-codec.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { captureSelectionSnapshot } from '../src/operation-selection.js'
import {
  applyLocalDomFormatsToYText,
  applyYTextDeltaToHostDom,
  EditableYjsBinding,
  InitialSyncFormatConflictError,
  recoverHostFromCanonicalYText
} from '../src/yjs/index.js'
import {
  bindRichPeer,
  createRichPeer,
  hostPlainText,
  hostTextRuns,
  syncDocToTarget
} from './helpers/yjs-rich-harness.js'
import { createSelection, defaultInitialSyncPolicy } from './helpers/yjs-sync-harness.js'

function deltaSnapshot(yText: Y.Text): string {
  return JSON.stringify(yText.toDelta())
}

describe('Yjs reconcile flow separation', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('recovery does not modify Y.Text text or attributes', function () {
    const peer = createRichPeer('recovery-y-unchanged')
    const binding = bindRichPeer(peer)

    peer.doc.transact(() => {
      peer.yText.insert(0, 'hello world')
      peer.yText.format(0, 5, { bold: true })
    })

    peer.host.innerHTML = 'hello <strong>world</strong>'
    const before = deltaSnapshot(peer.yText)

    const result = recoverHostFromCanonicalYText(
      peer.editable,
      peer.host,
      peer.yText,
      'remote-test',
      {
        richText: true,
        doc: document
      }
    )

    expect(result.action).toBe('applied-y-to-host')
    expect(deltaSnapshot(peer.yText)).toBe(before)
    expect(hostTextRuns(peer.host)[0].attributes.bold).toBe(true)

    binding.destroy()
    peer.editable.unload()
  })

  it('does not restore remote-removed formatting from stale DOM markup', function () {
    const a = createRichPeer('shared')
    const b = createRichPeer('shared')
    const bindingA = bindRichPeer(a)
    const bindingB = bindRichPeer(b)

    a.doc.transact(() => {
      a.yText.insert(0, 'hello')
      a.yText.format(0, 5, { bold: true })
    })
    syncDocToTarget(a.doc, b.doc)

    expect(hostTextRuns(b.host)[0].attributes.bold).toBe(true)

    a.doc.transact(() => {
      a.yText.format(0, 5, { bold: null })
    }, 'remote-peer')
    syncDocToTarget(a.doc, b.doc)

    expect(JSON.stringify(b.yText.toDelta())).not.toContain('"bold":true')
    expect(hostTextRuns(b.host).every((run) => run.attributes.bold !== true)).toBe(true)

    bindingA.destroy()
    bindingB.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('applies local DOM format changes with targeted yText.format without replacing text', function () {
    const peer = createRichPeer('local-format')
    const binding = bindRichPeer(peer)

    peer.doc.transact(() => {
      peer.yText.insert(0, 'abcdef')
    })

    peer.host.innerHTML = 'abc<strong>def</strong>'
    const deleteSpy = vi.spyOn(peer.yText, 'delete')
    const insertSpy = vi.spyOn(peer.yText, 'insert')

    peer.doc.transact(() => {
      applyLocalDomFormatsToYText(peer.yText, peer.host, document)
    })

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
    expect(peer.yText.toDelta()).toEqual([
      { insert: 'abc' },
      { insert: 'def', attributes: { bold: true } }
    ])

    deleteSpy.mockRestore()
    insertSpy.mockRestore()
    binding.destroy()
    peer.editable.unload()
  })

  it('preserves cursor offsets when adopting local DOM formatting', function () {
    const peer = createRichPeer('cursor-format')
    const binding = bindRichPeer(peer)

    peer.doc.transact(() => {
      peer.yText.insert(0, 'hello')
    })

    peer.host.innerHTML = '<strong>hello</strong>'
    peer.host.focus()
    createSelection(peer.host, 3, 3)
    peer.editable.dispatcher.selectionWatcher.syncSelection()

    binding.syncRichHostRunsToYText()

    const snapshot = captureSelectionSnapshot(
      peer.host,
      peer.editable.dispatcher.selectionWatcher.getFreshSelection()
    )
    expect(snapshot?.anchor).toBe(3)
    expect(snapshot?.head).toBe(3)

    binding.destroy()
    peer.editable.unload()
  })

  it('treats different diagnostic strings identically during recovery', function () {
    const peer = createRichPeer('diagnostic-parity')
    const binding = bindRichPeer(peer)

    peer.doc.transact(() => {
      peer.yText.insert(0, 'canonical')
    })
    peer.host.textContent = 'stale'

    const first = recoverHostFromCanonicalYText(
      peer.editable,
      peer.host,
      peer.yText,
      'remote-delta-target-mismatch',
      {
        richText: true,
        doc: document
      }
    )
    peer.host.textContent = 'stale again'
    const second = recoverHostFromCanonicalYText(
      peer.editable,
      peer.host,
      peer.yText,
      'rich-format-recovery',
      { richText: true, doc: document }
    )

    expect(first.action).toBe(second.action)
    expect(hostPlainText(peer.host)).toBe('canonical')

    binding.destroy()
    peer.editable.unload()
  })

  it('uses custom codecs for initial import and recovery', function () {
    const registry = new InlineFormatRegistry()
    registry.register({
      yjsKey: 'highlight',
      domTags: ['mark'],
      readDomElement(element) {
        return element.nodeName.toLowerCase() === 'mark' ? true : undefined
      },
      createDomWrapper(doc) {
        return doc.createElement('mark')
      },
      sanitizeYjsValue(value) {
        return value === true ? true : null
      }
    })

    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('data-plaintext', 'false')
    document.body.appendChild(host)

    const editable = new Editable({ defaultBehavior: true })
    editable.add(host, { formatRegistry: registry })

    const doc = new Y.Doc()
    const yText = doc.getText('custom-codec')

    host.innerHTML = 'hi <mark>there</mark>'
    doc.transact(() => {
      yText.insert(0, 'hi there')
      applyLocalDomFormatsToYText(yText, host, document, registry)
    })
    expect(yText.toDelta()).toEqual([
      { insert: 'hi ' },
      { insert: 'there', attributes: { highlight: true } }
    ])

    host.textContent = 'hi there'
    applyYTextDeltaToHostDom(host, yText, document, registry)
    expect(host.querySelector('mark')?.textContent).toBe('there')

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: {
        ...defaultInitialSyncPolicy,
        bothIdenticalFormatsDiffer: 'copy-y-to-host'
      }
    })
    expect(host.querySelector('mark')?.textContent).toBe('there')

    binding.destroy()
    editable.unload()
  })

  it('resolves initial sync with identical plain text but different formats explicitly', function () {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('data-plaintext', 'false')
    document.body.appendChild(host)
    host.innerHTML = 'same <strong>text</strong>'

    const editable = new Editable({ defaultBehavior: true })
    editable.add(host)

    const doc = new Y.Doc()
    const yText = doc.getText('format-conflict')
    yText.insert(0, 'same text')
    yText.format(0, 4, { italic: true })

    expect(
      () =>
        new EditableYjsBinding({
          editable,
          host,
          yText,
          initialSync: defaultInitialSyncPolicy
        })
    ).toThrow(InitialSyncFormatConflictError)

    yText.format(0, 4, { italic: null })
    host.innerHTML = 'same <strong>text</strong>'
    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: {
        ...defaultInitialSyncPolicy,
        bothIdenticalFormatsDiffer: 'copy-host-to-y'
      }
    })

    expect(yText.toDelta()).toEqual([
      { insert: 'same ' },
      { insert: 'text', attributes: { bold: true } }
    ])
    expect(getBlockOperationText(host)).toBe('same text')

    binding.destroy()
    editable.unload()
  })
})

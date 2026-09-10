import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { EditableYjsBinding } from '../src/yjs/editable-yjs-binding.js'
import {
  beginSyntheticComposition,
  endSyntheticComposition,
  hostPlainText
} from './helpers/yjs-composition-harness.js'
import {
  bindRichPeer,
  createRichPeer,
  hostTextRuns,
  syncDocToTarget
} from './helpers/yjs-rich-harness.js'
import {
  createPlainHost,
  defaultInitialSyncPolicy,
  simulateInsertText,
  syncDocToTarget as syncPlain
} from './helpers/yjs-sync-harness.js'

const REMOTE = 'remote-peer'

function applyRemote(doc: Y.Doc, yText: Y.Text, fn: () => void): void {
  doc.transact(fn, REMOTE)
}

describe('Yjs composition and pending-input remote sync (synthetic IME)', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  function createPlainPeer(name: string) {
    const doc = new Y.Doc()
    const yText = doc.getText(name)
    const host = createPlainHost()
    const editable = new Editable({ defaultBehavior: true })
    editable.add(host)
    return { doc, yText, host, editable }
  }

  function bindPlain(peer: ReturnType<typeof createPlainPeer>) {
    return new EditableYjsBinding({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      initialSync: defaultInitialSyncPolicy
    })
  }

  it('defers host recovery during composition when remote text arrives', function () {
    const a = createPlainPeer('defer-comp')
    const b = createPlainPeer('defer-comp')
    bindPlain(a)
    const bindingB = bindPlain(b)

    simulateInsertText(a.host, a.editable, 'base')
    syncPlain(a.doc, b.doc)
    expect(hostPlainText(b.host)).toBe('base')

    beginSyntheticComposition(b.host, b.editable, 4)
    expect(b.editable.dispatcher.operationCapture.hasComposition(b.host)).toBe(true)

    applyRemote(a.doc, a.yText, () => a.yText.insert(0, 'R'))
    syncPlain(a.doc, b.doc)

    expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('deferred')
    expect(bindingB.getRemoteSyncDiagnostics()?.reason).toBe('remote-during-composition')
    expect(b.yText.toString()).toBe('Rbase')
    expect(hostPlainText(b.host)).toBe('base')

    endSyntheticComposition(b.host, b.editable, 'base語')
    expect(b.yText.toString()).toBe('Rbase語')
    expect(hostPlainText(b.host)).toBe('Rbase語')

    a.editable.unload()
    b.editable.unload()
  })

  it('merges local composition with remote insert before the caret using relative positions', function () {
    const a = createPlainPeer('rel-pos')
    const b = createPlainPeer('rel-pos')
    bindPlain(a)
    const bindingB = bindPlain(b)

    simulateInsertText(a.host, a.editable, 'hello')
    syncPlain(a.doc, b.doc)

    beginSyntheticComposition(b.host, b.editable, 5)
    applyRemote(a.doc, a.yText, () => a.yText.insert(0, '!'))
    syncPlain(a.doc, b.doc)
    expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('deferred')

    endSyntheticComposition(b.host, b.editable, 'helloX')
    expect(b.yText.toString()).toBe('!helloX')
    expect(hostPlainText(b.host)).toBe('!helloX')

    a.editable.unload()
    b.editable.unload()
  })

  it('applies remote delete overlapping composition span after commit', function () {
    const a = createPlainPeer('overlap-del')
    const b = createPlainPeer('overlap-del')
    bindPlain(a)
    const bindingB = bindPlain(b)

    simulateInsertText(a.host, a.editable, 'abcdef')
    syncPlain(a.doc, b.doc)

    beginSyntheticComposition(b.host, b.editable, 3)
    applyRemote(a.doc, a.yText, () => a.yText.delete(2, 2))
    syncPlain(a.doc, b.doc)
    expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('deferred')

    endSyntheticComposition(b.host, b.editable, 'abZZef')
    expect(b.yText.toString()).toContain('ZZ')
    expect(hostPlainText(b.host)).toBe(b.yText.toString())

    a.editable.unload()
    b.editable.unload()
  })

  it('converges after multiple remote updates during one composition', function () {
    const a = createPlainPeer('multi-remote')
    const b = createPlainPeer('multi-remote')
    bindPlain(a)
    const bindingB = bindPlain(b)

    simulateInsertText(a.host, a.editable, 'start')
    syncPlain(a.doc, b.doc)

    beginSyntheticComposition(b.host, b.editable, 5)
    applyRemote(a.doc, a.yText, () => a.yText.insert(0, '1'))
    syncPlain(a.doc, b.doc)
    applyRemote(a.doc, a.yText, () => a.yText.insert(a.yText.length, '2'))
    syncPlain(a.doc, b.doc)
    expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('deferred')

    endSyntheticComposition(b.host, b.editable, 'startEND')
    expect(b.yText.toString()).toBe('1startEND2')
    expect(hostPlainText(b.host)).toBe('1startEND2')

    a.editable.unload()
    b.editable.unload()
  })

  it('does not duplicate local operations when input follows compositionend', function () {
    const peer = createPlainPeer('no-dup')
    const binding = bindPlain(peer)

    simulateInsertText(peer.host, peer.editable, 'abc')
    beginSyntheticComposition(peer.host, peer.editable, 3)
    endSyntheticComposition(peer.host, peer.editable, 'abcX')

    const lengthAfterComposition = peer.yText.length
    peer.host.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'Y',
        bubbles: true,
        cancelable: true
      })
    )
    peer.host.textContent = `${hostPlainText(peer.host)}Y`
    peer.host.dispatchEvent(
      new InputEvent('input', { inputType: 'insertText', data: 'Y', bubbles: true })
    )

    expect(peer.yText.length).toBe(lengthAfterComposition + 1)
    expect(peer.yText.toString()).toBe('abcXY')

    binding.destroy()
    peer.editable.unload()
  })

  it('cleans up deferred recovery state on destroy during composition', function () {
    const a = createPlainPeer('destroy-comp')
    const b = createPlainPeer('destroy-comp')
    bindPlain(a)
    const bindingB = bindPlain(b)

    simulateInsertText(a.host, a.editable, 'live')
    syncPlain(a.doc, b.doc)
    beginSyntheticComposition(b.host, b.editable, 4)

    applyRemote(a.doc, a.yText, () => a.yText.insert(0, 'Z'))
    syncPlain(a.doc, b.doc)
    expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('deferred')

    expect(() => bindingB.destroy()).not.toThrow()
    a.editable.unload()
    b.editable.unload()
  })

  describe('rich text (synthetic composition)', function () {
    it('defers DOM rebuild and restores remote formatting after composition', function () {
      const a = createRichPeer('rich-comp')
      const b = createRichPeer('rich-comp')
      bindRichPeer(a)
      const bindingB = bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'hello')
      syncDocToTarget(a.doc, b.doc)

      beginSyntheticComposition(b.host, b.editable, 5)
      applyRemote(a.doc, a.yText, () => a.yText.format(0, 5, { bold: true }))
      syncDocToTarget(a.doc, b.doc)
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('deferred')
      expect(hostTextRuns(b.host).every((run) => run.attributes.bold !== true)).toBe(true)

      endSyntheticComposition(b.host, b.editable, 'hello!')
      expect(hostTextRuns(b.host).some((run) => run.attributes.bold === true)).toBe(true)
      expect(getBlockOperationText(b.host)).toBe('hello!')

      a.editable.unload()
      b.editable.unload()
    })
  })
})

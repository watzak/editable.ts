import * as Y from 'yjs'
import { vi } from 'vitest'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { setSelectionFromSnapshot } from '../src/operation-selection.js'
import { transformSelectionThroughBatch } from '../src/operation-selection-transform.js'
import { domPointToOperationOffset, domRangeToOperationOffsets } from '../src/operation-offset.js'
import {
  EditableYjsBinding,
  hostRichTextMatchesYText,
  isFullHostReplaceBatch,
  buildCopyYTextDeltaToHostOperations
} from '../src/yjs/index.js'
import {
  bindRichPeer,
  createRichPeer,
  hostPlainText,
  hostTextRuns,
  mergeDocs,
  simulateToggleBold,
  simulateToggleItalic,
  syncDocToTarget
} from './helpers/yjs-rich-harness.js'
import {
  createPlainHost,
  defaultInitialSyncPolicy,
  simulateInsertText,
  syncDocToTarget as syncPlain
} from './helpers/yjs-sync-harness.js'

const REMOTE = 'remote-peer'

function applyRemoteYText(doc: Y.Doc, yText: Y.Text, fn: () => void): void {
  doc.transact(fn, REMOTE)
}

function selectionOffsets(host: HTMLElement): { anchor: number; head: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const offsets = domRangeToOperationOffsets(host, range)
  if (!offsets) return null
  const anchor = domPointToOperationOffset(host, sel.anchorNode!, sel.anchorOffset)
  const head = domPointToOperationOffset(host, sel.focusNode!, sel.focusOffset)
  if (anchor === undefined || head === undefined) return null
  return { anchor, head }
}

describe('Yjs incremental remote sync', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  describe('plain text', function () {
    function createPlainPeer(name: string) {
      const doc = new Y.Doc()
      const yText = doc.getText(name)
      const host = createPlainHost()
      const editable = new Editable({ defaultBehavior: false })
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

    it('applies remote insert at start incrementally', function () {
      const a = createPlainPeer('inc-start')
      const b = createPlainPeer('inc-start')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'world')
      syncPlain(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(0, 'hello '))
      syncPlain(a.doc, b.doc)

      expect(getBlockOperationText(b.host)).toBe('hello world')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      b.editable.unload()
      a.editable.unload()
    })

    it('applies remote insert in the middle incrementally', function () {
      const a = createPlainPeer('inc-mid')
      const b = createPlainPeer('inc-mid')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'heo')
      syncPlain(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(2, 'll'))
      syncPlain(a.doc, b.doc)

      expect(getBlockOperationText(b.host)).toBe('hello')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('applies remote insert at end incrementally', function () {
      const a = createPlainPeer('inc-end')
      const b = createPlainPeer('inc-end')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'hi')
      syncPlain(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(2, '!'))
      syncPlain(a.doc, b.doc)

      expect(getBlockOperationText(b.host)).toBe('hi!')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('applies remote delete incrementally', function () {
      const a = createPlainPeer('inc-del')
      const b = createPlainPeer('inc-del')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'abcdef')
      syncPlain(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.delete(2, 3))
      syncPlain(a.doc, b.doc)

      expect(getBlockOperationText(b.host)).toBe('abf')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('applies remote replacement incrementally', function () {
      const a = createPlainPeer('inc-repl')
      const b = createPlainPeer('inc-repl')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'old text')
      syncPlain(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => {
        a.yText.delete(0, 3)
        a.yText.insert(0, 'new')
      })
      syncPlain(a.doc, b.doc)

      expect(getBlockOperationText(b.host)).toBe('new text')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('handles emoji and combining marks incrementally', function () {
      const a = createPlainPeer('inc-emoji')
      const b = createPlainPeer('inc-emoji')
      bindPlain(a)
      const bindingB = bindPlain(b)

      const seed = 'a😀e\u0301'
      simulateInsertText(a.host, a.editable, seed)
      syncPlain(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(3, 'X'))
      syncPlain(a.doc, b.doc)

      expect(getBlockOperationText(b.host)).toBe(a.yText.toString())
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('handles line breaks incrementally', function () {
      const a = createPlainPeer('inc-br')
      const b = createPlainPeer('inc-br')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'a\nb')
      syncPlain(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(2, '\nc'))
      syncPlain(a.doc, b.doc)

      expect(getBlockOperationText(b.host)).toBe('a\n\ncb')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('transforms selection after remote insert', function () {
      const a = createPlainPeer('inc-sel')
      const b = createPlainPeer('inc-sel')
      bindPlain(a)
      bindPlain(b)

      simulateInsertText(a.host, a.editable, 'hello')
      syncPlain(a.doc, b.doc)

      b.host.focus()
      setSelectionFromSnapshot(b.host, { anchor: 5, head: 5, direction: 'none' })
      b.editable.dispatcher.selectionWatcher.syncSelection()

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(0, 'X'))
      syncPlain(a.doc, b.doc)

      const offsets = selectionOffsets(b.host)
      expect(offsets).toEqual({ anchor: 6, head: 6 })
      a.editable.unload()
      b.editable.unload()
    })

    it('transforms backward selection after remote insert before anchor', function () {
      const snapshot = { anchor: 6, head: 2, direction: 'backward' as const }
      const transformed = transformSelectionThroughBatch(snapshot, [
        { type: 'insertText', index: 0, text: 'Z' }
      ])
      expect(transformed.anchor).toBe(7)
      expect(transformed.head).toBe(3)
      expect(transformed.direction).toBe('backward')
    })

    it('reconciles when host DOM was manipulated', function () {
      const peer = createPlainPeer('inc-drift')
      const binding = bindPlain(peer)
      const reconcileSpy = vi.spyOn(binding, 'reconcile')

      peer.yText.insert(0, 'canonical')
      peer.host.textContent = 'drifted'

      applyRemoteYText(peer.doc, peer.yText, () => peer.yText.insert(9, '!'))
      expect(reconcileSpy).toHaveBeenCalled()
      expect(binding.getRemoteSyncDiagnostics()?.path).toBe('reconcile')
      expect(getBlockOperationText(peer.host)).toBe('canonical!')

      reconcileSpy.mockRestore()
      peer.editable.unload()
    })

    it('does not full-rebuild in the normal incremental path', function () {
      const a = createPlainPeer('inc-norebuild')
      const b = createPlainPeer('inc-norebuild')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'baseline')
      syncPlain(a.doc, b.doc)

      const hostLen = getBlockOperationText(b.host).length
      const rebuildSpy = vi.spyOn(
        { buildCopyYTextDeltaToHostOperations },
        'buildCopyYTextDeltaToHostOperations'
      )

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(hostLen, '++'))
      syncPlain(a.doc, b.doc)

      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      expect(
        isFullHostReplaceBatch([{ type: 'insertText', index: hostLen, text: '++' }], hostLen)
      ).toBe(false)

      rebuildSpy.mockRestore()
      a.editable.unload()
      b.editable.unload()
    })

    it('applies many small remote updates incrementally', function () {
      const a = createPlainPeer('inc-many')
      const b = createPlainPeer('inc-many')
      bindPlain(a)
      const bindingB = bindPlain(b)

      for (let i = 0; i < 40; i += 1) {
        applyRemoteYText(a.doc, a.yText, () => a.yText.insert(a.yText.length, String(i % 10)))
        syncPlain(a.doc, b.doc)
        expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      }

      expect(getBlockOperationText(b.host)).toBe(a.yText.toString())
      a.editable.unload()
      b.editable.unload()
    })

    it('reconciles during composition', function () {
      const a = createPlainPeer('inc-comp')
      const b = createPlainPeer('inc-comp')
      bindPlain(a)
      const bindingB = bindPlain(b)

      simulateInsertText(a.host, a.editable, 'base')
      syncPlain(a.doc, b.doc)

      b.host.focus()
      setSelectionFromSnapshot(b.host, { anchor: 4, head: 4, direction: 'none' })
      b.editable.dispatcher.selectionWatcher.syncSelection()
      b.editable.dispatcher.operationCapture.beginComposition(
        b.host,
        b.editable.dispatcher.selectionWatcher
      )
      expect(b.editable.dispatcher.operationCapture.hasComposition(b.host)).toBe(true)
      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(4, 'X'))
      syncPlain(a.doc, b.doc)

      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('reconcile')
      expect(bindingB.getRemoteSyncDiagnostics()?.reason).toBe('remote-during-composition')
      b.editable.dispatcher.operationCapture.clearComposition(b.host)
      a.editable.unload()
      b.editable.unload()
    })

    it('converges concurrent local and remote typing via merge', function () {
      const a = createPlainPeer('inc-concurrent')
      const b = createPlainPeer('inc-concurrent')
      bindPlain(a)
      bindPlain(b)

      simulateInsertText(a.host, a.editable, 'aaa')
      simulateInsertText(b.host, b.editable, 'bbb')
      mergeDocs(a.doc, b.doc)

      expect(getBlockOperationText(a.host)).toBe(a.yText.toString())
      expect(getBlockOperationText(b.host)).toBe(b.yText.toString())
      a.editable.unload()
      b.editable.unload()
    })
  })

  describe('rich text', function () {
    it('applies remote insert without full host replace', function () {
      const a = createRichPeer('rich-inc')
      const b = createRichPeer('rich-inc')
      bindRichPeer(a)
      const bindingB = bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'hello world')
      syncDocToTarget(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(5, ' brave'))
      syncDocToTarget(a.doc, b.doc)

      expect(hostPlainText(b.host)).toBe('hello brave world')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('applies remote delete across formatted runs incrementally', function () {
      const a = createRichPeer('rich-del')
      const b = createRichPeer('rich-del')
      bindRichPeer(a)
      const bindingB = bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'aaabbb')
      simulateToggleBold(a.host, a.editable, 0, 3)
      syncDocToTarget(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.delete(2, 3))
      syncDocToTarget(a.doc, b.doc)

      expect(hostPlainText(b.host)).toBe('aab')
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('syncs nested bold/italic after remote attribute change', function () {
      const a = createRichPeer('rich-nested')
      const b = createRichPeer('rich-nested')
      bindRichPeer(a)
      const bindingB = bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'format me')
      syncDocToTarget(a.doc, b.doc)

      simulateToggleBold(a.host, a.editable, 0, 6)
      simulateToggleItalic(a.host, a.editable, 7, 9)
      syncDocToTarget(a.doc, b.doc)

      expect(hostRichTextMatchesYText(b.host, b.yText, document)).toBe(true)
      expect(['incremental', 'reconcile']).toContain(bindingB.getRemoteSyncDiagnostics()?.path)
      expect(hostTextRuns(b.host).some((r) => r.attributes.bold === true)).toBe(true)
      expect(hostTextRuns(b.host).some((r) => r.attributes.italic === true)).toBe(true)
      a.editable.unload()
      b.editable.unload()
    })

    it('applies remote text+attribute delta in one transaction incrementally', function () {
      const a = createRichPeer('rich-mixed')
      const b = createRichPeer('rich-mixed')
      bindRichPeer(a)
      const bindingB = bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'word')
      syncDocToTarget(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => {
        a.yText.insert(0, 'bold ', { bold: true })
      })
      syncDocToTarget(a.doc, b.doc)

      expect(hostPlainText(b.host)).toBe('bold word')
      expect(hostTextRuns(b.host)[0]?.attributes.bold).toBe(true)
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('preserves selection when remote format arrives incrementally', function () {
      const a = createRichPeer('rich-sel')
      const b = createRichPeer('rich-sel')
      bindRichPeer(a)
      bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'hello world')
      syncDocToTarget(a.doc, b.doc)

      b.host.focus()
      setSelectionFromSnapshot(b.host, { anchor: 6, head: 11, direction: 'forward' })
      b.editable.dispatcher.selectionWatcher.syncSelection()

      const selectionBefore = { anchor: 6, head: 11, direction: 'forward' as const }
      simulateToggleBold(a.host, a.editable, 0, 5)
      syncDocToTarget(a.doc, b.doc)

      const transformed = transformSelectionThroughBatch(selectionBefore, [
        { type: 'setTextAttributes', index: 0, length: 5, attributes: { bold: true } }
      ])
      expect(transformed.anchor).toBe(6)
      expect(transformed.head).toBe(11)
      a.editable.unload()
      b.editable.unload()
    })

    it('reconciles rich host when DOM text was tampered', function () {
      const peer = createRichPeer('rich-drift')
      const binding = bindRichPeer(peer)
      const reconcileSpy = vi.spyOn(binding, 'reconcile')

      simulateInsertText(peer.host, peer.editable, 'hello')
      peer.host.innerHTML = '<strong>wrong</strong>'

      applyRemoteYText(peer.doc, peer.yText, () => peer.yText.insert(5, '!'))
      expect(reconcileSpy).toHaveBeenCalled()
      expect(binding.getRemoteSyncDiagnostics()?.path).toBe('reconcile')

      reconcileSpy.mockRestore()
      peer.editable.unload()
    })

    it('handles emoji at format boundaries incrementally', function () {
      const a = createRichPeer('rich-emoji')
      const b = createRichPeer('rich-emoji')
      bindRichPeer(a)
      const bindingB = bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'a😀b')
      simulateToggleBold(a.host, a.editable, 0, 1)
      syncDocToTarget(a.doc, b.doc)

      applyRemoteYText(a.doc, a.yText, () => a.yText.insert(3, 'X'))
      syncDocToTarget(a.doc, b.doc)

      expect(hostPlainText(b.host)).toBe(a.yText.toString())
      expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      a.editable.unload()
      b.editable.unload()
    })

    it('applies many small rich remote updates without full rebuild', function () {
      const a = createRichPeer('rich-many')
      const b = createRichPeer('rich-many')
      bindRichPeer(a)
      const bindingB = bindRichPeer(b)

      simulateInsertText(a.host, a.editable, 'start')
      syncDocToTarget(a.doc, b.doc)

      for (let i = 0; i < 25; i += 1) {
        applyRemoteYText(a.doc, a.yText, () =>
          a.yText.insert(a.yText.length, i % 2 === 0 ? 'a' : 'b')
        )
        syncDocToTarget(a.doc, b.doc)
        expect(bindingB.getRemoteSyncDiagnostics()?.path).toBe('incremental')
      }

      expect(hostPlainText(b.host)).toBe(a.yText.toString())
      expect(hostRichTextMatchesYText(b.host, b.yText, document)).toBe(true)
      a.editable.unload()
      b.editable.unload()
    })
  })
})

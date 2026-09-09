import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { EditableYjsBinding } from '../src/yjs/index.js'
import {
  createPlainHost,
  defaultInitialSyncPolicy,
  mergeDocs,
  simulateComposition,
  simulateInsertText,
  simulateReplaceSelection,
  syncDocToTarget
} from './helpers/yjs-sync-harness.js'

describe('Yjs plain-text sync', function () {
  function createPeer(name: string) {
    const doc = new Y.Doc()
    const yText = doc.getText(name)
    const host = createPlainHost()
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)
    host.focus()
    return { doc, yText, host, editable }
  }

  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('syncs A typing to B through manual Y.applyUpdate', function () {
    const a = createPeer('shared')
    const b = createPeer('shared')
    const bindingA = new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })
    const bindingB = new EditableYjsBinding({
      editable: b.editable,
      host: b.host,
      yText: b.yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(a.host, a.editable, 'hello')
    expect(a.yText.toString()).toBe('hello')

    syncDocToTarget(a.doc, b.doc)
    expect(b.yText.toString()).toBe('hello')
    expect(getBlockOperationText(b.host)).toBe('hello')

    bindingA.destroy()
    bindingB.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('merges offline edits from both peers', function () {
    const a = createPeer('shared')
    const b = createPeer('shared')
    const bindingA = new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })
    const bindingB = new EditableYjsBinding({
      editable: b.editable,
      host: b.host,
      yText: b.yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(a.host, a.editable, 'aaa')
    simulateInsertText(b.host, b.editable, 'bbb')
    mergeDocs(a.doc, b.doc)

    const merged = a.yText.toString()
    expect(b.yText.toString()).toBe(merged)
    expect(getBlockOperationText(a.host)).toBe(merged)
    expect(getBlockOperationText(b.host)).toBe(merged)

    bindingA.destroy()
    bindingB.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('converges concurrent inserts at the same position', function () {
    const a = createPeer('shared')
    const b = createPeer('shared')
    new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })
    new EditableYjsBinding({
      editable: b.editable,
      host: b.host,
      yText: b.yText,
      initialSync: defaultInitialSyncPolicy
    })

    a.doc.transact(() => a.yText.insert(0, 'A'), 'remote-a')
    b.doc.transact(() => b.yText.insert(0, 'B'), 'remote-b')
    mergeDocs(a.doc, b.doc)

    expect(a.yText.toString()).toBe(b.yText.toString())
    expect(getBlockOperationText(a.host)).toBe(a.yText.toString())
    expect(getBlockOperationText(b.host)).toBe(b.yText.toString())

    a.editable.unload()
    b.editable.unload()
  })

  it('converges delete against concurrent insert', function () {
    const a = createPeer('shared')
    const b = createPeer('shared')
    a.yText.insert(0, 'hello')
    b.yText.insert(0, 'hello')
    new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })
    new EditableYjsBinding({
      editable: b.editable,
      host: b.host,
      yText: b.yText,
      initialSync: defaultInitialSyncPolicy
    })

    a.doc.transact(() => a.yText.delete(1, 3), 'remote-a')
    b.doc.transact(() => b.yText.insert(2, 'X'), 'remote-b')
    mergeDocs(a.doc, b.doc)

    expect(a.yText.toString()).toBe(b.yText.toString())
    expect(getBlockOperationText(a.host)).toBe(a.yText.toString())

    a.editable.unload()
    b.editable.unload()
  })

  it('syncs selection replacement', function () {
    const a = createPeer('shared')
    const b = createPeer('shared')
    a.host.textContent = 'hello'
    a.yText.insert(0, 'hello')

    new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })
    new EditableYjsBinding({
      editable: b.editable,
      host: b.host,
      yText: b.yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateReplaceSelection(a.host, a.editable, 0, 5, 'hi')
    syncDocToTarget(a.doc, b.doc)

    expect(b.yText.toString()).toBe('hi')
    expect(getBlockOperationText(b.host)).toBe('hi')

    a.editable.unload()
    b.editable.unload()
  })

  it('syncs line breaks', function () {
    const a = createPeer('shared')
    const b = createPeer('shared')
    new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })
    new EditableYjsBinding({
      editable: b.editable,
      host: b.host,
      yText: b.yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(a.host, a.editable, 'a\nb')
    syncDocToTarget(a.doc, b.doc)

    expect(b.yText.toString()).toBe('a\nb')
    expect(getBlockOperationText(b.host)).toBe('a\nb')

    a.editable.unload()
    b.editable.unload()
  })

  it('syncs emoji and combining marks', function () {
    const a = createPeer('shared')
    const b = createPeer('shared')
    new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })
    new EditableYjsBinding({
      editable: b.editable,
      host: b.host,
      yText: b.yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(a.host, a.editable, 'e\u0301😀')
    syncDocToTarget(a.doc, b.doc)

    expect(b.yText.toString()).toBe('e\u0301😀')
    expect(getBlockOperationText(b.host)).toBe('e\u0301😀')

    a.editable.unload()
    b.editable.unload()
  })

  it('applies composition as one Y transaction', function () {
    const a = createPeer('shared')
    a.host.textContent = 'ni'
    new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })

    let transactionCount = 0
    a.doc.on('afterTransaction', () => {
      transactionCount += 1
    })

    simulateComposition(a.host, a.editable, 'nihongo')
    expect(a.yText.toString()).toBe('nihongo')
    expect(transactionCount).toBe(1)

    a.editable.unload()
  })

  it('does not echo local edits into a Yjs loop', function () {
    const a = createPeer('shared')
    new EditableYjsBinding({
      editable: a.editable,
      host: a.host,
      yText: a.yText,
      initialSync: defaultInitialSyncPolicy
    })

    let yTransactions = 0
    a.doc.on('afterTransaction', (transaction: Y.Transaction) => {
      if (transaction.origin && typeof transaction.origin === 'object') yTransactions += 1
    })

    simulateInsertText(a.host, a.editable, 'loop')
    expect(a.yText.toString()).toBe('loop')
    expect(yTransactions).toBe(1)

    a.editable.unload()
  })

  it('supports multiple hosts bound to the same Y.Text', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('shared')
    const hostA = createPlainHost()
    const hostB = createPlainHost()
    const editableA = new Editable({ defaultBehavior: false })
    const editableB = new Editable({ defaultBehavior: false })
    editableA.add(hostA)
    editableB.add(hostB)

    const bindingA = new EditableYjsBinding({
      editable: editableA,
      host: hostA,
      yText,
      initialSync: defaultInitialSyncPolicy
    })
    const bindingB = new EditableYjsBinding({
      editable: editableB,
      host: hostB,
      yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(hostA, editableA, 'shared')
    expect(yText.toString()).toBe('shared')
    expect(getBlockOperationText(hostB)).toBe('shared')

    bindingA.destroy()
    bindingB.destroy()
    editableA.unload()
    editableB.unload()
  })

  it('destroy stops sync and allows re-mount', function () {
    const peer = createPeer('shared')
    const binding = new EditableYjsBinding({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(peer.host, peer.editable, 'one')
    binding.destroy()

    simulateInsertText(peer.host, peer.editable, 'two')
    expect(peer.yText.toString()).toBe('one')

    peer.host.textContent = 'one'
    new EditableYjsBinding({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(peer.host, peer.editable, '!')
    expect(peer.yText.toString()).toBe('one!')

    peer.editable.unload()
  })

  it('reconciles host drift to canonical Y.Text', function () {
    const peer = createPeer('shared')
    peer.yText.insert(0, 'canonical')
    const binding = new EditableYjsBinding({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      initialSync: defaultInitialSyncPolicy
    })

    peer.host.textContent = 'drift'
    const result = binding.reconcile('test drift')
    expect(result.action).toBe('applied-y-to-host')
    expect(getBlockOperationText(peer.host)).toBe('canonical')

    binding.destroy()
    peer.editable.unload()
  })
})

describe('Yjs seeded convergence', function () {
  function mulberry32(seed: number) {
    return function () {
      let t = (seed += 0x6d2b79f5)
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('converges random insert/delete/replace operations', function () {
    const seed = 42
    const random = mulberry32(seed)
    const a = new Y.Doc()
    const b = new Y.Doc()
    const yA = a.getText('content')
    const yB = b.getText('content')
    const hostA = createPlainHost()
    const hostB = createPlainHost()
    const editableA = new Editable({ defaultBehavior: false })
    const editableB = new Editable({ defaultBehavior: false })
    editableA.add(hostA)
    editableB.add(hostB)

    new EditableYjsBinding({
      editable: editableA,
      host: hostA,
      yText: yA,
      initialSync: defaultInitialSyncPolicy
    })
    new EditableYjsBinding({
      editable: editableB,
      host: hostB,
      yText: yB,
      initialSync: defaultInitialSyncPolicy
    })

    const alphabet = 'abc😀e\u0301\n'
    const remoteOrigin = 'seeded-remote'

    for (let i = 0; i < 80; i += 1) {
      const side = random() < 0.5 ? 'a' : 'b'
      const doc = side === 'a' ? a : b
      const yText = side === 'a' ? yA : yB
      const length = yText.length
      const op = random()

      doc.transact(() => {
        if (op < 0.4) {
          const index = length === 0 ? 0 : Math.floor(random() * (length + 1))
          const char = alphabet[Math.floor(random() * alphabet.length)]!
          yText.insert(index, char)
        } else if (op < 0.7 && length > 0) {
          const index = Math.floor(random() * length)
          const deleteLen = Math.min(length - index, 1 + Math.floor(random() * 3))
          yText.delete(index, deleteLen)
        } else if (length > 0) {
          const index = Math.floor(random() * length)
          const deleteLen = Math.min(length - index, 1 + Math.floor(random() * 2))
          yText.delete(index, deleteLen)
          yText.insert(index, alphabet[Math.floor(random() * alphabet.length)]!)
        }
      }, remoteOrigin)

      if (random() < 0.35) mergeDocs(a, b)
    }

    mergeDocs(a, b)

    expect(yA.toString()).toBe(yB.toString())
    expect(getBlockOperationText(hostA)).toBe(yA.toString())
    expect(getBlockOperationText(hostB)).toBe(yB.toString())

    editableA.unload()
    editableB.unload()
    hostA.remove()
    hostB.remove()
  })
})

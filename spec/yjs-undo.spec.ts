import * as Y from 'yjs'
import { vi } from 'vitest'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { EditableYjsBinding } from '../src/yjs/index.js'
import { shouldStopCapturing } from '../src/yjs/binding-undo.js'
import {
  createPlainHost,
  defaultInitialSyncPolicy,
  simulateComposition,
  simulateInsertText,
  syncDocToTarget
} from './helpers/yjs-sync-harness.js'
import {
  createRichPeer,
  simulateInsertText as simulateRichInsert,
  simulateToggleBold
} from './helpers/yjs-rich-harness.js'

describe('Yjs binding undo', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  function createBoundPeer(name: string, undo: boolean | object = true) {
    const doc = new Y.Doc()
    const yText = doc.getText(name)
    const host = createPlainHost()
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)
    host.focus()
    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy,
      undo
    })
    return { doc, yText, host, editable, binding }
  }

  it('A undo removes only local edits after B synced remote typing', function () {
    const a = createBoundPeer('shared')
    const b = createBoundPeer('shared')

    simulateInsertText(a.host, a.editable, 'aaa')
    syncDocToTarget(a.doc, b.doc)
    simulateInsertText(b.host, b.editable, 'bbb')
    syncDocToTarget(b.doc, a.doc)

    expect(a.yText.toString()).toContain('aaa')
    expect(a.yText.toString()).toContain('bbb')

    expect(a.binding.canUndo()).toBe(true)
    a.binding.undo()

    expect(a.yText.toString()).not.toContain('aaa')
    expect(a.yText.toString()).toContain('bbb')

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('redo restores undone local edits after a remote update', function () {
    const a = createBoundPeer('shared')
    const b = createBoundPeer('shared')

    simulateInsertText(a.host, a.editable, 'local')
    syncDocToTarget(a.doc, b.doc)
    a.binding.undo()
    syncDocToTarget(a.doc, b.doc)

    simulateInsertText(b.host, b.editable, 'remote')
    syncDocToTarget(b.doc, a.doc)

    expect(a.binding.canRedo()).toBe(true)
    a.binding.redo()
    expect(a.yText.toString()).toContain('local')
    expect(a.yText.toString()).toContain('remote')

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('groups continuous typing into one undo step', function () {
    const peer = createBoundPeer('local')
    simulateInsertText(peer.host, peer.editable, 'a')
    simulateInsertText(peer.host, peer.editable, 'b')
    simulateInsertText(peer.host, peer.editable, 'c')

    expect(peer.binding.canUndo()).toBe(true)
    peer.binding.undo()
    expect(peer.yText.toString()).toBe('')

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('creates separate undo steps for composition, paste, and format batches', function () {
    expect(shouldStopCapturing({ source: 'composition', operations: [] })).toBe(true)
    expect(shouldStopCapturing({ source: 'paste', operations: [] })).toBe(true)
    expect(
      shouldStopCapturing({
        source: 'api',
        operations: [{ type: 'setTextAttributes', index: 0, length: 1, attributes: { bold: true } }]
      })
    ).toBe(true)

    const peer = createRichPeer('fmt')
    const bindingWithUndo = new EditableYjsBinding({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      initialSync: defaultInitialSyncPolicy,
      undo: { captureTimeout: 500 }
    })

    simulateRichInsert(peer.host, peer.editable, 'abc')
    bindingWithUndo.stopUndoCapturing()
    simulateComposition(peer.host, peer.editable, 'abcd')
    bindingWithUndo.undo()
    expect(getBlockOperationText(peer.host)).toBe('abc')

    simulateToggleBold(peer.host, peer.editable, 0, 1)
    expect(peer.yText.toDelta().some((op) => op.attributes?.bold)).toBe(true)
    bindingWithUndo.undo()
    expect(peer.yText.toDelta().some((op) => op.attributes?.bold)).toBe(false)

    bindingWithUndo.destroy()
    peer.editable.unload()
  })

  it('blocks native historyUndo and routes to binding undo', function () {
    const peer = createBoundPeer('local')
    simulateInsertText(peer.host, peer.editable, 'x')

    const event = new InputEvent('beforeinput', {
      inputType: 'historyUndo',
      bubbles: true,
      cancelable: true
    })
    const prevented = !peer.host.dispatchEvent(event)
    expect(prevented).toBe(true)
    expect(peer.yText.toString()).toBe('')

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('does not destroy an external UndoManager on binding destroy', function () {
    const peer = createRichPeer('external')
    const undoManager = new Y.UndoManager(peer.yText)
    const destroySpy = vi.spyOn(undoManager, 'destroy')

    const binding = new EditableYjsBinding({
      editable: peer.editable,
      host: peer.host,
      yText: peer.yText,
      initialSync: defaultInitialSyncPolicy,
      undo: { undoManager }
    })

    binding.destroy()
    expect(destroySpy).not.toHaveBeenCalled()
    undoManager.destroy()
    peer.editable.unload()
  })

  it('destroys an internally created UndoManager on binding destroy', function () {
    const peer = createBoundPeer('internal')
    const manager = peer.binding.undoManager!
    const destroySpy = vi.spyOn(manager, 'destroy')

    peer.binding.destroy()
    expect(destroySpy).toHaveBeenCalled()
    peer.editable.unload()
  })

  it('notifies undo status callbacks', function () {
    const onStatusChange =
      vi.fn<(status: import('../src/yjs/binding-undo.js').YjsBindingUndoStatus) => void>()
    const peer = createBoundPeer('status', { onStatusChange })

    simulateInsertText(peer.host, peer.editable, 'z')
    expect(onStatusChange).toHaveBeenCalled()
    expect(onStatusChange.mock.calls.some(([status]) => status.canUndo)).toBe(true)

    peer.binding.destroy()
    peer.editable.unload()
  })
})

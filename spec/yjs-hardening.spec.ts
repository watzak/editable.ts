import * as Y from 'yjs'
import { vi } from 'vitest'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { EditableYjsBinding, EditableYjsPresence } from '../src/yjs/index.js'
import { Awareness } from 'y-protocols/awareness'
import {
  createPlainHost,
  defaultInitialSyncPolicy,
  simulateInsertText
} from './helpers/yjs-sync-harness.js'

describe('Yjs hardening', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.editable-yjs-presence-layer').forEach((node) => node.remove())
  })

  it('ignores operation batches after binding destroy (no echo reentrancy)', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    const host = createPlainHost()
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(host, editable, 'before')
    binding.destroy()

    const lengthBefore = yText.length
    editable.applyOperations(host, {
      source: 'api',
      operations: [{ type: 'insertText', index: yText.length, text: 'after' }]
    })

    expect(yText.length).toBe(lengthBefore)
    editable.unload()
  })

  it('cleans up presence overlay when host is removed without destroy()', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    const host = createPlainHost()
    const editable = new Editable()
    editable.add(host)
    const awareness = new Awareness(doc)

    const presence = new EditableYjsPresence({
      editable,
      host,
      yText,
      awareness,
      user: { name: 'A', color: '#000' },
      throttleMs: 0
    })

    host.remove()
    expect(document.querySelector('.editable-yjs-presence-layer')).toBeNull()
    presence.destroy()
    editable.unload()
  })

  it('does not throw when destroy() races a remote Y.Text update', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'start')
    const host = createPlainHost()
    host.textContent = 'start'
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy
    })

    expect(() => {
      doc.transact(() => {
        yText.insert(5, 'X')
      }, 'remote-fuzz')
      binding.destroy()
    }).not.toThrow()

    expect(getBlockOperationText(host)).toBeTruthy()
    editable.unload()
  })

  it('uses host.ownerDocument for presence layer (iframe-safe realm)', function () {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const frameDoc = iframe.contentDocument!
    frameDoc.open()
    frameDoc.write('<!doctype html><html><body></body></html>')
    frameDoc.close()

    const host = frameDoc.createElement('div')
    host.setAttribute('contenteditable', 'true')
    frameDoc.body.appendChild(host)

    const editable = new Editable({ window: iframe.contentWindow! })
    editable.add(host)
    const doc = new Y.Doc()
    const yText = doc.getText('iframe')
    const awareness = new Awareness(doc)

    const presence = new EditableYjsPresence({
      editable,
      host,
      yText,
      awareness,
      user: { name: 'Frame', color: '#22c55e' },
      throttleMs: 0
    })

    presence.refresh()
    expect(frameDoc.querySelector('.editable-yjs-presence-layer')).not.toBeNull()
    expect(document.querySelector('.editable-yjs-presence-layer')).toBeNull()

    presence.destroy()
    editable.unload()
    iframe.remove()
  })

  it('reports undo status without leaking listeners after destroy', function () {
    const onStatusChange = vi.fn<(status: { canUndo: boolean; canRedo: boolean }) => void>()
    const host = createPlainHost()
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)
    const doc = new Y.Doc()
    const yText = doc.getText('t')

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy,
      undo: { onStatusChange }
    })

    simulateInsertText(host, editable, 'x')
    const callsBefore = onStatusChange.mock.calls.length
    binding.destroy()
    simulateInsertText(host, editable, 'y')
    expect(onStatusChange.mock.calls.length).toBe(callsBefore)
    editable.unload()
  })
})

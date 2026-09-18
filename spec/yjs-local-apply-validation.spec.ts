import * as Y from 'yjs'
import { describe, expect, it, vi } from 'vitest'
import { Editable } from '../src/core.js'
import { dispatchEditableOperations } from '../src/operation-pipeline.js'
import { EditableYjsBinding } from '../src/yjs/editable-yjs-binding.js'
import { defaultInitialSyncPolicy, simulateInsertText } from './helpers/yjs-sync-harness.js'

describe('EditableYjsBinding local apply (exactly-once, no partial CRDT)', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('applies exactly one Y.Text transaction per valid operation batch', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    document.body.appendChild(host)
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)

    const transactSpy = vi.spyOn(doc, 'transact')
    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy
    })

    simulateInsertText(host, editable, 'hi')
    transactSpy.mockClear()

    dispatchEditableOperations(editable.dispatcher.notify, host, {
      source: 'api',
      operations: [{ type: 'insertText', index: 2, text: '!' }]
    })

    expect(transactSpy).toHaveBeenCalledTimes(1)
    expect(yText.toString()).toBe('hi!')

    binding.destroy()
    editable.unload()
  })

  it('does not mutate Y.Text when host validation fails', function () {
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

    dispatchEditableOperations(editable.dispatcher.notify, host, {
      source: 'api',
      operations: [{ type: 'deleteText', index: 0, length: 99 }]
    })

    expect(yText.toString()).toBe('ab')

    binding.destroy()
    editable.unload()
  })
})

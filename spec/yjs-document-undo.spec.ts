import * as Y from 'yjs'
import { vi } from 'vitest'
import { Editable } from '../src/core.js'
import { EditableYjsBinding } from '../src/yjs/editable-yjs-binding.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  insertCmsComponent
} from '../examples/yjs-cms-document-adapter.js'
import {
  createPlainHost,
  defaultInitialSyncPolicy,
  simulateInsertText
} from './helpers/yjs-sync-harness.js'

/** Lets scheduled microtasks and structure reconciles run before assertions. */
function flushPendingWork(): Promise<void> {
  return Promise.resolve()
}

describe('EditableYjsDocumentBinding undo ownership', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
  })

  function createFixture() {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)

    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })

    const paragraph = insertCmsComponent(root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Hello world', { bold: true })

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer,
      undo: true
    })

    const paragraphId = paragraph.map.get('id') as string
    const bodyHost = binding.getComponentView(paragraphId)?.directiveHosts.get('body')
    if (!bodyHost) throw new Error('Expected the paragraph body host to be mounted')

    return {
      doc,
      root,
      editable,
      binding,
      paragraphId,
      body: paragraph.body!,
      bodyHost
    }
  }

  it('preserves undo history when a remote component mounts after a local edit', async function () {
    const { binding, bodyHost, editable, body, root, doc } = createFixture()

    simulateInsertText(bodyHost, editable, '!!!')
    expect(binding.canUndo()).toBe(true)

    doc.transact(() => {
      insertCmsComponent(root, 'quote', 1)
    })

    await flushPendingWork()

    expect(binding.canUndo()).toBe(true)
    expect(binding.undo()).toBe(true)
    expect(body.toString()).toBe('Hello world')

    binding.destroy()
    editable.unload()
  })

  it('preserves undo history when another local directive field mounts', async function () {
    const { binding, bodyHost, editable, body, root, doc } = createFixture()

    simulateInsertText(bodyHost, editable, '!!!')
    expect(binding.canUndo()).toBe(true)

    doc.transact(() => {
      insertCmsComponent(root, 'quote', 1)
    }, binding.transactionOrigin)

    await flushPendingWork()

    expect(binding.canUndo()).toBe(true)
    binding.undo()
    expect(body.toString()).toBe('Hello world')

    binding.destroy()
    editable.unload()
  })

  it('preserves redo history when a new directive field mounts', async function () {
    const { binding, bodyHost, editable, body, root, doc } = createFixture()

    simulateInsertText(bodyHost, editable, '!!!')
    expect(binding.undo()).toBe(true)
    expect(body.toString()).toBe('Hello world')
    expect(binding.canRedo()).toBe(true)

    doc.transact(() => {
      insertCmsComponent(root, 'paragraph', 1)
    })

    await flushPendingWork()

    expect(binding.canRedo()).toBe(true)
    expect(binding.redo()).toBe(true)
    expect(body.toString()).toBe('Hello world!!!')

    binding.destroy()
    editable.unload()
  })

  it('does not record initial sync transactions in the shared undo stack', function () {
    const { binding, editable } = createFixture()
    expect(binding.canUndo()).toBe(false)
    expect(binding.canRedo()).toBe(false)
    binding.destroy()
    editable.unload()
  })

  it('keeps the shared UndoManager usable after a directive binding is destroyed', function () {
    const { binding, editable, bodyHost, paragraphId } = createFixture()
    const directiveBinding = binding.getDirectiveBinding(paragraphId, 'body')
    if (!directiveBinding) throw new Error('Expected directive binding')

    simulateInsertText(bodyHost, editable, 'x')
    expect(binding.canUndo()).toBe(true)

    const undoManager = directiveBinding.undoManager!
    const destroySpy = vi.spyOn(undoManager, 'destroy')

    directiveBinding.destroy()

    expect(destroySpy).not.toHaveBeenCalled()
    expect(binding.canUndo()).toBe(true)
    expect(binding.undo()).toBe(true)

    binding.destroy()
    expect(destroySpy).toHaveBeenCalled()
    editable.unload()
  })
})

describe('EditableYjsBinding undo stack ownership', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('does not clear a shared external UndoManager when a second binding activates', function () {
    const doc = new Y.Doc()
    const yTextA = doc.getText('a')
    const yTextB = doc.getText('b')
    const hostA = createPlainHost()
    const hostB = createPlainHost()
    document.body.appendChild(hostA)
    document.body.appendChild(hostB)

    const editable = new Editable({ defaultBehavior: false })
    editable.add(hostA)
    editable.add(hostB)

    const undoManager = new Y.UndoManager([yTextA, yTextB])

    const bindingA = new EditableYjsBinding({
      editable,
      host: hostA,
      yText: yTextA,
      initialSync: defaultInitialSyncPolicy,
      undo: { undoManager }
    })

    simulateInsertText(hostA, editable, 'local')
    expect(undoManager.canUndo()).toBe(true)

    new EditableYjsBinding({
      editable,
      host: hostB,
      yText: yTextB,
      initialSync: defaultInitialSyncPolicy,
      undo: { undoManager }
    })

    expect(undoManager.canUndo()).toBe(true)
    undoManager.undo()
    expect(yTextA.toString()).toBe('')

    bindingA.destroy()
    undoManager.destroy()
    editable.unload()
  })

  it('clears an internally owned UndoManager stack on activation', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('owned')
    const host = createPlainHost()
    document.body.appendChild(host)
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy,
      deferInitialSync: true,
      undo: true
    })

    const manager = binding.undoManager!
    const clearSpy = vi.spyOn(manager, 'clear')

    binding.activate()

    expect(clearSpy).toHaveBeenCalledWith(true, true)
    expect(binding.canUndo()).toBe(false)

    binding.destroy()
    editable.unload()
  })

  it('destroys an internally created UndoManager on binding destroy', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('internal')
    const host = createPlainHost()
    document.body.appendChild(host)
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)

    const binding = new EditableYjsBinding({
      editable,
      host,
      yText,
      initialSync: defaultInitialSyncPolicy,
      undo: true
    })

    const manager = binding.undoManager!
    const destroySpy = vi.spyOn(manager, 'destroy')

    binding.destroy()
    expect(destroySpy).toHaveBeenCalled()

    editable.unload()
  })
})

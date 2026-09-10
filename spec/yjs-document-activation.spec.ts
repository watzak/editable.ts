import * as Y from 'yjs'
import { vi } from 'vitest'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { InitialSyncConflictError } from '../src/yjs/initial-sync.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  insertCmsComponent
} from '../examples/yjs-cms-document-adapter.js'
import {
  defaultInitialSyncPolicy,
  simulateInsertText,
  syncDocToTarget
} from './helpers/yjs-sync-harness.js'

function flushPendingWork(): Promise<void> {
  return Promise.resolve()
}

describe('EditableYjsDocumentBinding activation lifecycle', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
  })

  function createDeferredBinding(options?: {
    root?: Y.Array<Y.Map<unknown>>
    seedParagraph?: boolean
  }) {
    const doc = new Y.Doc()
    const root = options?.root ?? createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)

    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })

    let paragraphId = ''
    let body: Y.Text | null = null
    if (options?.seedParagraph !== false) {
      const paragraph = insertCmsComponent(root, 'paragraph', 0)
      paragraph.body!.insert(0, 'Hello world')
      paragraphId = paragraph.map.get('id') as string
      body = paragraph.body!
    }

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer,
      deferInitialSync: true,
      initialSync: defaultInitialSyncPolicy,
      undo: true
    })

    const bodyHost = paragraphId
      ? binding.getComponentView(paragraphId)?.directiveHosts.get('body')
      : undefined

    return { doc, root, editable, adapter, binding, mountContainer, paragraphId, body, bodyHost }
  }

  it('activates an empty deferred document and auto-activates later mounts', async function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer,
      deferInitialSync: true,
      initialSync: defaultInitialSyncPolicy
    })

    expect(binding.lifecycleState).toBe('deferred')
    expect(binding.isActivated).toBe(false)

    binding.activate()
    expect(binding.lifecycleState).toBe('active')
    expect(binding.isActivated).toBe(true)

    const paragraph = insertCmsComponent(root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Late mount')
    binding.reconcile('add-component')
    await flushPendingWork()

    const paragraphId = paragraph.map.get('id') as string
    const directiveBinding = binding.getDirectiveBinding(paragraphId, 'body')
    const bodyHost = binding.getComponentView(paragraphId)?.directiveHosts.get('body')
    if (!directiveBinding || !bodyHost) throw new Error('Expected mounted paragraph body')

    expect(directiveBinding.isActivated).toBe(true)
    expect(getBlockOperationText(bodyHost)).toBe('Late mount')

    simulateInsertText(bodyHost, editable, '!')
    expect(paragraph.body!.toString()).toBe('Late mount!')

    binding.destroy()
    editable.unload()
  })

  it('activates a populated deferred document and keeps remote mounts active', async function () {
    const { binding, editable, bodyHost, body, root, doc } = createDeferredBinding()

    if (!bodyHost || !body) throw new Error('Expected seeded paragraph')

    expect(
      binding.getDirectiveBinding(binding.listMountedDirectiveKeys()[0].split(':')[0], 'body')
        ?.isActivated
    ).toBe(false)

    binding.activate()
    expect(binding.isActivated).toBe(true)
    expect(getBlockOperationText(bodyHost)).toBe('Hello world')

    doc.transact(() => {
      insertCmsComponent(root, 'quote', 1)
    })

    await flushPendingWork()

    const quoteId = root.get(1)?.get('id') as string
    const quoteBodyBinding = binding.getDirectiveBinding(quoteId, 'body')
    expect(quoteBodyBinding?.isActivated).toBe(true)

    simulateInsertText(bodyHost, editable, '!')
    expect(body.toString()).toBe('Hello world!')

    binding.destroy()
    editable.unload()
  })

  it('syncs a later-mounted field locally and to a remote peer', async function () {
    const local = createDeferredBinding({ seedParagraph: false })
    local.binding.activate()

    const remoteDoc = new Y.Doc()
    const remoteRoot = createCmsDocumentRoot(remoteDoc)
    const remoteMount = document.createElement('div')
    document.body.appendChild(remoteMount)
    const remoteEditable = new Editable({ defaultBehavior: true })
    const remoteAdapter = createCmsDocumentAdapter({ mountContainer: remoteMount })
    const remoteBinding = new EditableYjsDocumentBinding({
      editable: remoteEditable,
      yDoc: remoteDoc,
      root: remoteRoot,
      adapter: remoteAdapter,
      mountContainer: remoteMount,
      deferInitialSync: true,
      initialSync: defaultInitialSyncPolicy
    })
    remoteBinding.activate()

    const paragraph = insertCmsComponent(local.root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Shared')
    local.binding.reconcile('local-add')
    await flushPendingWork()

    syncDocToTarget(local.doc, remoteDoc)
    remoteBinding.reconcile('remote-update')
    await flushPendingWork()

    const paragraphId = paragraph.map.get('id') as string
    const localHost = local.binding.getComponentView(paragraphId)?.directiveHosts.get('body')
    const remoteHost = remoteBinding.getComponentView(paragraphId)?.directiveHosts.get('body')
    if (!localHost || !remoteHost) throw new Error('Expected both paragraph hosts')

    expect(local.binding.getDirectiveBinding(paragraphId, 'body')?.isActivated).toBe(true)
    expect(remoteBinding.getDirectiveBinding(paragraphId, 'body')?.isActivated).toBe(true)
    expect(getBlockOperationText(localHost)).toBe('Shared')
    expect(getBlockOperationText(remoteHost)).toBe('Shared')

    simulateInsertText(localHost, local.editable, '!')
    syncDocToTarget(local.doc, remoteDoc)
    remoteBinding.reconcile('remote-edit')
    await flushPendingWork()

    expect(paragraph.body!.toString()).toBe('Shared!')
    expect(getBlockOperationText(remoteHost)).toBe('Shared!')

    local.binding.destroy()
    remoteBinding.destroy()
    local.editable.unload()
    remoteEditable.unload()
  })

  it('supports repeated activate calls without duplicate listeners', function () {
    const { binding, editable, bodyHost } = createDeferredBinding()
    if (!bodyHost) throw new Error('Expected body host')

    const directiveBinding = binding.getDirectiveBinding(
      binding.listMountedDirectiveKeys()[0].split(':')[0],
      'body'
    )
    if (!directiveBinding) throw new Error('Expected directive binding')

    const observeSpy = vi.spyOn(directiveBinding.yText, 'observe')
    const onSpy = vi.spyOn(editable, 'on')

    binding.activate()
    binding.activate()
    binding.activate()

    expect(binding.isActivated).toBe(true)
    expect(observeSpy).toHaveBeenCalledTimes(1)
    expect(onSpy.mock.calls.filter(([event]) => event === 'operation').length).toBe(1)

    simulateInsertText(bodyHost, editable, '!')
    expect(directiveBinding.yText.toString()).toBe('Hello world!')

    binding.destroy()
    editable.unload()
  })

  it('throws on activate after destroy and reports destroyed lifecycle', function () {
    const { binding, editable } = createDeferredBinding()

    binding.destroy()
    expect(binding.lifecycleState).toBe('destroyed')
    expect(binding.isActivated).toBe(false)
    expect(() => binding.activate()).toThrow(/destroyed/)

    editable.unload()
  })

  it('keeps the document deferred when initial sync conflicts and allows retry', function () {
    const { binding, editable, bodyHost, body } = createDeferredBinding()
    if (!bodyHost || !body) throw new Error('Expected seeded paragraph')

    bodyHost.textContent = 'Host copy'

    expect(() => binding.activate()).toThrow(InitialSyncConflictError)
    expect(binding.lifecycleState).toBe('deferred')
    expect(binding.isActivated).toBe(false)

    body.delete(0, body.length)
    body.insert(0, 'Host copy')

    binding.activate()
    expect(binding.lifecycleState).toBe('active')
    expect(binding.isActivated).toBe(true)
    expect(getBlockOperationText(bodyHost)).toBe('Host copy')

    binding.destroy()
    editable.unload()
  })

  it('preserves shared undo history when mounting fields after document activation', async function () {
    const { binding, editable, bodyHost, root, doc } = createDeferredBinding()
    if (!bodyHost) throw new Error('Expected body host')

    binding.activate()
    simulateInsertText(bodyHost, editable, '!!!')
    expect(binding.canUndo()).toBe(true)

    doc.transact(() => {
      insertCmsComponent(root, 'paragraph', 1)
    })
    await flushPendingWork()

    expect(binding.canUndo()).toBe(true)
    expect(binding.undo()).toBe(true)
    expect(getBlockOperationText(bodyHost)).toBe('Hello world')

    binding.destroy()
    editable.unload()
  })
})

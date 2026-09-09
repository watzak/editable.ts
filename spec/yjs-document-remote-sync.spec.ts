import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  deleteCmsComponent,
  insertCmsComponent,
  moveCmsComponent,
  validateCmsComponentRecord
} from '../examples/yjs-cms-document-adapter.js'

function syncPeer(from: Y.Doc, to: Y.Doc): void {
  const update = Y.encodeStateAsUpdate(from, Y.encodeStateVector(to))
  Y.applyUpdate(to, update)
}

describe('EditableYjsDocumentBinding remote structure sync', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
  })

  function createPeer(label: string) {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    mountContainer.dataset.testPeer = label
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const diagnostics: string[] = []
    const adapter = createCmsDocumentAdapter({ mountContainer })
    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer,
      undo: true,
      onStructureDiagnostic: (entry) => diagnostics.push(entry.reason)
    })
    return { doc, root, mountContainer, editable, adapter, binding, diagnostics, label }
  }

  it('applies remote component insert to peer view', function () {
    const a = createPeer('a')
    const b = createPeer('b')
    const created = insertCmsComponent(a.root, 'paragraph', 0)
    created.body!.insert(0, 'From A')
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('remote-test')

    expect(b.root.length).toBe(1)
    expect(b.mountContainer.querySelectorAll('.cms-component').length).toBe(1)
    expect(b.binding.listMountedDirectiveKeys().length).toBe(1)

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('updates view order on remote move', function () {
    const a = createPeer('a')
    const b = createPeer('b')
    const first = insertCmsComponent(a.root, 'paragraph', 0)
    insertCmsComponent(a.root, 'paragraph', 1)
    const firstId = first.map.get('id') as string
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('seed')

    moveCmsComponent(a.root, firstId, a.root, 1, a.binding.transactionOrigin)
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('remote-move')

    const ids = [...b.mountContainer.querySelectorAll('.cms-component')].map(
      (el) => (el as HTMLElement).dataset.componentId
    )
    expect(ids[1]).toBe(firstId)
    expect(b.binding.getComponentView(firstId)).toBeTruthy()

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('syncs nested container inserts across peers', function () {
    const a = createPeer('a')
    const b = createPeer('b')
    const columns = insertCmsComponent(a.root, 'two-column', 0)
    const left = columns.containers.get('left') as Y.Array<Y.Map<unknown>>
    const nested = insertCmsComponent(left, 'paragraph', 0)
    nested.body!.insert(0, 'Nested remote')
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('remote-nested')

    expect(b.mountContainer.querySelector('.cms-column-left .cms-component')).toBeTruthy()
    expect(b.binding.listMountedDirectiveKeys().length).toBe(1)

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('removes remote component and bindings on peer', function () {
    const a = createPeer('a')
    const b = createPeer('b')
    const paragraph = insertCmsComponent(a.root, 'paragraph', 0)
    const id = paragraph.map.get('id') as string
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('seed')

    deleteCmsComponent(a.root, id, a.binding.transactionOrigin)
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('remote-delete')

    expect(b.binding.getComponentView(id)).toBeUndefined()
    expect(b.binding.getDirectiveBinding(id, 'body')).toBeUndefined()

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('does not add remote structural changes to local undo stack', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)

    const remoteDoc = new Y.Doc()
    insertCmsComponent(createCmsDocumentRoot(remoteDoc), 'paragraph', 0)
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remoteDoc, Y.encodeStateVector(doc)))

    const binding = new EditableYjsDocumentBinding({
      editable: new Editable({ defaultBehavior: true }),
      yDoc: doc,
      root,
      adapter: createCmsDocumentAdapter({ mountContainer }),
      mountContainer,
      undo: true
    })

    expect(root.length).toBe(1)
    expect(binding.canUndo()).toBe(false)

    const local = insertCmsComponent(root, 'heading', 1)
    binding.reconcile('local-insert')
    const textBinding = binding.getDirectiveBinding(local.map.get('id') as string, 'body')!
    doc.transact(() => {
      local.body!.insert(0, 'local')
    }, textBinding.transactionOrigin)
    expect(binding.canUndo()).toBe(true)

    binding.destroy()
  })

  it('skips invalid components and reports diagnostics', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)
    const invalid = new Y.Map<unknown>()
    invalid.set('id', 'invalid-id')
    invalid.set('type', 'unknown-widget')
    invalid.set('content', new Y.Map())
    invalid.set('properties', new Y.Map())
    invalid.set('containers', new Y.Map())
    root.insert(0, [invalid])
    insertCmsComponent(root, 'paragraph', 1)

    const diagnostics: string[] = []
    const binding = new EditableYjsDocumentBinding({
      editable: new Editable({ defaultBehavior: true }),
      yDoc: doc,
      root,
      adapter: createCmsDocumentAdapter({ mountContainer }),
      mountContainer,
      onStructureDiagnostic: (entry) => diagnostics.push(entry.reason)
    })

    expect(diagnostics).toContain('unknown-type')
    expect(binding.listMountedDirectiveKeys().length).toBe(1)
    binding.destroy()
  })

  it('validates allowed children in two-column containers', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const handles = insertCmsComponent(root, 'two-column', 0)
    const validation = validateCmsComponentRecord(handles.map, {
      parentType: 'two-column',
      containerId: 'left',
      siblingIndex: 0
    })
    expect(validation.status).toBe('invalid')
    if (validation.status === 'invalid') {
      expect(validation.reason).toBe('child-not-allowed')
    }
  })

  it('converges concurrent inserts at the same index', function () {
    const a = createPeer('a')
    const b = createPeer('b')
    insertCmsComponent(a.root, 'paragraph', 0)
    syncPeer(a.doc, b.doc)
    syncPeer(b.doc, a.doc)

    a.doc.transact(() => insertCmsComponent(a.root, 'heading', 1))
    b.doc.transact(() => insertCmsComponent(b.root, 'quote', 1))
    syncPeer(a.doc, b.doc)
    syncPeer(b.doc, a.doc)

    expect(a.root.length).toBe(b.root.length)
    expect(a.root.length).toBeGreaterThanOrEqual(2)

    a.binding.reconcile('converged-a')
    b.binding.reconcile('converged-b')
    expect(a.binding.listMountedDirectiveKeys().length).toBeGreaterThan(0)
    expect(b.binding.listMountedDirectiveKeys().length).toBeGreaterThan(0)

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('does not reconcile after destroy', function () {
    const peer = createPeer('a')
    insertCmsComponent(peer.root, 'paragraph', 0)
    peer.binding.destroy()
    peer.editable.unload()
    expect(() => peer.binding.reconcile('after-destroy')).not.toThrow()
    expect(peer.mountContainer.querySelectorAll('.cms-component').length).toBe(0)
  })
})

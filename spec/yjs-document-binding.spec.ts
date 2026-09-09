import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { dispatchEditableCommand } from '../src/command-pipeline.js'
import { buildSplitBlockCommand, buildMergeBlockCommand } from '../src/command-builder.js'
import * as content from '../src/content.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  deleteCmsComponent,
  insertCmsComponent,
  listCmsDirectives,
  moveCmsComponent
} from '../examples/yjs-cms-document-adapter.js'
import { installHostPolicy, resolveHostPolicy } from '../src/host-policy.js'
import * as block from '../src/block.js'
import { simulateInsertText } from './helpers/yjs-sync-harness.js'

describe('EditableYjsDocumentBinding', function () {
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
      adapter,
      binding,
      mountContainer,
      paragraphId,
      body: paragraph.body!,
      bodyHost
    }
  }

  it('mounts multiple directives on quote components', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })

    const quote = insertCmsComponent(root, 'quote', 0)
    quote.title!.insert(0, 'Quote title')
    quote.body!.insert(0, 'Quote body')

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer
    })

    const id = quote.map.get('id') as string
    expect(binding.getDirectiveBinding(id, 'title')).toBeTruthy()
    expect(binding.getDirectiveBinding(id, 'body')).toBeTruthy()
    expect(listCmsDirectives(root).length).toBe(2)

    binding.destroy()
    editable.unload()
  })

  it('mounts nested container components', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })

    const columns = insertCmsComponent(root, 'two-column', 0)
    const left = columns.containers.get('left') as Y.Array<Y.Map<unknown>>
    const nested = insertCmsComponent(left, 'paragraph', 0)
    nested.body!.insert(0, 'Nested')

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer
    })

    const nestedId = nested.map.get('id') as string
    expect(binding.getComponentView(nestedId)?.directiveHosts.get('body')?.textContent).toContain(
      'Nested'
    )

    binding.destroy()
    editable.unload()
  })

  it('destroys bindings without listener leaks', function () {
    const { binding, editable, bodyHost, paragraphId } = createFixture()
    expect(binding.listMountedDirectiveKeys().length).toBeGreaterThan(0)
    expect(binding.getDirectiveBinding(paragraphId, 'body')).toBeTruthy()
    binding.destroy()
    expect(binding.listMountedDirectiveKeys().length).toBe(0)
    expect(binding.getDirectiveBinding(paragraphId, 'body')).toBeUndefined()
    expect(bodyHost.isConnected).toBe(false)
    editable.unload()
  })

  it('splits paragraph preserving rich text via structural adapter', function () {
    const { binding, editable, bodyHost, paragraphId, root } = createFixture()
    block.setBlockId(bodyHost)
    installHostPolicy(bodyHost, resolveHostPolicy({ plainText: false }))

    const cursor = editable.createCursorAtCharacterOffset({ element: bodyHost, offset: 5 })
    cursor?.setVisibleSelection()
    const command = buildSplitBlockCommand(
      bodyHost,
      content.getInnerHtmlOfFragment(cursor!.before()),
      content.getInnerHtmlOfFragment(cursor!.after()),
      cursor!,
      'api'
    )
    dispatchEditableCommand(editable.dispatcher.notify, command, { cursor: cursor! })

    expect(root.length).toBe(2)
    const secondId = (root.get(1)?.get('id') as string) ?? ''
    expect(binding.getComponentView(secondId)).toBeTruthy()
    expect(binding.getDirectiveBinding(paragraphId, 'body')?.yText.toString()).toBe('Hello')

    binding.destroy()
    editable.unload()
  })

  it('merges paragraphs with rich text', function () {
    const { binding, editable, root } = createFixture()
    const second = insertCmsComponent(root, 'paragraph', 1)
    second.body!.insert(0, ' tail', { italic: true })

    binding.reconcile('test-setup')
    const secondView = binding.getComponentView(second.map.get('id') as string)
    const secondHost = secondView!.directiveHosts.get('body')!
    block.setBlockId(secondHost)
    installHostPolicy(secondHost, resolveHostPolicy({ plainText: false }))

    const cursor = editable.createCursorAtCharacterOffset({ element: secondHost, offset: 0 })
    cursor?.setVisibleSelection()
    const command = buildMergeBlockCommand(secondHost, 'before', cursor!, 'api')
    dispatchEditableCommand(editable.dispatcher.notify, command, { cursor: cursor! })

    expect(root.length).toBe(1)
    const mergedMap = root.get(0) as Y.Map<unknown>
    const mergedBody = (mergedMap.get('content') as Y.Map<unknown>).get('body') as Y.Text
    expect(mergedBody.toString()).toBe('Hello world tail')

    binding.reconcile('post-merge')
    binding.destroy()
    editable.unload()
  })

  it('undoes local text edits through shared undo manager', function () {
    const { binding, editable, bodyHost, body } = createFixture()
    simulateInsertText(bodyHost, editable, '!')
    expect(binding.canUndo()).toBe(true)
    binding.undo()
    expect(body.toString()).toBe('Hello world')
    binding.destroy()
    editable.unload()
  })

  it('undoes CRDT array insert through shared undo manager', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })
    insertCmsComponent(root, 'paragraph', 0)

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer,
      undo: true
    })

    doc.transact(() => {
      insertCmsComponent(root, 'paragraph', 1)
    }, binding.transactionOrigin)

    expect(root.length).toBe(2)
    expect(binding.undo()).toBe(true)
    expect(root.length).toBe(1)
    binding.destroy()
    editable.unload()
  })

  it('handles concurrent local inserts with unique ids', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    doc.transact(() => {
      insertCmsComponent(root, 'paragraph', 0)
      insertCmsComponent(root, 'paragraph', 1)
    })

    const ids = new Set<string>()
    for (let i = 0; i < root.length; i += 1) {
      ids.add(root.get(i)?.get('id') as string)
    }
    expect(ids.size).toBe(2)
  })

  it('removes component while selection active without throwing', function () {
    const { binding, editable, bodyHost, paragraphId, root } = createFixture()
    bodyHost.focus()
    const sel = window.getSelection()
    sel?.selectAllChildren(bodyHost)

    deleteCmsComponent(root, paragraphId)
    binding.reconcile('remote-delete')

    expect(binding.getComponentView(paragraphId)).toBeUndefined()
    binding.destroy()
    editable.unload()
  })

  it('remounts after destroy from serialized Y.Doc state', function () {
    const { binding, editable, mountContainer, adapter, doc, root } = createFixture()
    const update = Y.encodeStateAsUpdate(doc)
    binding.destroy()
    editable.unload()

    const doc2 = new Y.Doc()
    Y.applyUpdate(doc2, update)
    const root2 = createCmsDocumentRoot(doc2)
    const editable2 = new Editable({ defaultBehavior: true })
    const binding2 = new EditableYjsDocumentBinding({
      editable: editable2,
      yDoc: doc2,
      root: root2,
      adapter,
      mountContainer
    })

    expect(listCmsDirectives(root2).length).toBeGreaterThan(0)
    binding2.destroy()
    editable2.unload()
    void root
  })

  it('mounts document binding inside an iframe realm', function () {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const frameDoc = iframe.contentDocument!
    frameDoc.body.innerHTML = '<div id="cms-root"></div>'

    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = frameDoc.getElementById('cms-root')!
    const editable = new Editable({ window: iframe.contentWindow!, defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })

    const paragraph = insertCmsComponent(root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Iframe paragraph')

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer
    })

    const id = paragraph.map.get('id') as string
    expect(binding.getComponentView(id)?.directiveHosts.get('body')?.ownerDocument).toBe(frameDoc)

    binding.destroy()
    editable.unload()
    iframe.remove()
  })

  it('moves components between root positions', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    let aId = ''
    doc.transact(() => {
      const a = insertCmsComponent(root, 'paragraph', 0)
      insertCmsComponent(root, 'paragraph', 1)
      aId = a.map.get('id') as string
    })

    moveCmsComponent(root, aId, root, 1)
    expect(root.get(1)?.get('id')).toBe(aId)
  })
})

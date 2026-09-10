import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import { EditableYjsDocumentAnnotations } from '../src/yjs/editable-yjs-document-annotations.js'
import { getOrCreateAnnotationsMap } from '../src/yjs/annotation-store.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  deleteCmsComponent,
  insertCmsComponent
} from '../examples/yjs-cms-document-adapter.js'
import { createSelection } from './helpers/yjs-sync-harness.js'

describe('EditableYjsDocumentAnnotations', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
    document.querySelectorAll('.editable-yjs-annotation-layer').forEach((node) => node.remove())
  })

  function createFixture() {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)

    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })
    const paragraph = insertCmsComponent(root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Document annotation target')

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer
    })

    const paragraphId = paragraph.map.get('id') as string
    const bodyHost = binding.getComponentView(paragraphId)?.directiveHosts.get('body')
    if (!bodyHost) throw new Error('Expected the paragraph body host to be mounted')

    const documentAnnotations = new EditableYjsDocumentAnnotations({
      documentBinding: binding,
      authorId: 'author-a'
    })
    documentAnnotations.sync()

    return {
      doc,
      root,
      editable,
      adapter,
      binding,
      mountContainer,
      paragraphId,
      bodyHost,
      documentAnnotations
    }
  }

  it('wires per-directive annotations after sync', function () {
    const { documentAnnotations, paragraphId, bodyHost, binding, editable } = createFixture()

    const directive = documentAnnotations.getDirectiveAnnotations(paragraphId, 'body')
    expect(directive).toBeTruthy()

    createSelection(bodyHost, 0, 8)
    const id = directive!.createAtOffsets('comment', 0, 8, { body: 'Needs review' })
    expect(id).toBeTruthy()
    expect(documentAnnotations.store.list().length).toBe(1)

    documentAnnotations.destroy()
    binding.destroy()
    editable.unload()
  })

  it('creates annotations for newly mounted directives after reconcile', function () {
    const { documentAnnotations, binding, editable, root } = createFixture()

    const quote = insertCmsComponent(root, 'quote', 1)
    quote.body!.insert(0, 'Quote body')
    binding.reconcile('insert-quote')
    documentAnnotations.sync()

    const quoteId = quote.map.get('id') as string
    expect(documentAnnotations.getDirectiveAnnotations(quoteId, 'body')).toBeTruthy()
    expect(documentAnnotations.getDirectiveAnnotations(quoteId, 'title')).toBeTruthy()

    documentAnnotations.destroy()
    binding.destroy()
    editable.unload()
  })

  it('marks annotations orphaned when a component is removed (default policy)', function () {
    const { documentAnnotations, binding, editable, paragraphId, root } = createFixture()
    const directive = documentAnnotations.getDirectiveAnnotations(paragraphId, 'body')!
    directive.createAtOffsets('issue', 0, 8, { body: 'Track delete' })

    deleteCmsComponent(root, paragraphId)
    binding.reconcile('remote-delete')
    documentAnnotations.sync()

    const record = documentAnnotations.store.list()[0]
    expect(record?.status).toBe('orphaned')

    documentAnnotations.destroy()
    binding.destroy()
    editable.unload()
  })

  it('removes annotations when componentDeletePolicy is remove', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)

    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })
    const paragraph = insertCmsComponent(root, 'paragraph', 0)
    paragraph.body!.insert(0, 'Remove me')

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer
    })

    const paragraphId = paragraph.map.get('id') as string
    const documentAnnotations = new EditableYjsDocumentAnnotations({
      documentBinding: binding,
      authorId: 'author-a',
      componentDeletePolicy: 'remove'
    })
    documentAnnotations.sync()

    const directive = documentAnnotations.getDirectiveAnnotations(paragraphId, 'body')!
    directive.createAtOffsets('comment', 0, 8, { body: 'gone' })
    expect(documentAnnotations.store.list().length).toBe(1)

    deleteCmsComponent(root, paragraphId)
    binding.reconcile('remote-delete')
    documentAnnotations.sync()

    expect(documentAnnotations.store.list().length).toBe(0)

    documentAnnotations.destroy()
    binding.destroy()
    editable.unload()
  })

  it('destroy tears down directive annotations without listener leaks', function () {
    const { documentAnnotations, binding, editable } = createFixture()

    documentAnnotations.destroy()
    expect(documentAnnotations.getDirectiveAnnotations('any', 'body')).toBeUndefined()

    documentAnnotations.destroy()
    binding.destroy()
    editable.unload()
  })

  it('accepts a shared annotations map on the Y.Doc', function () {
    const { doc, documentAnnotations, binding, editable, paragraphId } = createFixture()
    const sharedMap = getOrCreateAnnotationsMap(doc)
    const directive = documentAnnotations.getDirectiveAnnotations(paragraphId, 'body')!
    directive.createAtOffsets('comment', 0, 4, { body: 'shared map' })

    expect(sharedMap.size).toBe(1)
    expect(documentAnnotations.store.list().length).toBe(1)

    documentAnnotations.destroy()
    binding.destroy()
    editable.unload()
  })
})

import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { simulateInsertText } from './helpers/yjs-sync-harness.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import { diffStructureSnapshots } from '../src/yjs/document-structure-sync.js'
import {
  changeCmsComponentType,
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  insertCmsComponent,
  moveCmsComponent
} from '../examples/yjs-cms-document-adapter.js'

function syncPeer(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
}

describe('document structure type change reconciliation', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
  })

  function createPeer(label: string, options?: { onDestroyComponentView?: () => void }) {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    mountContainer.dataset.testPeer = label
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({
      mountContainer,
      onDestroyComponentView: options?.onDestroyComponentView
    })
    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer,
      undo: true
    })
    return { doc, root, mountContainer, editable, adapter, binding, label }
  }

  it('classifies componentType changes separately from moves', function () {
    const previous = new Map([
      [
        'a',
        {
          componentId: 'a',
          componentType: 'paragraph',
          siblingIndex: 0
        }
      ]
    ])
    const next = new Map([
      [
        'a',
        {
          componentId: 'a',
          componentType: 'quote',
          siblingIndex: 0
        }
      ]
    ])
    expect(diffStructureSnapshots(previous, next)).toEqual([
      expect.objectContaining({ componentId: 'a', kind: 'typeChange' })
    ])
  })

  it('replaces paragraph with quote for the same componentId', function () {
    const peer = createPeer('local')
    const paragraph = insertCmsComponent(peer.root, 'paragraph', 0)
    const id = paragraph.map.get('id') as string
    paragraph.body!.insert(0, 'Typed text')
    peer.binding.reconcile('seed')

    const bodyBefore = peer.binding.getComponentView(id)?.directiveHosts.get('body')
    expect(bodyBefore?.closest('.cms-paragraph')).toBeTruthy()

    changeCmsComponentType(peer.root, id, 'quote', peer.binding.transactionOrigin)
    peer.binding.reconcile('type-change')

    const view = peer.binding.getComponentView(id)
    expect(view?.componentType).toBe('quote')
    expect(view?.rootElement.classList.contains('cms-quote')).toBe(true)
    expect(view?.rootElement.classList.contains('cms-paragraph')).toBe(false)
    expect(view?.directiveHosts.get('body')?.textContent).toContain('Typed text')
    expect(peer.binding.getDirectiveBinding(id, 'title')).toBeTruthy()
    expect(peer.binding.getDirectiveBinding(id, 'body')?.yText).toBe(paragraph.body)

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('remounts directives when the directive set changes', function () {
    const peer = createPeer('local')
    const quote = insertCmsComponent(peer.root, 'quote', 0)
    const id = quote.map.get('id') as string
    peer.binding.reconcile('seed')
    expect(peer.binding.listMountedDirectiveKeys().sort()).toEqual([`${id}:body`, `${id}:title`])

    changeCmsComponentType(peer.root, id, 'paragraph', peer.binding.transactionOrigin)
    peer.binding.reconcile('type-change')

    expect(peer.binding.listMountedDirectiveKeys()).toEqual([`${id}:body`])
    expect(peer.binding.getDirectiveBinding(id, 'title')).toBeUndefined()
    expect(peer.binding.getComponentView(id)?.directiveHosts.has('title')).toBe(false)

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('applies type change together with container repositioning', function () {
    const peer = createPeer('local')
    const columns = insertCmsComponent(peer.root, 'two-column', 0)
    const left = columns.containers.get('left') as Y.Array<Y.Map<unknown>>
    const paragraph = insertCmsComponent(left, 'paragraph', 0)
    const id = paragraph.map.get('id') as string
    paragraph.body!.insert(0, 'Column text')
    peer.binding.reconcile('seed')

    changeCmsComponentType(peer.root, id, 'quote', peer.binding.transactionOrigin)
    moveCmsComponent(peer.root, id, peer.root, 0, peer.binding.transactionOrigin)
    peer.binding.reconcile('type-and-move')

    const view = peer.binding.getComponentView(id)
    expect(view?.componentType).toBe('quote')
    expect(view?.rootElement.parentElement).toBe(peer.mountContainer)
    expect(peer.mountContainer.querySelector('.cms-column-left .cms-component')).toBeNull()

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('syncs remote type change to a second client', function () {
    const a = createPeer('a')
    const b = createPeer('b')
    const paragraph = insertCmsComponent(a.root, 'paragraph', 0)
    const id = paragraph.map.get('id') as string
    paragraph.body!.insert(0, 'Remote type')
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('seed')

    changeCmsComponentType(a.root, id, 'quote', a.binding.transactionOrigin)
    syncPeer(a.doc, b.doc)
    b.binding.reconcile('remote-type-change')

    const view = b.binding.getComponentView(id)
    expect(view?.componentType).toBe('quote')
    expect(b.binding.getDirectiveBinding(id, 'title')).toBeTruthy()
    expect(b.mountContainer.querySelector('.cms-quote')).toBeTruthy()

    a.binding.destroy()
    b.binding.destroy()
    a.editable.unload()
    b.editable.unload()
  })

  it('destroys the old view once and avoids duplicate directive bindings', function () {
    let destroyCount = 0
    const peer = createPeer('local', {
      onDestroyComponentView: () => {
        destroyCount += 1
      }
    })
    const paragraph = insertCmsComponent(peer.root, 'paragraph', 0)
    const id = paragraph.map.get('id') as string
    peer.binding.reconcile('seed')
    const keysBefore = peer.binding.listMountedDirectiveKeys().length

    changeCmsComponentType(peer.root, id, 'quote', peer.binding.transactionOrigin)
    peer.binding.reconcile('type-change')

    expect(destroyCount).toBe(1)
    expect(peer.binding.listMountedDirectiveKeys().length).toBe(2)
    expect(peer.binding.listMountedDirectiveKeys().length).not.toBe(keysBefore)

    peer.binding.reconcile('repeat')
    expect(destroyCount).toBe(1)
    expect(peer.binding.listMountedDirectiveKeys().length).toBe(2)

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('preserves selection when the focused directive survives the type change', function () {
    const peer = createPeer('local')
    const paragraph = insertCmsComponent(peer.root, 'paragraph', 0)
    const id = paragraph.map.get('id') as string
    paragraph.body!.insert(0, 'Hello world')
    peer.binding.reconcile('seed')

    const bodyHost = peer.binding.getComponentView(id)!.directiveHosts.get('body')!
    bodyHost.focus()
    const sel = bodyHost.ownerDocument.defaultView!.getSelection()!
    const textNode = bodyHost.firstChild!
    sel.setBaseAndExtent(textNode, 2, textNode, 5)

    changeCmsComponentType(peer.root, id, 'quote', peer.binding.transactionOrigin)
    peer.binding.reconcile('type-change')

    const newBody = peer.binding.getComponentView(id)!.directiveHosts.get('body')!
    const after = newBody.ownerDocument.defaultView!.getSelection()
    expect(after?.anchorNode).toBeTruthy()
    expect(after?.anchorOffset).toBe(2)
    expect(after?.focusOffset).toBe(5)

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('falls back when the focused directive is removed by the type change', function () {
    const peer = createPeer('local')
    const quote = insertCmsComponent(peer.root, 'quote', 0)
    const id = quote.map.get('id') as string
    quote.title!.insert(0, 'Title')
    peer.binding.reconcile('seed')

    const titleHost = peer.binding.getComponentView(id)!.directiveHosts.get('title')!
    titleHost.focus()
    const sel = titleHost.ownerDocument.defaultView!.getSelection()!
    const textNode = titleHost.firstChild!
    sel.setBaseAndExtent(textNode, 1, textNode, 1)

    changeCmsComponentType(peer.root, id, 'paragraph', peer.binding.transactionOrigin)
    peer.binding.reconcile('type-change')

    const bodyHost = peer.binding.getComponentView(id)!.directiveHosts.get('body')!
    expect(peer.mountContainer.contains(bodyHost)).toBe(true)
    expect(bodyHost.ownerDocument.activeElement).toBe(bodyHost)

    peer.binding.destroy()
    peer.editable.unload()
  })

  it('does not clear shared undo history on type change', function () {
    const peer = createPeer('local')
    const paragraph = insertCmsComponent(peer.root, 'paragraph', 0)
    const id = paragraph.map.get('id') as string
    peer.binding.reconcile('seed')

    const bodyHost = peer.binding.getComponentView(id)!.directiveHosts.get('body')!
    simulateInsertText(bodyHost, peer.editable, '!')
    expect(peer.binding.canUndo()).toBe(true)

    changeCmsComponentType(peer.root, id, 'quote', peer.binding.transactionOrigin)
    peer.binding.reconcile('type-change')

    expect(peer.binding.canUndo()).toBe(true)
    expect(paragraph.body!.toString()).toBe('!')
    expect(peer.binding.undo()).toBe(true)
    expect(paragraph.body!.toString()).toBe('')

    peer.binding.destroy()
    peer.editable.unload()
  })
})

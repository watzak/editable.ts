import * as Y from 'yjs'
import { Editable } from '../lib/core.js'
import { EditableYjsDocumentBinding } from '../lib/yjs/index.js'
import { buildSplitBlockCommand, buildMergeBlockCommand } from '../lib/command-builder.js'
import { dispatchEditableCommand } from '../lib/command-pipeline.js'
import * as content from '../lib/content.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  deleteCmsComponent,
  findCmsComponentByYText,
  insertCmsComponent,
  listCmsComponents
} from './yjs-cms-document-adapter.ts'

const statusEl = document.querySelector('[data-testid="doc-collab-status"]')
const mountContainer = document.getElementById('cms-document')

function log(message) {
  if (statusEl) statusEl.textContent = message
}

function seedDocument(root) {
  const intro = insertCmsComponent(root, 'paragraph', 0)
  intro.body?.insert(0, 'Document-wide Yjs binding demo. Place the caret and use Split or Merge.')
  const quote = insertCmsComponent(root, 'quote', 1)
  quote.title?.insert(0, 'Quote title')
  quote.body?.insert(0, 'Quote body with two directives.')
}

function findFocusedDirective(binding) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node = sel.anchorNode
  while (node && node !== mountContainer) {
    if (node instanceof HTMLElement && node.dataset.directiveKey) {
      const componentEl = node.closest('[data-component-id]')
      const componentId = componentEl?.dataset.componentId
      if (componentId) {
        return {
          host: node,
          componentId,
          directiveKey: node.dataset.directiveKey,
          binding: binding.getDirectiveBinding(componentId, node.dataset.directiveKey)
        }
      }
    }
    node = node.parentNode
  }
  return null
}

let doc = new Y.Doc()
let root = createCmsDocumentRoot(doc)
let editable = new Editable({ defaultBehavior: true })
let adapter = createCmsDocumentAdapter({ mountContainer })
let documentBinding = null

function mountBinding() {
  documentBinding?.destroy()
  editable?.unload()
  editable = new Editable({ defaultBehavior: true })
  adapter = createCmsDocumentAdapter({ mountContainer })
  documentBinding = new EditableYjsDocumentBinding({
    editable,
    yDoc: doc,
    root,
    adapter,
    mountContainer,
    undo: true
  })
  log(`mounted ${listCmsComponents(root).length} component(s)`)
}

seedDocument(root)
mountBinding()

document.querySelector('.toolbar')?.addEventListener('click', (event) => {
  const action = event.target instanceof HTMLButtonElement ? event.target.dataset.action : null
  if (!action || !documentBinding) return

  switch (action) {
    case 'insert-paragraph':
      insertCmsComponent(root, 'paragraph', root.length)
      documentBinding.reconcile('insert-paragraph')
      break
    case 'insert-heading':
      insertCmsComponent(root, 'heading', root.length)
      documentBinding.reconcile('insert-heading')
      break
    case 'insert-quote':
      insertCmsComponent(root, 'quote', root.length)
      documentBinding.reconcile('insert-quote')
      break
    case 'insert-columns':
      insertCmsComponent(root, 'two-column', root.length)
      documentBinding.reconcile('insert-columns')
      break
    case 'delete': {
      const focused = findFocusedDirective(documentBinding)
      if (!focused) break
      deleteCmsComponent(root, focused.componentId, documentBinding.transactionOrigin)
      documentBinding.reconcile('delete')
      break
    }
    case 'split': {
      const focused = findFocusedDirective(documentBinding)
      if (!focused?.binding) break
      const cursor = editable.createCursorAtCharacterOffset({
        element: focused.host,
        offset: focused.binding.yText.length > 0 ? Math.min(3, focused.binding.yText.length) : 0
      })
      cursor?.setVisibleSelection()
      if (!cursor) break
      dispatchEditableCommand(
        editable.dispatcher.notify,
        buildSplitBlockCommand(
          focused.host,
          content.getInnerHtmlOfFragment(cursor.before()),
          content.getInnerHtmlOfFragment(cursor.after()),
          cursor,
          'api'
        ),
        { cursor }
      )
      log('split dispatched')
      break
    }
    case 'merge': {
      const focused = findFocusedDirective(documentBinding)
      if (!focused) break
      const cursor = editable.createCursorAtBeginning(focused.host)
      cursor?.setVisibleSelection()
      if (!cursor) break
      dispatchEditableCommand(
        editable.dispatcher.notify,
        buildMergeBlockCommand(focused.host, 'before', cursor, 'api'),
        { cursor }
      )
      log('merge dispatched')
      break
    }
    case 'undo':
      documentBinding.undo()
      log(documentBinding.canUndo() ? 'undo (more available)' : 'undo')
      break
    case 'redo':
      documentBinding.redo()
      log(documentBinding.canRedo() ? 'redo (more available)' : 'redo')
      break
    case 'destroy-remount': {
      const update = Y.encodeStateAsUpdate(doc)
      documentBinding.destroy()
      editable.unload()
      doc = new Y.Doc()
      Y.applyUpdate(doc, update)
      root = createCmsDocumentRoot(doc)
      mountBinding()
      log('destroyed and remounted from Y.Doc state')
      break
    }
    default:
      break
  }
})

void findCmsComponentByYText

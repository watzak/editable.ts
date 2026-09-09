import * as Y from 'yjs'
import * as content from '../../src/content.js'
import { Editable } from '../../src/core.js'
import { dispatchEditableCommand } from '../../src/command-pipeline.js'
import { buildSplitBlockCommand } from '../../src/command-builder.js'
import { EditableYjsBinding } from '../../src/yjs/index.js'
import {
  createExampleArrayStructuralAdapter,
  createExampleBlocksArray,
  type ExampleBlockRegistry
} from '../../examples/yjs-array-structural-adapter.js'
import { defaultInitialSyncPolicy } from './yjs-sync-harness.js'

export function createStructuralFixture() {
  const doc = new Y.Doc()
  const blocks = createExampleBlocksArray(doc)
  const container = document.createElement('div')
  document.body.appendChild(container)

  const registryMap = new Map<string, { host: HTMLElement; binding: EditableYjsBinding }>()
  const registry: ExampleBlockRegistry = {
    get(id) {
      return registryMap.get(id)
    },
    set(id, entry) {
      registryMap.set(id, entry)
    },
    delete(id) {
      registryMap.delete(id)
    }
  }

  const editable = new Editable({ defaultBehavior: true })
  const blockId = crypto.randomUUID()
  const body = new Y.Text()
  const map = new Y.Map<unknown>()
  map.set('id', blockId)
  map.set('body', body)
  blocks.insert(0, [map])

  const host = document.createElement('div')
  host.setAttribute('contenteditable', 'true')
  host.setAttribute('data-plaintext', 'false')
  container.appendChild(host)
  editable.add(host)

  const adapter = createExampleArrayStructuralAdapter({
    blocks,
    registry,
    createHost(ed) {
      const node = document.createElement('div')
      node.setAttribute('contenteditable', 'true')
      node.setAttribute('data-plaintext', 'false')
      container.appendChild(node)
      ed.add(node)
      return node
    },
    initialSync: defaultInitialSyncPolicy
  })

  const binding = new EditableYjsBinding({
    editable,
    host,
    yText: body,
    initialSync: defaultInitialSyncPolicy,
    undo: true,
    structuralAdapter: adapter
  })

  registry.set(blockId, { host, binding })

  return {
    doc,
    blocks,
    container,
    editable,
    host,
    body,
    binding,
    registry,
    registryMap,
    blockId,
    adapter
  }
}

export function simulateSplitAt(host: HTMLElement, editable: Editable, offset: number): void {
  const cursor = editable.createCursorAtCharacterOffset({ element: host, offset })
  if (!cursor) return
  cursor.setVisibleSelection()

  const command = buildSplitBlockCommand(
    host,
    content.getInnerHtmlOfFragment(cursor.before()),
    content.getInnerHtmlOfFragment(cursor.after()),
    cursor,
    'api'
  )

  dispatchEditableCommand(editable.dispatcher.notify, command, { cursor })
}

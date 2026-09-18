import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { Editable } from '../src/core.js'
import { dispatchEditableCommand } from '../src/command-pipeline.js'
import { buildPasteCommandAtOffset } from '../src/command-builder.js'
import { EditableYjsDocumentBinding } from '../src/yjs/editable-yjs-document-binding.js'
import {
  createCmsDocumentAdapter,
  createCmsDocumentRoot,
  insertCmsComponent
} from '../examples/yjs-cms-document-adapter.js'

describe('CMS example adapter pasteBlocks', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
    document.querySelectorAll('.cms-component').forEach((node) => node.remove())
  })

  it('preserves inline marks in pasted blocks and truncates suffix in source Y.Text', function () {
    const doc = new Y.Doc()
    const root = createCmsDocumentRoot(doc)
    const mountContainer = document.createElement('div')
    document.body.appendChild(mountContainer)
    const editable = new Editable({ defaultBehavior: true })
    const adapter = createCmsDocumentAdapter({ mountContainer })
    const paragraph = insertCmsComponent(root, 'paragraph', 0)
    paragraph.body!.insert(0, 'prefixSUFFIX')
    const paragraphId = paragraph.map.get('id') as string

    const binding = new EditableYjsDocumentBinding({
      editable,
      yDoc: doc,
      root,
      adapter,
      mountContainer
    })

    const bodyHost = binding.getComponentView(paragraphId)!.directiveHosts.get('body')!
    const cursor = editable.createCursorAtCharacterOffset({ element: bodyHost, offset: 6 })
    cursor?.setVisibleSelection()

    const pasteCmd = buildPasteCommandAtOffset(
      bodyHost,
      ['<p><strong>bold</strong> one</p>', '<p>two</p>'],
      6,
      'paste',
      undefined,
      undefined
    )
    pasteCmd.cursor.htmlBefore = 'prefix'
    pasteCmd.cursor.htmlAfter = 'SUFFIX'

    dispatchEditableCommand(editable.dispatcher.notify, pasteCmd, { cursor: cursor! })
    binding.reconcile('paste-rich')

    expect(paragraph.body!.toString()).toBe('prefix')
    expect(root.length).toBe(3)

    const firstNewBody = ((root.get(1) as Y.Map<unknown>).get('content') as Y.Map<unknown>).get(
      'body'
    ) as Y.Text
    const delta = firstNewBody.toDelta() as Array<{
      insert?: string
      attributes?: Record<string, unknown>
    }>
    expect(firstNewBody.toString()).toBe('bold one')
    expect(delta.some((op) => op.attributes?.bold === true)).toBe(true)

    binding.destroy()
    editable.unload()
  })
})

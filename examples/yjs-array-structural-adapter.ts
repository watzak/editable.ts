/**
 * Example structural adapter — NOT a required public document schema.
 *
 * Demonstrates optional hooks using Y.Array<Y.Map> where each block map holds
 * `{ id: string, body: Y.Text }`. Production apps should define their own adapter.
 */
import * as Y from 'yjs'
import * as content from '../src/content.js'
import type { Editable } from '../src/core.js'
import { EditableYjsBinding } from '../src/yjs/index.js'
import type { InitialSyncPolicy } from '../src/yjs/initial-sync.js'
import type {
  EditableYjsStructuralAdapter,
  StructuralBlockContext,
  StructuralIntentResult
} from '../src/yjs/structural-adapter.js'
import { mergeYTextIntoTarget, moveYTextTailToTarget } from '../src/yjs/structural-ytext.js'

export const BLOCKS_ARRAY_KEY = 'editable.ts:example:blocks'

export interface ExampleBlockRecord {
  id: string
  body: Y.Text
}

export interface ExampleBlockRegistry {
  get(id: string): { host: HTMLElement; binding: EditableYjsBinding } | undefined
  set(id: string, entry: { host: HTMLElement; binding: EditableYjsBinding }): void
  delete(id: string): void
}

export function createExampleBlocksArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray(BLOCKS_ARRAY_KEY)
}

export function findBlockIndex(blocks: Y.Array<Y.Map<unknown>>, yText: Y.Text): number {
  for (let i = 0; i < blocks.length; i += 1) {
    const map = blocks.get(i)
    if (map?.get('body') === yText) return i
  }
  return -1
}

export function createExampleArrayStructuralAdapter(options: {
  blocks: Y.Array<Y.Map<unknown>>
  registry: ExampleBlockRegistry
  createHost: (editable: Editable) => HTMLElement
  initialSync: InitialSyncPolicy
}): EditableYjsStructuralAdapter {
  const { blocks, registry, createHost, initialSync } = options

  function registerBlock(
    ctx: StructuralBlockContext,
    id: string,
    body: Y.Text,
    host: HTMLElement
  ): EditableYjsBinding {
    const binding = new EditableYjsBinding({
      editable: ctx.editable,
      host,
      yText: body,
      initialSync,
      undo: ctx.binding.undoManager ? { undoManager: ctx.binding.undoManager } : true,
      structuralAdapter: adapter
    })
    registry.set(id, { host, binding })
    return binding
  }

  let adapter!: EditableYjsStructuralAdapter

  adapter = {
    splitBlock(ctx, intent): StructuralIntentResult {
      const blockIndex = findBlockIndex(blocks, ctx.yText)
      if (blockIndex < 0) return { status: 'rejected', reason: 'block-not-found' }

      ctx.binding.stopUndoCapturing()

      const newId = crypto.randomUUID()
      const newBody = new Y.Text()
      const newMap = new Y.Map<unknown>()
      newMap.set('id', newId)
      newMap.set('body', newBody)

      ctx.doc.transact(() => {
        blocks.insert(blockIndex + 1, [newMap])
        moveYTextTailToTarget(ctx.yText, intent.offset, newBody)
      }, ctx.transactionOrigin)

      const newHost = createHost(ctx.editable)
      const parent = ctx.host.parentNode
      if (parent) {
        parent.insertBefore(newHost, ctx.host.nextSibling)
      }

      const fragment = content.createFragmentFromString(intent.htmlBefore, ctx.host.ownerDocument!)
      ctx.host.innerHTML = ''
      ctx.host.appendChild(fragment)
      content.tidyHtml(ctx.host)

      newHost.innerHTML = intent.htmlAfter
      content.tidyHtml(newHost)

      registerBlock(ctx, newId, newBody, newHost)

      return {
        status: 'accepted',
        focusHost: newHost,
        selection: { anchor: 0, head: 0, direction: 'none' },
        newBlockId: newId
      }
    },

    mergeBlock(ctx, intent): StructuralIntentResult {
      const blockIndex = findBlockIndex(blocks, ctx.yText)
      if (blockIndex < 0) return { status: 'rejected', reason: 'block-not-found' }

      const siblingIndex = intent.direction === 'before' ? blockIndex - 1 : blockIndex + 1
      if (siblingIndex < 0 || siblingIndex >= blocks.length) {
        return { status: 'rejected', reason: 'no-sibling' }
      }

      ctx.binding.stopUndoCapturing()

      const siblingMap = blocks.get(siblingIndex)
      const siblingBody = siblingMap?.get('body') as Y.Text | undefined
      const siblingId = siblingMap?.get('id') as string | undefined
      if (!siblingBody || !siblingId) return { status: 'rejected', reason: 'invalid-sibling' }

      const targetBody = intent.direction === 'before' ? siblingBody : ctx.yText
      const sourceBody = intent.direction === 'before' ? ctx.yText : siblingBody
      const targetId =
        intent.direction === 'before' ? siblingId : (blocks.get(blockIndex)?.get('id') as string)
      const removeId =
        intent.direction === 'before' ? (blocks.get(blockIndex)?.get('id') as string) : siblingId

      const targetEntry = registry.get(targetId)
      const removeEntry = registry.get(removeId)
      if (!targetEntry || !removeEntry) return { status: 'rejected', reason: 'registry-miss' }

      const mergeOffset = targetBody.length

      ctx.doc.transact(() => {
        mergeYTextIntoTarget(targetBody, sourceBody)
        blocks.delete(blockIndex > siblingIndex ? blockIndex : siblingIndex, 1)
      }, ctx.transactionOrigin)

      const targetHost = targetEntry.host
      const removeHost = removeEntry.host

      removeEntry.binding.destroy()
      registry.delete(removeId)
      removeHost.remove()

      targetEntry.binding.reconcile('structural-merge')

      return {
        status: 'accepted',
        focusHost: targetHost,
        selection: { anchor: mergeOffset, head: mergeOffset, direction: 'none' }
      }
    }
  }

  return adapter
}

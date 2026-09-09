/**
 * Example structural adapter — NOT a required public document schema.
 * Plain JS for browser demos (imports from lib/).
 */
import * as Y from 'yjs'
import * as content from '../lib/content.js'
import { EditableYjsBinding } from '../lib/yjs/index.js'
import { mergeYTextIntoTarget, moveYTextTailToTarget } from '../lib/yjs/structural-ytext.js'

export const BLOCKS_ARRAY_KEY = 'editable.ts:example:blocks'

export function createExampleBlocksArray(doc) {
  return doc.getArray(BLOCKS_ARRAY_KEY)
}

export function findBlockIndex(blocks, yText) {
  for (let i = 0; i < blocks.length; i += 1) {
    const map = blocks.get(i)
    if (map?.get('body') === yText) return i
  }
  return -1
}

export function createExampleArrayStructuralAdapter(options) {
  const { blocks, registry, createHost, initialSync } = options

  function registerBlock(ctx, id, body, host) {
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

  const adapter = {
    splitBlock(ctx, intent) {
      const blockIndex = findBlockIndex(blocks, ctx.yText)
      if (blockIndex < 0) return { status: 'rejected', reason: 'block-not-found' }

      ctx.binding.stopUndoCapturing()

      const newId = crypto.randomUUID()
      const newBody = new Y.Text()
      const newMap = new Y.Map()
      newMap.set('id', newId)
      newMap.set('body', newBody)

      ctx.doc.transact(() => {
        blocks.insert(blockIndex + 1, [newMap])
        moveYTextTailToTarget(ctx.yText, intent.offset, newBody)
      }, ctx.transactionOrigin)

      const newHost = createHost(ctx.editable)
      const parent = ctx.host.parentNode
      if (parent) parent.insertBefore(newHost, ctx.host.nextSibling)

      const fragment = content.createFragmentFromString(intent.htmlBefore, ctx.host.ownerDocument)
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

    mergeBlock(ctx, intent) {
      const blockIndex = findBlockIndex(blocks, ctx.yText)
      if (blockIndex < 0) return { status: 'rejected', reason: 'block-not-found' }

      const siblingIndex = intent.direction === 'before' ? blockIndex - 1 : blockIndex + 1
      if (siblingIndex < 0 || siblingIndex >= blocks.length) {
        return { status: 'rejected', reason: 'no-sibling' }
      }

      ctx.binding.stopUndoCapturing()

      const siblingMap = blocks.get(siblingIndex)
      const siblingBody = siblingMap?.get('body')
      const siblingId = siblingMap?.get('id')
      if (!siblingBody || !siblingId) return { status: 'rejected', reason: 'invalid-sibling' }

      const targetBody = intent.direction === 'before' ? siblingBody : ctx.yText
      const sourceBody = intent.direction === 'before' ? ctx.yText : siblingBody
      const targetId = intent.direction === 'before' ? siblingId : blocks.get(blockIndex)?.get('id')
      const removeId = intent.direction === 'before' ? blocks.get(blockIndex)?.get('id') : siblingId

      const targetEntry = registry.get(targetId)
      const removeEntry = registry.get(removeId)
      if (!targetEntry || !removeEntry) return { status: 'rejected', reason: 'registry-miss' }

      const mergeOffset = targetBody.length

      ctx.doc.transact(() => {
        mergeYTextIntoTarget(targetBody, sourceBody)
        blocks.delete(blockIndex > siblingIndex ? blockIndex : siblingIndex, 1)
      }, ctx.transactionOrigin)

      removeEntry.binding.destroy()
      registry.delete(removeId)
      removeEntry.host.remove()

      targetEntry.binding.reconcile('structural-merge')

      return {
        status: 'accepted',
        focusHost: targetEntry.host,
        selection: { anchor: mergeOffset, head: mergeOffset, direction: 'none' }
      }
    }
  }

  return adapter
}

import * as Y from 'yjs'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { EditableYjsBinding } from '../src/yjs/index.js'
import {
  createPlainHost,
  defaultInitialSyncPolicy,
  mergeDocs,
  syncDocToTarget
} from './helpers/yjs-sync-harness.js'

/** Seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Yjs 1000-op seeded convergence', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('converges 1000 mixed CRDT ops then matches visible host text', function () {
    const seed = 20260909
    const random = mulberry32(seed)
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    const yA = docA.getText('content')
    const yB = docB.getText('content')

    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const remoteOrigin = 'fuzz-remote'
    let offlineSide: 'a' | 'b' | null = null

    for (let i = 0; i < 1000; i += 1) {
      if (random() < 0.04) {
        offlineSide = random() < 0.5 ? 'a' : 'b'
        continue
      }
      if (offlineSide && random() < 0.08) {
        if (offlineSide === 'a') syncDocToTarget(docA, docB)
        else syncDocToTarget(docB, docA)
        offlineSide = null
      }

      const side = random() < 0.5 ? 'a' : 'b'
      if (offlineSide === side) continue

      const doc = side === 'a' ? docA : docB
      const yText = side === 'a' ? yA : yB
      const length = yText.length
      const roll = random()

      doc.transact(() => {
        if (roll < 0.45) {
          const index = length === 0 ? 0 : Math.floor(random() * (length + 1))
          const chars =
            alphabet[Math.floor(random() * alphabet.length)]! +
            (random() < 0.1 ? alphabet[Math.floor(random() * alphabet.length)]! : '')
          yText.insert(index, chars)
        } else if (roll < 0.75 && length > 0) {
          const index = Math.floor(random() * length)
          const deleteLen = Math.min(length - index, 1 + Math.floor(random() * 4))
          yText.delete(index, deleteLen)
        } else if (length > 0) {
          const index = Math.floor(random() * length)
          const deleteLen = Math.min(length - index, 1 + Math.floor(random() * 3))
          const repl = alphabet[Math.floor(random() * alphabet.length)]!
          yText.delete(index, deleteLen)
          yText.insert(index, repl)
        }
      }, remoteOrigin)

      if (random() < 0.25) mergeDocs(docA, docB)
      if (random() < 0.05) {
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docB))
      }
    }

    mergeDocs(docA, docB)

    expect(yA.toString()).toBe(yB.toString())
    expect(JSON.stringify(yA.toDelta())).toBe(JSON.stringify(yB.toDelta()))

    const hostA = createPlainHost()
    const hostB = createPlainHost()
    const editableA = new Editable({ defaultBehavior: false })
    const editableB = new Editable({ defaultBehavior: false })
    editableA.add(hostA)
    editableB.add(hostB)

    const bindingA = new EditableYjsBinding({
      editable: editableA,
      host: hostA,
      yText: yA,
      initialSync: defaultInitialSyncPolicy
    })
    const bindingB = new EditableYjsBinding({
      editable: editableB,
      host: hostB,
      yText: yB,
      initialSync: defaultInitialSyncPolicy
    })

    expect(getBlockOperationText(hostA)).toBe(yA.toString())
    expect(getBlockOperationText(hostB)).toBe(yB.toString())

    bindingA.destroy()
    bindingB.destroy()
    editableA.unload()
    editableB.unload()
  })
})

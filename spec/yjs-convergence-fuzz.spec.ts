import {
  applyConvergenceOp,
  assertRichPeersConverged,
  countBindingOriginTransactions,
  createBoundRichPeers,
  flushMicrotasks,
  mulberry32,
  pickDeleteSpan,
  pickTextIndex,
  type ConvergenceOp
} from './helpers/yjs-convergence-harness.js'
import { simulateInsertText } from './helpers/yjs-sync-harness.js'

describe('Yjs seeded convergence with active bindings', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  it('converges mixed editor and CRDT ops with bindings mounted from the start', async function () {
    const seed = 20260910
    const random = mulberry32(seed)
    const peers = createBoundRichPeers('fuzz')
    const remoteOrigin = 'fuzz-remote'
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const ops: ConvergenceOp[] = []
    const opBudget = 160
    let offlineSide: 'a' | 'b' | null = null

    for (let i = 0; i < opBudget; i += 1) {
      if (random() < 0.05) {
        offlineSide = random() < 0.5 ? 'a' : 'b'
        continue
      }
      if (offlineSide && random() < 0.12) {
        const syncOp: ConvergenceOp = {
          kind: 'sync',
          mode: offlineSide === 'a' ? 'aToB' : 'bToA'
        }
        applyConvergenceOp(peers, syncOp, remoteOrigin)
        ops.push(syncOp)
        offlineSide = null
        await flushMicrotasks()
        applyConvergenceOp(peers, { kind: 'sync', mode: 'merge' }, remoteOrigin)
        ops.push({ kind: 'sync', mode: 'merge' })
        await flushMicrotasks()
        assertRichPeersConverged(peers, { seed, ops: [...ops] })
        continue
      }

      const side = random() < 0.5 ? 'a' : 'b'
      if (offlineSide === side) continue

      const peer = side === 'a' ? peers.a : peers.b
      const length = peer.yText.length
      const roll = random()
      let op: ConvergenceOp

      if (roll < 0.28) {
        const text =
          alphabet[Math.floor(random() * alphabet.length)]! +
          (random() < 0.15 ? alphabet[Math.floor(random() * alphabet.length)]! : '')
        op = { kind: 'localInsert', side, text }
      } else if (roll < 0.4 && length > 0) {
        const { start, end } = pickDeleteSpan(random, length)
        op = { kind: 'localDelete', side, start, end }
      } else if (roll < 0.48 && length > 1) {
        const start = Math.floor(random() * (length - 1))
        const end = Math.min(length, start + 1 + Math.floor(random() * 3))
        op = { kind: 'localBold', side, start, end }
      } else if (roll < 0.54 && length > 1) {
        const start = Math.floor(random() * (length - 1))
        const end = Math.min(length, start + 1 + Math.floor(random() * 3))
        op = { kind: 'localItalic', side, start, end }
      } else if (roll < 0.68) {
        const index = pickTextIndex(random, length)
        const text = alphabet[Math.floor(random() * alphabet.length)]!
        op = { kind: 'remoteInsert', side, index, text }
      } else if (roll < 0.8 && length > 0) {
        const { start, end } = pickDeleteSpan(random, length)
        op = { kind: 'remoteDelete', side, index: start, length: end - start }
      } else if (roll < 0.86 && length > 0) {
        const start = Math.floor(random() * length)
        const end = Math.min(length, start + 1 + Math.floor(random() * 2))
        op = { kind: 'remoteFormat', side, start, end, key: random() < 0.5 ? 'bold' : 'italic' }
      } else if (roll < 0.9 && peer.binding.canUndo()) {
        op = { kind: 'undo', side }
      } else if (roll < 0.93 && peer.binding.canRedo()) {
        op = { kind: 'redo', side }
      } else {
        const modes = ['merge', 'aToB', 'bToA', 'duplicateA', 'duplicateB'] as const
        op = { kind: 'sync', mode: modes[Math.floor(random() * modes.length)]! }
      }

      applyConvergenceOp(peers, op, remoteOrigin)
      ops.push(op)
      await flushMicrotasks()

      if (op.kind === 'sync' && op.mode === 'merge') {
        assertRichPeersConverged(peers, { seed, ops: [...ops] })
      }
    }

    applyConvergenceOp(peers, { kind: 'sync', mode: 'merge' }, remoteOrigin)
    ops.push({ kind: 'sync', mode: 'merge' })
    await flushMicrotasks()
    assertRichPeersConverged(peers, { seed, ops })

    const echoCount = countBindingOriginTransactions(peers.a.doc, peers.a.binding, () => {
      simulateInsertText(peers.a.host, peers.a.editable, 'x')
    })
    expect(echoCount).toBe(1)

    peers.a.binding.destroy()
    peers.b.binding.destroy()
    peers.a.editable.unload()
    peers.b.editable.unload()
  })
})

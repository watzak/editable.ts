import * as Y from 'yjs'
import { getOperationTextLength } from '../../src/operation-offset.js'
import { domRangeToOperationOffsets } from '../../src/operation-offset.js'
import { isBindingTransactionOrigin } from '../../src/yjs/binding-origin.js'
import {
  EditableYjsBinding,
  hostRichTextMatchesYText,
  textRunsEqual,
  textRunsFromYText
} from '../../src/yjs/index.js'
import type { Editable } from '../../src/core.js'
import {
  createRichPeer,
  hostPlainText,
  hostTextRuns,
  simulateToggleBold,
  simulateToggleItalic
} from './yjs-rich-harness.js'
import { defaultInitialSyncPolicy } from './yjs-sync-harness.js'
import {
  mergeDocs,
  simulateInsertText,
  simulateReplaceSelection,
  syncDocToTarget
} from './yjs-sync-harness.js'

/** Seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type ConvergenceSide = 'a' | 'b'

export type ConvergenceOp =
  | { kind: 'localInsert'; side: ConvergenceSide; text: string }
  | { kind: 'localDelete'; side: ConvergenceSide; start: number; end: number }
  | { kind: 'localBold'; side: ConvergenceSide; start: number; end: number }
  | { kind: 'localItalic'; side: ConvergenceSide; start: number; end: number }
  | { kind: 'remoteInsert'; side: ConvergenceSide; index: number; text: string }
  | { kind: 'remoteDelete'; side: ConvergenceSide; index: number; length: number }
  | { kind: 'remoteFormat'; side: ConvergenceSide; start: number; end: number; key: string }
  | { kind: 'sync'; mode: 'merge' | 'aToB' | 'bToA' | 'duplicateA' | 'duplicateB' }
  | { kind: 'undo'; side: ConvergenceSide }
  | { kind: 'redo'; side: ConvergenceSide }

export interface BoundRichPeer {
  side: ConvergenceSide
  doc: Y.Doc
  yText: Y.Text
  host: HTMLElement
  editable: Editable
  binding: EditableYjsBinding
}

function bindRichPeerWithUndo(peer: ReturnType<typeof createRichPeer>): EditableYjsBinding {
  return new EditableYjsBinding({
    editable: peer.editable,
    host: peer.host,
    yText: peer.yText,
    initialSync: defaultInitialSyncPolicy,
    undo: true
  })
}

function ensureHostMatchesYText(peer: BoundRichPeer): void {
  if (!hostRichTextMatchesYText(peer.host, peer.yText, document)) {
    peer.binding.reconcile('convergence-check')
  }
}

export function createBoundRichPeers(name: string): { a: BoundRichPeer; b: BoundRichPeer } {
  const sharedTextName = `${name}-content`
  const peerA = createRichPeer(sharedTextName)
  const peerB = createRichPeer(sharedTextName)
  return {
    a: { side: 'a', ...peerA, binding: bindRichPeerWithUndo(peerA) },
    b: { side: 'b', ...peerB, binding: bindRichPeerWithUndo(peerB) }
  }
}

export function flushMicrotasks(times = 2): Promise<void> {
  return times <= 0
    ? Promise.resolve()
    : new Promise((resolve) => queueMicrotask(() => resolve(flushMicrotasks(times - 1))))
}

function peerBySide(
  peers: { a: BoundRichPeer; b: BoundRichPeer },
  side: ConvergenceSide
): BoundRichPeer {
  return side === 'a' ? peers.a : peers.b
}

export function applyConvergenceOp(
  peers: { a: BoundRichPeer; b: BoundRichPeer },
  op: ConvergenceOp,
  remoteOrigin: string
): void {
  switch (op.kind) {
    case 'localInsert': {
      const peer = peerBySide(peers, op.side)
      simulateInsertText(peer.host, peer.editable, op.text)
      break
    }
    case 'localDelete': {
      const peer = peerBySide(peers, op.side)
      simulateReplaceSelection(peer.host, peer.editable, op.start, op.end, '')
      break
    }
    case 'localBold': {
      const peer = peerBySide(peers, op.side)
      simulateToggleBold(peer.host, peer.editable, op.start, op.end)
      break
    }
    case 'localItalic': {
      const peer = peerBySide(peers, op.side)
      simulateToggleItalic(peer.host, peer.editable, op.start, op.end)
      break
    }
    case 'remoteInsert': {
      const peer = peerBySide(peers, op.side)
      peer.doc.transact(() => peer.yText.insert(op.index, op.text), remoteOrigin)
      break
    }
    case 'remoteDelete': {
      const peer = peerBySide(peers, op.side)
      peer.doc.transact(() => peer.yText.delete(op.index, op.length), remoteOrigin)
      break
    }
    case 'remoteFormat': {
      const peer = peerBySide(peers, op.side)
      peer.doc.transact(
        () => peer.yText.format(op.start, Math.max(0, op.end - op.start), { [op.key]: true }),
        remoteOrigin
      )
      break
    }
    case 'sync': {
      if (op.mode === 'merge') mergeDocs(peers.a.doc, peers.b.doc)
      else if (op.mode === 'aToB') syncDocToTarget(peers.a.doc, peers.b.doc)
      else if (op.mode === 'bToA') syncDocToTarget(peers.b.doc, peers.a.doc)
      else if (op.mode === 'duplicateA') {
        Y.applyUpdate(peers.a.doc, Y.encodeStateAsUpdate(peers.a.doc))
      } else {
        Y.applyUpdate(peers.b.doc, Y.encodeStateAsUpdate(peers.b.doc))
      }
      break
    }
    case 'undo':
      peerBySide(peers, op.side).binding.undo()
      break
    case 'redo':
      peerBySide(peers, op.side).binding.redo()
      break
  }
}

function selectionOffsetsValid(host: HTMLElement): boolean {
  const length = getOperationTextLength(host)
  const sel = host.ownerDocument?.defaultView?.getSelection()
  if (!sel || sel.rangeCount === 0) return true
  const range = sel.getRangeAt(0)
  const offsets = domRangeToOperationOffsets(host, range)
  if (!offsets) return true
  const anchorNode = sel.anchorNode
  const headNode = sel.focusNode
  if (!anchorNode || !headNode) return true
  if (!host.contains(anchorNode) || !host.contains(headNode)) return true
  const anchor = offsets.start
  const head = offsets.end
  return anchor >= 0 && head >= 0 && anchor <= length && head <= length
}

export function countBindingOriginTransactions(
  doc: Y.Doc,
  binding: EditableYjsBinding,
  during: () => void
): number {
  let count = 0
  const handler = (transaction: Y.Transaction) => {
    if (isBindingTransactionOrigin(transaction.origin, binding.transactionOrigin)) count += 1
  }
  doc.on('afterTransaction', handler)
  try {
    during()
  } finally {
    doc.off('afterTransaction', handler)
  }
  return count
}

export function assertRichPeersConverged(
  peers: { a: BoundRichPeer; b: BoundRichPeer },
  context: { seed: number; ops: ConvergenceOp[] }
): void {
  const { a, b } = peers
  const label = `seed=${context.seed} ops=${JSON.stringify(context.ops)}`

  try {
    ensureHostMatchesYText(a)
    ensureHostMatchesYText(b)

    expect(a.yText.toString()).toBe(b.yText.toString())
    expect(JSON.stringify(a.yText.toDelta())).toBe(JSON.stringify(b.yText.toDelta()))
    expect(
      textRunsEqual(textRunsFromYText(a.yText, document), textRunsFromYText(b.yText, document))
    ).toBe(true)

    expect(hostPlainText(a.host)).toBe(a.yText.toString())
    expect(hostPlainText(b.host)).toBe(b.yText.toString())
    expect(hostRichTextMatchesYText(a.host, a.yText, document)).toBe(true)
    expect(hostRichTextMatchesYText(b.host, b.yText, document)).toBe(true)
    expect(textRunsEqual(hostTextRuns(a.host), textRunsFromYText(a.yText, document))).toBe(true)
    expect(textRunsEqual(hostTextRuns(b.host), textRunsFromYText(b.yText, document))).toBe(true)

    expect(selectionOffsetsValid(a.host)).toBe(true)
    expect(selectionOffsetsValid(b.host)).toBe(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nConvergence failure context: ${label}`)
  }
}

export function pickTextIndex(random: () => number, length: number): number {
  if (length <= 0) return 0
  return Math.floor(random() * (length + 1))
}

export function pickDeleteSpan(
  random: () => number,
  length: number
): { start: number; end: number } {
  if (length <= 0) return { start: 0, end: 0 }
  const start = Math.floor(random() * length)
  const end = Math.min(length, start + 1 + Math.floor(random() * 4))
  return { start, end }
}

import * as Y from 'yjs'
import {
  offsetsToRelativePositionJson,
  resolvePresenceSelection
} from '../../src/yjs/relative-position.js'

describe('relative position presence', function () {
  it('roundtrips offsets through relative positions', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'hello world')

    const encoded = offsetsToRelativePositionJson(yText, 6, 11, yText.length)
    const resolved = resolvePresenceSelection(doc, yText, encoded.anchor, encoded.head)

    expect(resolved).toEqual({ anchor: 6, head: 11 })
  })

  it('survives remote insert before the selection', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'world')
    const encoded = offsetsToRelativePositionJson(yText, 2, 2, yText.length)

    yText.insert(0, 'hello ')
    const resolved = resolvePresenceSelection(doc, yText, encoded.anchor, encoded.head)

    expect(resolved).toEqual({ anchor: 8, head: 8 })
  })

  it('survives remote delete overlapping selection', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'abcdef')
    const encoded = offsetsToRelativePositionJson(yText, 2, 4, yText.length)

    yText.delete(1, 3)
    const resolved = resolvePresenceSelection(doc, yText, encoded.anchor, encoded.head)

    expect(resolved).not.toBeNull()
    expect(resolved!.anchor).toBeGreaterThanOrEqual(0)
    expect(resolved!.head).toBeLessThanOrEqual(yText.length)
  })

  it('handles backward selections', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'abcdef')
    const encoded = offsetsToRelativePositionJson(yText, 4, 1, yText.length)
    const resolved = resolvePresenceSelection(doc, yText, encoded.anchor, encoded.head)

    expect(resolved).toEqual({ anchor: 4, head: 1 })
  })

  it('rejects positions on deleted or foreign types', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    const other = doc.getText('other')
    yText.insert(0, 'x')
    other.insert(0, 'y')

    const foreign = offsetsToRelativePositionJson(other, 0, 1, other.length)
    expect(resolvePresenceSelection(doc, yText, foreign.anchor, foreign.head)).toBeNull()
    expect(resolvePresenceSelection(doc, yText, { bad: true }, { bad: true })).toBeNull()
  })
})

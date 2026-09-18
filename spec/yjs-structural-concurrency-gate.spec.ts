/**
 * Gate: concurrent structural split vs tail edit — not solved by Y.Doc.transact alone.
 * See docs/adr/002-structural-edit-concurrency.md
 */
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import {
  captureAnnotationSnapshotsBeforeSplit,
  migrateAnnotationsOnSplit
} from '../src/yjs/annotation-migration.js'
import { moveYTextTailToTarget } from '../src/yjs/structural-ytext.js'
import { AnnotationStore, getOrCreateAnnotationsMap } from '../src/yjs/annotation-store.js'
import { offsetsToRelativePositionJson } from '../src/yjs/relative-position.js'
describe('structural concurrency gate', function () {
  it.fails('integrator structural lock API is not implemented (see ADR 002)', function () {
    expect(
      typeof (globalThis as { editableStructuralEditLock?: unknown }).editableStructuralEditLock
    ).toBe('function')
  })

  it('split migration uses pre-captured snapshots when source text already truncated', function () {
    const doc = new Y.Doc()
    const source = doc.getText('source')
    const target = doc.getText('target')
    source.insert(0, 'headtail')
    const store = new AnnotationStore(getOrCreateAnnotationsMap(doc))
    const positions = offsetsToRelativePositionJson(source, 4, 8, source.length)
    const id = store.create({
      type: 'comment',
      anchor: positions.anchor,
      head: positions.head,
      authorId: 'a',
      data: { body: 'tail' }
    })!

    const snapshots = captureAnnotationSnapshotsBeforeSplit({
      store,
      splitOffset: 4,
      sourceYText: source,
      targetYText: target
    })
    moveYTextTailToTarget(source, 4, target)

    migrateAnnotationsOnSplit({
      store,
      splitOffset: 4,
      sourceYText: source,
      targetYText: target,
      snapshots
    })

    const record = store.get(id!)
    expect(record?.status).toBe('active')
    expect(source.toString()).toBe('head')
    expect(target.toString()).toBe('tail')
  })
})

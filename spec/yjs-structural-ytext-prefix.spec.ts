import * as Y from 'yjs'
import { describe, expect, it, vi } from 'vitest'
import { moveYTextTailToTarget } from '../src/yjs/structural-ytext.js'

describe('moveYTextTailToTarget prefix identity', function () {
  it('deletes only the tail on the source (no full replace of prefix)', function () {
    const doc = new Y.Doc()
    const source = doc.getText('source')
    source.insert(0, 'prefix', { bold: true })
    source.insert(6, 'tail')

    const deleteSpy = vi.spyOn(source, 'delete')
    const insertSpy = vi.spyOn(source, 'insert')

    const target = doc.getText('target')
    moveYTextTailToTarget(source, 6, target)

    expect(source.toString()).toBe('prefix')
    expect(target.toString()).toBe('tail')
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(6, 4)
    expect(insertSpy).not.toHaveBeenCalledWith(0, 'prefix', expect.anything())
    expect(insertSpy).not.toHaveBeenCalledWith(0, 'prefix')
  })
})

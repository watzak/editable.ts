import { yTextDeltaToOperations } from '../../src/yjs/ytext-delta-to-operations.js'

describe('yTextDeltaToOperations', function () {
  it('converts retain + insert', function () {
    expect(yTextDeltaToOperations([{ retain: 2 }, { insert: 'hi' }])).toEqual([
      { type: 'insertText', index: 2, text: 'hi' }
    ])
  })

  it('converts delete', function () {
    expect(yTextDeltaToOperations([{ retain: 1 }, { delete: 3 }])).toEqual([
      { type: 'deleteText', index: 1, length: 3 }
    ])
  })

  it('coalesces delete + insert into replaceText when delete length is positive', function () {
    expect(yTextDeltaToOperations([{ retain: 2 }, { delete: 2 }, { insert: 'xy' }])).toEqual([
      { type: 'replaceText', index: 2, length: 2, text: 'xy' }
    ])
  })

  it('handles emoji as UTF-16 code units', function () {
    expect(yTextDeltaToOperations([{ retain: 1 }, { insert: '😀' }])).toEqual([
      { type: 'insertText', index: 1, text: '😀' }
    ])
  })

  it('handles combining marks', function () {
    expect(yTextDeltaToOperations([{ retain: 1 }, { insert: '\u0301' }])).toEqual([
      { type: 'insertText', index: 1, text: '\u0301' }
    ])
  })

  it('handles line breaks', function () {
    expect(yTextDeltaToOperations([{ insert: 'a\nb' }])).toEqual([
      { type: 'insertText', index: 0, text: 'a\nb' }
    ])
  })
})

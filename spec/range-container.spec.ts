
import {createElement, createRange} from '../src/util/dom.js'
import RangeContainer from '../src/range-container.js'

describe('RangeContainer', function () {
  describe('with no params', function () {
    let range: RangeContainer

    beforeEach(function () {
      range = new RangeContainer()
    })

    it('has nothing selected', function () {
      expect(range.isAnythingSelected).toBe(false)
    })

    it('is no Cursor', function () {
      expect(range.isCursor).toBe(false)
    })

    it('is no Selection', function () {
      expect(range.isSelection).toBe(false)
    })

    describe('getCursor()', function () {

      it('returns undefined', function () {
        expect(range.getCursor()).toBe(undefined)
      })
    })

    describe('getSelection()', function () {

      it('returns undefined', function () {
        expect(range.getSelection()).toBe(undefined)
      })
    })
  })

  describe('with a selection', function () {
    let range: RangeContainer

    beforeEach(function () {
      const elem = createElement('<div>Text</div>') as HTMLElement
      let r = createRange()
      r.selectNodeContents(elem)
      range = new RangeContainer(elem, r)
    })

    it('has something selected', function () {
      expect(range.isAnythingSelected).toBe(true)
    })

    it('is no Cursor', function () {
      expect(range.isCursor).toBe(false)
    })

    it('is a Selection', function () {
      expect(range.isSelection).toBe(true)
    })

    it('can force a cursor', function () {
      expect(range.host.innerHTML).toBe('Text')

      const cursor = range.forceCursor()

      expect(cursor.isCursor).toBe(true)
      expect(range.host.innerHTML).toBe('')
    })
  })

  describe('with a cursor', function () {
    let range: RangeContainer

    beforeEach(function () {
      const elem = createElement('<div>Text</div>') as HTMLElement
      let r = createRange()
      r.selectNodeContents(elem)
      r.collapse(true)
      range = new RangeContainer(elem, r)
    })

    it('has something selected', function () {
      expect(range.isAnythingSelected).toBe(true)
    })

    it('is a Cursor', function () {
      expect(range.isCursor).toBe(true)
    })

    it('is no Selection', function () {
      expect(range.isSelection).toBe(false)
    })
  })
})


import {createRange, createElement} from '../src/util/dom.js'

import * as content from '../src/content.js'
import Cursor from '../src/cursor.js'
import config from '../src/config.js'

describe('Cursor', function () {

  it('is defined', function () {
    expect(Cursor).not.toBe(undefined)
  })

  describe('instantiation', function () {
    let elem: HTMLElement
    let cursor: Cursor

    beforeEach(function () {
      const range = createRange()
      elem = document.createElement('div')
      cursor = new Cursor(elem, range)
    })

    it('creates an instance from a jQuery element', function () {
      expect(cursor.host).toBe(elem)
    })

    it('sets a reference to window', function () {
      expect(cursor.win).toBe(window)
    })
  })

  describe('with a collapsed range at the end', function () {
    let oneWord: HTMLElement
    let range: Range
    let cursor: Cursor

    beforeEach(function () {
      oneWord = createElement(`<div class="${config.editableClass}">foobar</div>`) as HTMLElement
      range = createRange()
      range.selectNodeContents(oneWord)
      range.collapse(false)
      cursor = new Cursor(oneWord, range)
    })

    it('sets #isCursor to true', function () {
      expect(cursor.isCursor).toBe(true)
    })

    it('has a valid range', function () {
      expect(range.collapsed).toBe(true)
      expect(range.startContainer).toBe(oneWord)
      expect(range.endContainer).toBe(oneWord)
      expect(range.startOffset).toBe(1)
      expect(range.endOffset).toBe(1)
    })

    describe('isAtTextEnd()', function () {

      it('returns true when at text end', function () {
        expect(cursor.isAtTextEnd()).toBe(true)
      })
    })

    describe('isAtEnd()', function () {

      it('is true', function () {
        expect(cursor.isAtEnd()).toBe(true)
      })
    })

    describe('isAtBeginning()', function () {

      it('is false', function () {
        expect(cursor.isAtBeginning()).toBe(false)
      })
    })

    describe('save() and restore()', function () {

      it('saves and restores the cursor', function () {
        cursor.save()

        // move the cursor so we can check the restore method.
        cursor.moveAtBeginning()
        expect(cursor.isAtBeginning()).toBe(true)
        expect(cursor.isAtTextEnd()).toBe(false)

        cursor.restore()
        expect(cursor.isAtEnd()).toBe(true)
      })
    })

    describe('insertAfter()', function () {

      it('can deal with an empty documentFragment', function () {
        expect(() => {
          const frag = window.document.createDocumentFragment()
          cursor.insertAfter(frag)
        }).not.toThrow()
      })
    })

    describe('insertBefore()', function () {

      it('can deal with an empty documentFragment', function () {
        expect(() => {
          const frag = window.document.createDocumentFragment()
          cursor.insertBefore(frag)
        }).not.toThrow()
      })
    })

    describe('before()', function () {

      it('gets the content before', function () {
        const fragment = cursor.before()
        expect(content.getInnerHtmlOfFragment(fragment)).toBe('foobar')
      })
    })

    describe('textBefore()', function () {

      it('gets the text before', function () {
        const textBefore = cursor.textBefore()
        expect(textBefore).toBe('foobar')
      })
    })

    describe('beforeHtml()', function () {

      it('gets the content before', function () {
        expect(cursor.beforeHtml()).toBe('foobar')
      })
    })

    describe('after()', function () {

      it('gets the content after', function () {
        const fragment = cursor.after()
        expect(content.getInnerHtmlOfFragment(fragment)).toBe('')
      })
    })

    describe('textAfter()', function () {

      it('gets the text after', function () {
        const textAfter = cursor.textAfter()
        expect(textAfter).toBe('')
      })
    })

    describe('afterHtml()', function () {

      it('gets the content before', function () {
        expect(cursor.afterHtml()).toBe('')
      })
    })

    describe('getInnerTags', function () {

      it('gets the inner tags covered by the cursor', function () {
        expect(cursor.getInnerTags()).toEqual([])
      })
    })

    describe('getAncestorTags', function () {

      it('gets all ancestor tags of the cursor', function () {
        expect(cursor.getAncestorTags()).toEqual([])
      })
    })
  })
})

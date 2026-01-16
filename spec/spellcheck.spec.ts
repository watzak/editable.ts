
import {vi} from 'vitest'
import {Editable} from '../src/core.js'
import MonitoredHighlighting from '../src/monitored-highlighting.js'
import Cursor from '../src/cursor.js'
import {createElement, createRange} from '../src/util/dom.js'

describe('Spellcheck:', function () {
  let editable

  // Helpers

  function createCursor (host, elem, offset) {
    const range = createRange()
    range.setStart(elem, offset)
    range.setEnd(elem, offset)
    return new Cursor(host, range)
  }

  // Specs

  beforeEach(function () {
    editable = new Editable()
  })

  afterEach(function () {
    editable.unload()
  })

  describe('with a simple sentence', function () {
    let p, errors, highlighting

    beforeEach(function () {
      p = createElement('<p>A simple sentence.</p>')

      // The spellcheck has a safeguard against disconnected elments
      // so we need to append the element to the document.
      window.document.body.appendChild(p)

      errors = ['simple']
      highlighting = new MonitoredHighlighting(editable, {
        spellcheck: {
          marker: '<span class="misspelled-word"></span>',
          spellcheckService: (text, callback) => {
            callback(errors)
          }
        }
      })
    })

    afterEach(function () {
      p.remove()
    })

    describe('highlight()', function () {

      it('calls highlightMatches()', function () {
        const highlightMatches = vi.spyOn(highlighting, 'highlightMatches')
        highlighting.highlight(p)
        expect(highlightMatches).toHaveBeenCalled()
      })

      it('highlights a match with the given marker node', function () {
        highlighting.highlight(p)
        expect(p.querySelectorAll('.misspelled-word').length).toBe(1)
      })

      it('notify spellcheckUpdated on add highlight through spellcheck', function () {
        let called = 0
        editable.on('spellcheckUpdated', () => called++)
        highlighting.highlight(p, true)
        expect(called).toBe(1)
      })

      it('removes a corrected highlighted match.', function () {
        highlighting.highlight(p)
        let misspelledWord = p.querySelectorAll('.misspelled-word')
        expect(misspelledWord.length).toBe(1)

        // correct the error
        misspelledWord[0].innerHTML = 'simpler'
        errors = []

        highlighting.highlight(p)

        misspelledWord = p.querySelectorAll('.misspelled-word')
        expect(misspelledWord.length).toBe(0)
      })

      it('match highlights are marked with "ui-unwrap"', function () {
        highlighting.highlight(p)
        const spellcheck = p.querySelector('.misspelled-word')
        const dataEditable = spellcheck.getAttribute('data-editable')
        expect(dataEditable).toBe('ui-unwrap')
      })

      it('calls highlight() for an empty wordlist', function () {
        const highlight = vi.spyOn(highlighting, 'highlight')
        highlighting.config.spellcheckService = function (text, callback) {
          callback([])
        }
        highlighting.highlight(p)
        expect(highlight).toHaveBeenCalled()
      })

      it('calls highlight() for an undefined wordlist', function () {
        const highlight = vi.spyOn(highlighting, 'highlight')
        highlighting.config.spellcheckService = function (text, callback) {
          callback()
        }
        highlighting.highlight(p)
        expect(highlight).toHaveBeenCalled()
      })
    })

    describe('removeHighlights()', function () {

      it('removes the highlights', function () {
        highlighting.highlight(p)
        expect(p.querySelectorAll('.misspelled-word').length).toBe(1)
        highlighting.removeHighlights(p)
        expect(p.querySelectorAll('.misspelled-word').length).toBe(0)
      })
    })

    describe('removeHighlightsAtCursor()', function () {
      let highlight

      beforeEach(function () {
        highlighting.highlight(p)
        highlight = p.querySelector('.misspelled-word')
      })

      afterEach(function () {
        vi.restoreAllMocks()
      })

      it('does remove the highlights if cursor is within a match', function () {
        vi.spyOn(editable, 'getSelection').mockImplementation(() => createCursor(p, highlight, 0))

        highlighting.removeHighlightsAtCursor(p)
        expect(p.querySelectorAll('.misspelled-word').length).toBe(0)
      })

      it('does not remove the highlights config.removeOnCorrection is set to false', function () {
        highlighting.config.removeOnCorrection = false
        vi.spyOn(editable, 'getSelection').mockImplementation(() => createCursor(p, highlight, 0))

        highlighting.onChange(p)
        expect(p.querySelectorAll('.misspelled-word').length).toBe(1)
      })

      it('does not remove the highlights if cursor is within a match of highlight type != spellcheck', function () {
        p.querySelector('.misspelled-word').setAttribute('data-highlight', 'comment')
        vi.spyOn(editable, 'getSelection').mockImplementation(() => createCursor(p, highlight, 0))

        highlighting.removeHighlightsAtCursor(p)
        expect(p.querySelectorAll('.misspelled-word').length).toBe(1)
      })

      it('does not remove the highlights if cursor is outside a match', function () {
        vi.spyOn(editable, 'getSelection').mockImplementation(() => createCursor(p, p.firstChild, 0))

        highlighting.removeHighlightsAtCursor(p)
        expect(p.querySelectorAll('.misspelled-word').length).toBe(1)
      })
    })

    describe('retains cursor position', function () {

      it('in the middle of a text node', function () {
        const cursor = createCursor(p, p.firstChild, 4)
        cursor.save()
        highlighting.highlight(p)
        cursor.restore()

        // These are the child nodes of the paragraph we expect after restoring the cursor:
        // 'A |span|span| sentence.'
        //
        // The cursor should be positioned between the two marker <span> elements.
        expect(cursor.range.startContainer).toBe(p)
        expect(cursor.range.startOffset).toBe(2)

        // The storing of the cursor position will have split up the text node,
        // so now we have two markers in the editable.
        expect(p.querySelectorAll('.misspelled-word').length).toBe(2)
      })
    })
  })
})

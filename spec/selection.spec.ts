

import {Editable} from '../src/core.js'
import Selection from '../src/selection.js'
import Cursor from '../src/cursor.js'
import config from '../src/config.js'
import {createElement, createRange} from '../src/util/dom.js'

describe('Selection', function () {

  it('should be defined', function () {
    expect(typeof Selection).toBe('function')
  })

  describe('insertCharacter()', function () {
    let div, selection

    beforeEach(function () {
      div = createElement('<div>f</div>')
      const range = createRange()
      range.selectNodeContents(div)
      selection = new Selection(div, range)
    })

    it('returns a cursor', function () {
      const cursor = selection.insertCharacter('x')
      expect(cursor.isCursor).toBe(true)
    })

    it('replaces the selection with the character', function () {
      selection.insertCharacter('x')
      expect(div.innerHTML).toBe('x')
    })

    it('inserts the text before the cursor', function () {
      const cursor = selection.insertCharacter('x')
      expect(cursor.beforeHtml()).toBe('x')
    })

    it('inserts an emoji', function () {
      selection.insertCharacter('😘')
      expect(div.innerHTML).toBe('😘')
    })
  })

  describe('removeChars()', function () {

    it('removes multiple characters', function () {
      const div = createElement('<div>«Foo "bar" foo»</div>')
      const range = createRange()
      range.selectNodeContents(div)
      const selection = new Selection(div, range)

      selection.removeChars(['«', '»', '"'])
      expect(div.innerHTML).toBe('Foo bar foo')
    })
  })

  describe('textBefore() / textAfter()', function () {
    let selection

    beforeEach(function () {
      // <div>a|b|c</div>
      const host = createElement('<div>abc</div>')
      const range = createRange()
      range.setStart(host.firstChild, 1)
      range.setEnd(host.firstChild, 2)

      selection = new Selection(host, range)
    })

    it('returns the text before', function () {
      const textBefore = selection.textBefore()
      expect(textBefore).toBe('a')
    })

    it('returns the text after', function () {
      const textAfter = selection.textAfter()
      expect(textAfter).toBe('c')
    })
  })

  describe('deleteExactSurroundingTags:', function () {
    it('deletes the farest ancestor that exactly surrounds the selection', function () {
      const content = createElement('<p>text <strong><em>italic</em></strong> text</p>')
      const em = content.getElementsByTagName('em')[0]
      const range = createRange()
      range.setStart(em, 0)
      range.setEnd(em, 1)
      let selection = new Selection(content, range)
      selection = selection.deleteExactSurroundingTags()
      expect(selection.host.innerHTML).toBe('text  text')
    })
  })

  describe('deleteContainedTags:', function () {
    it('deletes all the tags whose content is completely within the current selection: ', function () {
      const content = createElement('<p>text <strong>bold</strong> text')
      const range = createRange()
      range.setStart(content, 1)
      range.setEnd(content, 3)
      let selection = new Selection(content, range)
      selection = selection.deleteContainedTags()
      expect(selection.host.innerHTML).toBe('text  text')
    })
  })

  describe('with a range', function () {
    let oneWord, selection

    beforeEach(function () {
      oneWord = createElement('<div>foobar</div>')
      const range = createRange()
      range.selectNodeContents(oneWord)
      selection = new Selection(oneWord, range)
    })

    it('sets a reference to window', function () {
      expect(selection.win).toBe(window)
    })

    it('sets #isSelection to true', function () {
      expect(selection.isSelection).toBe(true)
    })

    describe('isAllSelected()', function () {

      it('returns true if all is selected', function () {
        expect(selection.isAllSelected()).toBe(true)
      })

      it('returns false if not all is selected', function () {
        const textNode = oneWord.firstChild
        let range = createRange()
        range.setStartBefore(textNode)
        range.setEnd(textNode, 6)
        let newSelection = new Selection(oneWord, range)
        expect(newSelection.isAllSelected()).toBe(true)

        range = createRange()
        range.setStartBefore(textNode)
        range.setEnd(textNode, 5)
        newSelection = new Selection(oneWord, range)
        expect(newSelection.isAllSelected()).toBe(false)
      })
    })

    describe('custom:', function () {
      let customElement

      beforeEach(function () {
        customElement = {tagName: 'span', attributes: {class: 'foo'}}
      })

      it('makes the selection custom tag with the configured attributes', function () {
        selection.makeCustom(customElement)
        const customTags = selection.getTagsByName(customElement.tagName)
        const html = getHtml(customTags[0])
        expect(html).toBe('<span class="foo">foobar</span>')
      })

      it('toggles the custom selection', function () {
        selection.makeCustom(customElement)
        selection.toggleCustom(customElement)
        const customTags = selection.getTagsByName(customElement.tagName)
        expect(customTags.length).toBe(0)
      })
    })

    describe('bold:', function () {
      let oldBoldMarkup

      beforeEach(function () {
        oldBoldMarkup = config.boldMarkup
        config.boldMarkup = {
          type: 'tag',
          name: 'strong',
          attribs: {
            'class': 'foo'
          }
        }
      })

      afterEach(function () {
        config.boldMarkup = oldBoldMarkup
      })

      it('makes the selection bold with the configured class', function () {
        selection.makeBold()
        const boldTags = selection.getTagsByName('strong')
        const html = getHtml(boldTags[0])
        expect(html).toBe('<strong class="foo">foobar</strong>')
      })

      it('toggles the bold selection', function () {
        selection.makeBold()
        selection.toggleBold()
        const boldTags = selection.getTagsByName('strong')
        expect(boldTags.length).toBe(0)
      })
    })

    describe('italic:', function () {
      let oldItalicMarkup

      beforeEach(function () {
        oldItalicMarkup = config.italicMarkup
        config.italicMarkup = {
          type: 'tag',
          name: 'em',
          attribs: {
            'class': 'bar'
          }
        }
      })

      afterEach(function () {
        config.italicMarkup = oldItalicMarkup
      })

      it('makes the selection italic with the configured class', function () {
        selection.giveEmphasis()
        const emphasisTags = selection.getTagsByName('em')
        const html = getHtml(emphasisTags[0])
        expect(html).toBe('<em class="bar">foobar</em>')
      })

      it('toggles the italic selection', function () {
        selection.giveEmphasis()
        selection.toggleEmphasis()
        const emphasisTags = selection.getTagsByName('em')
        expect(emphasisTags.length).toBe(0)
      })
    })

    describe('underline:', function () {
      let oldUnderlineMarkup

      beforeEach(function () {
        oldUnderlineMarkup = config.underlineMarkup
        config.underlineMarkup = {
          type: 'tag',
          name: 'u',
          attribs: {
            'class': 'bar'
          }
        }
      })

      afterEach(function () {
        config.underlineMarkup = oldUnderlineMarkup
      })

      it('makes the selection underline with the configured class', function () {
        selection.makeUnderline()
        const underlineTags = selection.getTagsByName('u')
        const html = getHtml(underlineTags[0])
        expect(html).toBe('<u class="bar">foobar</u>')
      })

      it('toggles the underline selection', function () {
        selection.makeUnderline()
        selection.toggleUnderline()
        const underlineTags = selection.getTagsByName('u')
        expect(underlineTags.length).toBe(0)
      })
    })

    describe('links:', function () {
      let oldLinkMarkup

      beforeEach(function () {
        oldLinkMarkup = config.italicMarkup
        config.linkMarkup = {
          type: 'tag',
          name: 'a',
          attribs: {
            'class': 'foo bar'
          }
        }
      })

      afterEach(function () {
        config.linkMarkup = oldLinkMarkup
      })

      it('sets a link with the configured class', function () {
        selection.link('https://livingdocs.io')
        const linkTags = selection.getTagsByName('a')
        const html = getHtml(linkTags[0])
        expect(html).toBe('<a class="foo bar" href="https://livingdocs.io">foobar</a>')
      })

      it('toggles a link', function () {
        selection.link('https://livingdocs.io')
        selection.toggleLink()
        const linkTags = selection.getTagsByName('a')
        expect(linkTags.length).toBe(0)
      })

      it('removes a link', function () {
        selection.link('https://livingdocs.io')
        selection.unlink()
        const linkTags = selection.getTagsByName('a')
        expect(linkTags.length).toBe(0)
      })

      it('sets class attribute', function () {
        selection.link('https://livingdocs.io', {class: 'baz'})
        const linkTags = selection.getTagsByName('a')
        const html = getHtml(linkTags[0])
        expect(html).toBe('<a class="baz" href="https://livingdocs.io">foobar</a>')
      })

      it('removes class attribute when set to null', function () {
        selection.link('https://livingdocs.io', {class: null})
        const linkTags = selection.getTagsByName('a')
        const html = getHtml(linkTags[0])
        expect(html).toBe('<a href="https://livingdocs.io">foobar</a>')
      })

      it('does not modify class attribute when set to undefined', function () {
        selection.link('https://livingdocs.io', {class: undefined})
        const linkTags = selection.getTagsByName('a')
        const html = getHtml(linkTags[0])
        expect(html).toBe('<a class="foo bar" href="https://livingdocs.io">foobar</a>')
      })

      describe('with bold:', function () {
        let oldBoldMarkup

        beforeEach(function () {
          oldBoldMarkup = config.boldMarkup
          config.boldMarkup = {
            type: 'tag',
            name: 'strong',
            attribs: {
              'class': 'foo'
            }
          }
        })

        afterEach(function () {
          config.boldMarkup = oldBoldMarkup
        })

        it('toggles a link bold', function () {
          selection.link('https://livingdocs.io')
          selection.makeBold()
          const boldTags = selection.getTagsByName('strong')
          const html = getHtml(boldTags[0])
          expect(html).toBe('<strong class="foo"><a class="foo bar" href="https://livingdocs.io">foobar</a></strong>')
        })

        it('toggles a link bold in a selection with text after', function () {
          // set foo in <div>|foo|bar</div> as the selection
          let range = createRange()
          range.setStart(oneWord.firstChild, 0)
          range.setEnd(oneWord.firstChild, 3)
          let newSelection = new Selection(oneWord, range)
          // link foo
          newSelection.link('https://livingdocs.io')
          oneWord.normalize()

          // select 1 char more to the right (b)
          range = createRange()
          // Note: we need to use firstChild twice to get the textNode inside the a tag which is
          // also what the normal browser select behavior does
          range.setStart(oneWord.firstChild.firstChild, 0)
          range.setEnd(oneWord.lastChild, 1)
          newSelection = new Selection(oneWord, range)
          // make link + b char bold
          newSelection.toggleBold()
          const html = getHtml(oneWord)
          expect(html).toBe('<div><strong class="foo"><a class="foo bar" href="https://livingdocs.io">foo</a>b</strong>ar</div>')
        })

        it('toggles a link bold in a selection with text before', function () {
          // set bar in <div>foo|bar|</div> as the selection
          let range = createRange()
          range.setStart(oneWord.firstChild, 3)
          range.setEnd(oneWord.firstChild, 6)
          let newSelection = new Selection(oneWord, range)
          // link bar
          newSelection.link('https://livingdocs.io')
          oneWord.normalize()

          // select 1 char more to the left (o)
          range = createRange()
          range.setStart(oneWord.firstChild, 2)
          range.setEnd(oneWord.lastChild.firstChild, 3)
          newSelection = new Selection(oneWord, range)
          // make o char + link bold
          newSelection.toggleBold()
          const html = getHtml(oneWord)
          expect(html).toBe('<div>fo<strong class="foo">o<a class="foo bar" href="https://livingdocs.io">bar</a></strong></div>')
        })
      })
    })

  })

  describe('triming:', function () {
    let wordWithWhitespace, selection, oldLinkMarkup, oldUnderlineMarkup

    beforeEach(function () {
      wordWithWhitespace = createElement('<div> foobar </div>')
      const range = createRange()
      range.selectNodeContents(wordWithWhitespace.firstChild)
      selection = new Selection(wordWithWhitespace, range)

      oldLinkMarkup = config.italicMarkup
      config.linkMarkup = {
        type: 'tag',
        name: 'a',
        attribs: {
          'class': 'foo bar'
        },
        trim: true
      }

      oldUnderlineMarkup = config.underlineMarkup
      config.underlineMarkup = {
        type: 'tag',
        name: 'u',
        attribs: {
          'class': 'bar'
        },
        trim: false
      }
    })

    afterEach(function () {
      config.linkMarkup = oldLinkMarkup
      config.underlineMarkup = oldUnderlineMarkup
    })

    it('trims whitespaces from range when linking', function () {
      selection.link('https://livingdocs.io')
      const linkTags = selection.getTagsByName('a')
      const html = getHtml(linkTags[0])
      expect(html).toBe('<a class="foo bar" href="https://livingdocs.io">foobar</a>')
    })

    it('does not trim whitespaces from range when underlining', function () {
      selection.makeUnderline()
      const underlineTags = selection.getTagsByName('u')
      const html = getHtml(underlineTags[0])
      expect(html).toBe('<u class="bar"> foobar </u>')
    })

    it('trims a range with special whitespaces', function () {
      // At the beginning we have U+2002, U+2005, U+2006, U+FEFF.
      // At the end a normal whitespace.
      // Note: U+200B is not handled by regular expression \s whitespace.
      const wordWithSpecialWhitespaces = createElement('<div>   ﻿bar </div>')
      const range = createRange()
      range.selectNodeContents(wordWithSpecialWhitespaces.firstChild)
      const selection = new Selection(wordWithSpecialWhitespaces, range)
      selection.trimRange()
      expect(selection.range.startOffset).toBe(4)
      expect(selection.range.endOffset).toBe(7)
    })

    it('does trim if only a whitespace is selected', function () {
      const whitespaceOnly = createElement('<div> </div>')
      const range = createRange()
      range.selectNodeContents(whitespaceOnly.firstChild)
      const selection = new Selection(whitespaceOnly, range)
      selection.trimRange()
      expect(selection.toString()).toBe('')
    })

    it('trims a custom element if the param is given', function () {
      selection.toggleCustom({tagName: 'span', attributes: {class: 'foo'}, trim: true})
      const spanTags = selection.getTagsByName('span')
      const html = getHtml(spanTags[0])
      expect(html).toBe('<span class="foo">foobar</span>')
    })

    it('does not apply tags to whitespace when toggling', function () {
      const range = createRange()
      range.setStart(wordWithWhitespace.firstChild, 0)
      range.setEnd(wordWithWhitespace.firstChild, 1)
      const newSelection = new Selection(wordWithWhitespace, range)
      newSelection.toggleBold()
      expect(newSelection.toString()).toBe('')
      expect(wordWithWhitespace.innerHTML).toBe(' foobar ')
    })

    it('does not apply tags to whitespace when wrapping', function () {
      const range = createRange()
      range.setStart(wordWithWhitespace.firstChild, 0)
      range.setEnd(wordWithWhitespace.firstChild, 1)
      const newSelection = new Selection(wordWithWhitespace, range)
      newSelection.makeBold()
      expect(newSelection.toString()).toBe('')
      expect(wordWithWhitespace.innerHTML).toBe(' foobar ')
    })

    it('handles nodes and characters', function () {
      // Split word into three nodes: ` `, `foo`, `bar `
      const range = createRange()
      range.setStart(wordWithWhitespace.firstChild, 1)
      range.setEnd(wordWithWhitespace.firstChild, 4)
      const newSelection = new Selection(wordWithWhitespace, range)
      newSelection.save()
      newSelection.restore()

      // Select specific characters within nodes across multiple nodes
      const rangeTwo = createRange()
      rangeTwo.setStart(wordWithWhitespace, 0) // Select first node (start)
      rangeTwo.setEnd(wordWithWhitespace.childNodes[2], 2) // Select middle of last node
      const selectionTwo = new Selection(wordWithWhitespace, rangeTwo)
      selectionTwo.makeBold()

      expect(wordWithWhitespace.innerHTML).toBe(' <strong>fooba</strong>r ')
    })
  })

  describe('inherits form Cursor', function () {

    it('has isAtEnd() method from Cursor in its protoype chain', function () {
      expect(Selection.prototype.hasOwnProperty('isAtEnd')).toBe(false)
      expect(Cursor.prototype.hasOwnProperty('isAtEnd')).toBe(true)
      expect('isAtEnd' in Selection.prototype).toBe(true)
    })
  })

  describe('plain text host', function () {
    let editable

    beforeEach(function () {
      editable = new Editable()
    })

    describe('with regular text', function () {
      let div, selection

      beforeEach(function () {
        div = createElement('<div>regular text</div>')
        const range = createRange()
        range.selectNodeContents(div)
        selection = new Selection(div, range)

        editable.enable(div, {plainText: true})
      })

      it('should not make regular text bold on toggle', function () {
        selection.toggleBold()
        expect(div.innerHTML).toBe('regular text')
      })

      it('should not make regular text bold on forceWrap', function () {
        selection.makeBold()
        expect(div.innerHTML).toBe('regular text')
      })

      it('should not make regular text italic on toggle', function () {
        selection.toggleEmphasis()
        expect(div.innerHTML).toBe('regular text')
      })

      it('should not make regular text italic on forceWrap', function () {
        selection.giveEmphasis()
        expect(div.innerHTML).toBe('regular text')
      })

      afterEach(function () {
        editable.disable(div)
      })
    })
  })
})

const getHtml = function (tag) {
  const testTag = window.document.createElement('div')
  testTag.appendChild(tag)
  return testTag.innerHTML
}

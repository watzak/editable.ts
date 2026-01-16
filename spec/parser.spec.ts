
import {createRange, createElement} from '../src/util/dom.js'

import * as parser from '../src/parser.js'
import config from '../src/config.js'

describe('Parser', function () {
  // helper methods
  function createCursorAfter (node) {
    const range = createRange()
    range.setStartAfter(node)
    range.setEndAfter(node)
    return range
  }

  function createCursorAtEnd (node) {
    const range = createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    return range
  }

  // test elements
  const empty = createElement('<div></div>')
  const linebreak = createElement('<div><br></div>')
  const emptyWithWhitespace = createElement('<div> </div>')
  const singleCharacter = createElement('<div>a</div>')
  const oneWord = createElement('<div>foobar</div>')
  const oneWordWithWhitespace = createElement('<div> foobar </div>')
  const oneWordWithNbsp = createElement('<div>&nbsp;foobar&nbsp;</div>')
  const textNode = oneWord.firstChild
  const text = createElement('<div>foo bar.</div>')
  const textWithLink = createElement('<div>foo <a href="#">bar</a>.</div>')
  const linkWithWhitespace = createElement('<div><a href="#">bar</a> </div>')
  const link = createElement('<div><a href="#">foo bar</a></div>')
  const linkWithSpan = createElement('<div><a href="#">foo <span class="important">bar</span></a></div>')

  describe('getHost()', function () {
    let host

    beforeEach(function () {
      host = createElement(`<div class="${config.editableClass}""></div>`)
    })

    it('works if host is passed', function () {
      expect(parser.getHost(host)).toBe(host)
    })

    it('works if a child of host is passed', function () {
      host.innerHTML = 'a<em>b</em>'
      expect(parser.getHost(host.querySelector('em'))).toBe(host)
    })

    it('works if a text node is passed', function () {
      host.innerHTML = 'a<em>b</em>'
      expect(parser.getHost(host.firstChild)).toBe(host)
    })
  })

  describe('getNodeIndex()', function () {

    it('gets element index of link in text', function () {
      const linkNode = textWithLink.querySelector('a')
      expect(parser.getNodeIndex(linkNode)).toBe(1)
    })
  })

  describe('isVoid()', function () {

    it('detects an empty node', function () {
      expect(empty.childNodes.length).toBe(0)
      expect(parser.isVoid(empty)).toBe(true)
    })

    it('detects an non-empty node', function () {
      expect(emptyWithWhitespace.childNodes.length).toBe(1)
      expect(parser.isVoid(emptyWithWhitespace)).toBe(false)
    })
  })

  describe('isWhitespaceOnly()', function () {

    it('works with void element', function () {
      const node = document.createTextNode('')
      expect(parser.isWhitespaceOnly(node)).toBe(true)
    })

    it('works with single whitespace', function () {
      expect(parser.isWhitespaceOnly(emptyWithWhitespace.firstChild)).toBe(true)
    })

    it('works with a single character', function () {
      expect(parser.isWhitespaceOnly(singleCharacter.firstChild)).toBe(false)
    })

    it('ignores whitespace after the last element', function () {
      expect(parser.isWhitespaceOnly(link.firstChild)).toBe(false)
    })
  })

  describe('lastOffsetWithContent()', function () {

    describe('called with a text node', function () {

      it('works for single character', function () {
        // <div>a|</div>
        expect(parser.lastOffsetWithContent(singleCharacter.firstChild)).toBe(1)
      })

      it('works with a single word text node', function () {
        // <div>foobar|</div>
        expect(parser.lastOffsetWithContent(oneWord.firstChild)).toBe(6)
      })

      it('works with a single word text node with whitespace', function () {
        // <div> foobar| </div>
        expect(parser.lastOffsetWithContent(oneWordWithWhitespace.firstChild)).toBe(7)
      })
    })

    describe('called with an element node', function () {
      it('works with an empty tag', function () {
        // <div></div>
        expect(parser.lastOffsetWithContent(empty)).toBe(0)
      })

      it('works with a single character', function () {
        // <div>a</div>
        expect(parser.lastOffsetWithContent(singleCharacter)).toBe(1)
      })

      it('works with whitespace after last tag', function () {
        // <div><a href="#">bar</a> </div>
        expect(parser.lastOffsetWithContent(linkWithWhitespace)).toBe(1)
      })

      it('works with whitespace after last tag', function () {
        // <div>foo <a href="#">bar</a>.</div>
        expect(parser.lastOffsetWithContent(textWithLink)).toBe(3)
      })
    })
  })

  describe('isEndOffset()', function () {

    it('works for single child node', function () {
      // <div>foobar|</div>
      const range = createCursorAfter(oneWord.firstChild)
      expect(range.endOffset).toBe(1)
      expect(parser.isEndOffset(oneWord, 1)).toBe(true)
    })

    it('works for empty node', function () {
      // <div>|</div>
      const range = createCursorAtEnd(empty)
      expect(parser.isEndOffset(empty, range.endOffset)).toBe(true)
    })

    it('works with a text node', function () {
      // foobar|
      expect(parser.isEndOffset(textNode, 6)).toBe(true)

      // fooba|r
      expect(parser.isEndOffset(textNode, 5)).toBe(false)
    })

    it('works with whitespace at the end', function () {
      // <div> foobar| </div>
      expect(parser.isEndOffset(oneWordWithWhitespace.firstChild, 7)).toBe(false)
      // <div> foobar |</div>
      expect(parser.isEndOffset(oneWordWithWhitespace.firstChild, 8)).toBe(true)
    })

    it('works with text and element nodes', function () {
      // <div>foo <a href='#'>bar</a>.|</div>
      let range = createCursorAfter(textWithLink.childNodes[2])
      expect(range.endOffset).toBe(3)
      expect(parser.isEndOffset(textWithLink, 3)).toBe(true)

      // <div>foo <a href='#'>bar</a>|.</div>
      range = createCursorAfter(textWithLink.childNodes[1])
      expect(range.endOffset).toBe(2)
      expect(parser.isEndOffset(textWithLink, 2)).toBe(false)
    })
  })

  describe('isTextEndOffset()', function () {

    it('ignores whitespace at the end', function () {
      // <div> fooba|r </div>
      expect(parser.isTextEndOffset(oneWordWithWhitespace.firstChild, 6)).toBe(false)
      // <div> foobar| </div>
      expect(parser.isTextEndOffset(oneWordWithWhitespace.firstChild, 7)).toBe(true)
      // <div> foobar |</div>
      expect(parser.isTextEndOffset(oneWordWithWhitespace.firstChild, 8)).toBe(true)
    })

    it('ignores non-breaking-space at the end', function () {
      // <div> fooba|r </div>
      expect(parser.isTextEndOffset(oneWordWithNbsp.firstChild, 6)).toBe(false)
      // <div> foobar| </div>
      expect(parser.isTextEndOffset(oneWordWithNbsp.firstChild, 7)).toBe(true)
      // <div> foobar |</div>
      expect(parser.isTextEndOffset(oneWordWithNbsp.firstChild, 8)).toBe(true)
    })

    it('ignores whitespace after the last element', function () {
      // <div><a href="#">bar|</a> </div>
      expect(parser.isTextEndOffset(linkWithWhitespace.firstChild.firstChild, 2)).toBe(false)
      // <div><a href="#">bar|</a> </div>
      expect(parser.isTextEndOffset(linkWithWhitespace.firstChild.firstChild, 3)).toBe(true)
    })

    it('ignores whitespace after the last element', function () {
      // <div><a href="#">bar|</a> </div>
      const range = createCursorAfter(linkWithWhitespace.firstChild.firstChild)
      expect(range.endOffset).toBe(1)
      expect(parser.isTextEndOffset(linkWithWhitespace.firstChild, 1)).toBe(true)
      expect(parser.isTextEndOffset(linkWithWhitespace.firstChild, 0)).toBe(false)
    })

    it('ignores whitespace after the last element', function () {
      // <div><a href="#">bar</a>| </div>
      const range = createCursorAfter(linkWithWhitespace.firstChild)
      expect(range.endOffset).toBe(1)
      expect(parser.isTextEndOffset(linkWithWhitespace, 1)).toBe(true)
      expect(parser.isTextEndOffset(linkWithWhitespace, 0)).toBe(false)
    })

    it('ignores a linebreak', function () {
      // <div>|<br></div>
      const range = createRange()
      range.selectNodeContents(linebreak)
      range.collapse(true)
      expect(range.endOffset).toBe(0)
      expect(parser.isTextEndOffset(linebreak, 0)).toBe(true)
    })
  })

  describe('isStartOffset()', function () {

    it('works for single child node', function () {
      // <div>|foobar</div>
      expect(parser.isStartOffset(oneWord, 0)).toBe(true)
    })

    it('works for empty node', function () {
      // <div>|</div>
      expect(parser.isStartOffset(empty, 0)).toBe(true)
    })

    it('works with a text node', function () {
      // |foobar
      expect(parser.isStartOffset(textNode, 0)).toBe(true)

      // f|oobar
      expect(parser.isStartOffset(textNode, 1)).toBe(false)
    })

    it('works with whitespace at the beginning', function () {
      // <div> |foobar </div>
      expect(parser.isStartOffset(oneWordWithWhitespace.firstChild, 1)).toBe(false)
      // <div>| foobar </div>
      expect(parser.isStartOffset(oneWordWithWhitespace.firstChild, 0)).toBe(true)
    })

    it('works with text and element nodes', function () {
      // <div>|foo <a href='#'>bar</a>.</div>
      expect(parser.isStartOffset(textWithLink, 0)).toBe(true)

      // <div>foo <a href='#'>|bar</a>.</div>
      expect(parser.isStartOffset(textWithLink, 1)).toBe(false)
    })
  })

  describe('isEndOfHost()', function () {

    it('works with text node in nested content', function () {
      const endContainer = linkWithSpan.querySelector('span').firstChild
      // <div><a href='#'>foo <span class='important'>bar|</span></a></div>
      expect(parser.isEndOfHost(linkWithSpan, endContainer, 3)).toBe(true)

      // <div><a href='#'>foo <span class='important'>ba|r</span></a></div>
      expect(parser.isEndOfHost(linkWithSpan, endContainer, 2)).toBe(false)
    })

    it('works with link node in nested content', function () {
      // <div><a href='#'>foo <span class='important'>bar</span>|</a></div>
      const endContainer = linkWithSpan.querySelector('a')
      const range = createCursorAtEnd(endContainer)
      expect(range.endOffset).toBe(2)
      expect(parser.isEndOfHost(linkWithSpan, endContainer, 2)).toBe(true)

      // <div><a href='#'>foo |<span class='important'>bar</span></a></div>
      expect(parser.isEndOfHost(linkWithSpan, endContainer, 1)).toBe(false)
    })

    it('works with single text node', function () {
      // <div>foobar|</div>
      const endContainer = oneWord.firstChild
      expect(parser.isEndOfHost(oneWord, endContainer, 6)).toBe(true)
      expect(parser.isEndOfHost(oneWord, endContainer, 5)).toBe(false)
    })
  })

  describe('isBeginningOfHost()', function () {

    it('works with link node in nested content', function () {
      const endContainer = linkWithSpan.querySelector('a')
      // <div><a href='#'>|foo <span class='important'>bar</span></a></div>
      expect(parser.isBeginningOfHost(linkWithSpan, endContainer, 0)).toBe(true)

      // <div><a href='#'>foo <span class='important'>|bar</span></a></div>
      expect(parser.isBeginningOfHost(linkWithSpan, endContainer, 1)).toBe(false)
    })

    it('works with single text node', function () {
      const endContainer = oneWord.firstChild
      // <div>|foobar</div>
      expect(parser.isBeginningOfHost(oneWord, endContainer, 0)).toBe(true)

      // <div>f|oobar</div>
      expect(parser.isBeginningOfHost(oneWord, endContainer, 1)).toBe(false)
    })
  })

  describe('isSameNode()', function () {

    it('fails when tags are different', function () {
      const source = text.firstChild
      const target = link.firstChild
      expect(parser.isSameNode(target, source)).toBe(false)
    })

    it('fails when attributes are different', function () {
      const source = link.firstChild
      const target = link.firstChild.cloneNode(true)
      target.setAttribute('key', 'value')
      expect(parser.isSameNode(target, source)).toBe(false)
    })

    it('works when nodes have same tag and attributes', function () {
      const source = link.firstChild
      const target = link.firstChild.cloneNode(true)
      expect(parser.isSameNode(target, source)).toBe(true)
    })
  })

  describe('lastChild()', function () {

    it('returns the deepest last child', function () {
      const source = linkWithSpan
      const target = document.createTextNode('bar')
      expect(parser.lastChild(source).isEqualNode(target)).toBe(true)
    })
  })

  describe('isInlineElement()', function () {
    let elem

    afterEach(function () {
      if (!elem) return
      elem.remove()
      elem = undefined
    })

    it('returns false for a div', function () {
      elem = createElement('<div>')
      document.body.appendChild(elem)
      expect(parser.isInlineElement(window, elem)).toBe(false)
    })

    it('returns true for a span', function () {
      elem = createElement('<span>')
      document.body.appendChild(elem)
      expect(parser.isInlineElement(window, elem)).toBe(true)
    })

    it('returns true for a div with display set to "inline-block"', function () {
      elem = createElement('<div style="display:inline-block;">')
      document.body.appendChild(elem)
      expect(parser.isInlineElement(window, elem)).toBe(true)
    })
  })
})

describe('isDocumentFragmentWithoutChildren()', function () {
  let frag

  beforeEach(function () {
    frag = window.document.createDocumentFragment()
  })

  it('returns true for a fragment with no children', function () {
    expect(parser.isDocumentFragmentWithoutChildren(frag)).toBe(true)
  })

  it('returns false for a documentFragment with an empty text node as child', function () {
    frag.appendChild(window.document.createTextNode(''))
    expect(parser.isDocumentFragmentWithoutChildren(frag)).toBe(false)
  })

  it('returns false for undefined', function () {
    expect(parser.isDocumentFragmentWithoutChildren(undefined)).toBe(false)
  })

  it('returns false for an element node', function () {
    const node = createElement('<div>')
    expect(parser.isDocumentFragmentWithoutChildren(node)).toBe(false)
  })
})

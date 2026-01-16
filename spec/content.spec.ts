
import {createElement, createRange} from '../src/util/dom.js'

import * as content from '../src/content.js'
import * as rangeSaveRestore from '../src/range-save-restore.js'

describe('Content', function () {

  describe('normalizeTags()', function () {
    const plain = createElement('<div>Plain <strong>text</strong><strong>block</strong> example snippet</div>')
    const plainWithSpace = createElement('<div>Plain <strong>text</strong> <strong>block</strong> example snippet</div>')
    const nested = createElement('<div>Nested <strong><em>text</em></strong><strong><em>block</em></strong> example snippet</div>')
    const nestedMixed = createElement('<div>Nested <strong>and mixed <em>text</em></strong><strong><em>block</em> <em>examples</em></strong> snippet</div>')
    const consecutiveNewLines = createElement('<div>Consecutive<br><br>new lines</div>')
    const emptyTags = createElement('<div>Example with <strong>empty <em></em>nested</strong><br>tags</div>')

    it('works with plain block', function () {
      const expected = createElement('<div>Plain <strong>textblock</strong> example snippet</div>')
      const actual = plain.cloneNode(true)
      content.normalizeTags(actual)
      expect(actual.innerHTML).toBe(expected.innerHTML)
    })

    it('does not merge tags if not consecutives', function () {
      const expected = plainWithSpace.cloneNode(true)
      const actual = plainWithSpace.cloneNode(true)
      content.normalizeTags(actual)
      expect(actual.innerHTML).toBe(expected.innerHTML)
    })

    it('works with nested blocks', function () {
      const expected = createElement('<div>Nested <strong><em>textblock</em></strong> example snippet</div>')
      const actual = nested.cloneNode(true)
      content.normalizeTags(actual)
      expect(actual.innerHTML).toBe(expected.innerHTML)
    })

    it('works with nested blocks that mix other tags', function () {
      const expected = createElement('<div>Nested <strong>and mixed <em>textblock</em> <em>examples</em></strong> snippet</div>')
      const actual = nestedMixed.cloneNode(true)
      content.normalizeTags(actual)
      expect(actual.innerHTML).toBe(expected.innerHTML)
    })

    it('does not merge consecutive new lines', function () {
      const expected = consecutiveNewLines.cloneNode(true)
      const actual = consecutiveNewLines.cloneNode(true)
      content.normalizeTags(actual)
      expect(actual.innerHTML).toBe(expected.innerHTML)
    })

    it('should remove empty tags and preserve new lines', function () {
      const expected = createElement('<div>Example with <strong>empty nested</strong><br>tags</div>')
      const actual = emptyTags.cloneNode(true)
      content.normalizeTags(actual)
      expect(actual.innerHTML).toBe(expected.innerHTML)
    })

    it('removes whitespaces at the start and end', function () {
      const elem = createElement('<div> Hello <strong>world</strong>&nbsp; &nbsp;</div>')
      content.normalizeTags(elem)
      expect(elem.innerHTML).toBe('Hello <strong>world</strong>')
    })
  })

  describe('normalizeWhitespace()', function () {
    let element

    beforeEach(function () {
      element = createElement('<div></div>')
    })

    it('replaces whitespace with spaces', function () {
      element.innerHTML = '&nbsp; \ufeff'
      let text = element.textContent

      // Check that textContent works as expected
      expect(text).toBe('\u00A0 \ufeff')

      text = content.normalizeWhitespace(text)
      expect(text).toBe('   ') // Check for three spaces
    })
  })

  describe('getInnerTags()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('works with partially selected <strong><em>', function () {
      // <div>|a <strong><em>b|</em></strong> c</div>
      const test = createElement('<div>a <strong><em>b</em></strong> c</div>')
      range.setStart(test, 0)
      range.setEnd(test.querySelector('em'), 1)
      const tags = content.getInnerTags(range)
      expect(content.getTagNames(tags)).toEqual(['STRONG', 'EM'])
    })

    it('gets nothing inside a <b>', function () {
      // <div><b>|a|</b></div>
      const test = createElement('<div><b>a</b></div>')
      range.setStart(test.querySelector('b'), 0)
      range.setEnd(test.querySelector('b'), 1)
      const tags = content.getInnerTags(range)
      expect(content.getTagNames(tags)).toEqual([])
    })

    it('gets a fully surrounded <b>', function () {
      // <div>|<b>a</b>|</div>
      const test = createElement('<div><b>a</b></div>')
      range.setStart(test, 0)
      range.setEnd(test, 1)
      const tags = content.getInnerTags(range)
      expect(content.getTagNames(tags)).toEqual(['B'])
    })

    it('gets partially selected <b> and <i>', function () {
      // <div><b>a|b</b><i>c|d</i></div>
      const test = createElement('<div><b>ab</b><i>cd</i></div>')
      const range = createRange()
      range.setStart(test.querySelector('b').firstChild, 1)
      range.setEnd(test.querySelector('i').firstChild, 1)
      const tags = content.getInnerTags(range)
      expect(content.getTagNames(tags)).toEqual(['B', 'I'])
    })
  })

  describe('getTags()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('inside <b>', function () {
      // <div><b>|a|</b></div>
      const test = createElement('<div><b>a</b></div>')
      range.setStart(test.querySelector('b'), 0)
      range.setEnd(test.querySelector('b'), 1)
      const tags = content.getTags(test, range)
      expect(content.getTagNames(tags)).toEqual(['B'])
    })

    it('insde <em><b>', function () {
      // <div><i><b>|a|</b></i></div>
      const test = createElement('<div><i><b>a</b></i></div>')
      range.setStart(test.querySelector('b'), 0)
      range.setEnd(test.querySelector('b'), 1)
      const tags = content.getTags(test, range)
      expect(content.getTagNames(tags)).toEqual(['B', 'I'])
    })
  })

  describe('getTagsByName()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('filters outer tags', function () {
      // <div><i><b>|a|</b></i></div>
      const test = createElement('<div><i><b>a</b></i></div>')
      range.setStart(test.querySelector('b'), 0)
      range.setEnd(test.querySelector('b'), 1)
      const tags = content.getTagsByName(test, range, 'b')
      expect(content.getTagNames(tags)).toEqual(['B'])
    })

    it('filters inner tags', function () {
      // <div>|<i><b>a</b></i>|</div>
      const test = createElement('<div><i><b>a</b></i></div>')
      range.setStart(test, 0)
      range.setEnd(test, 1)
      const tags = content.getTagsByName(test, range, 'i')
      expect(content.getTagNames(tags)).toEqual(['I'])
    })
  })

  describe('getTagsByNameAndAttributes()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('filters tag with attributes match', function () {
      const test = createElement('<div><span class="foo"><span class="test">a</span></span></div>')
      range.setStart(test, 0)
      range.setEnd(test, 1)
      const tags = content.getTagsByNameAndAttributes(test, range, createElement('<span class="foo">'))
      expect(content.getTagNames(tags)).toEqual(['SPAN'])
    })

    it('filters tag with attributes match', function () {
      const test = createElement('<div><span class="foo"><span class="foo">a</span></span></div>')
      range.setStart(test, 0)
      range.setEnd(test, 1)
      const tags = content.getTagsByNameAndAttributes(test, range, createElement('<span class="foo">'))
      expect(content.getTagNames(tags)).toEqual(['SPAN', 'SPAN'])
    })

    it('filters inner tags', function () {
      // <div>|<span class="foo"><span class="test">a</span></span>|</div>
      const test = createElement('<div><span class="foo"><span class="test">a</span></span></div>')
      range.setStart(test, 0)
      range.setEnd(test, 1)
      const tags = content.getTagsByNameAndAttributes(test, range, createElement('<span class="foo">'))
      expect(content.getTagNames(tags)).toEqual(['SPAN'])
    })
  })

  describe('wrap()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('creates an <em>', function () {
      // <div>|b|</div>
      const host = createElement('<div>b</div>')
      range.setStart(host, 0)
      range.setEnd(host, 1)

      content.wrap(range, '<em>')
      expect(host.innerHTML).toBe('<em>b</em>')
    })
  })

  describe('isAffectedBy()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('detects a <b> tag', function () {
      // <div><b>|a|</b></div>
      const host = createElement('<div><b>a</b></div>')
      range.setStart(host.querySelector('b'), 0)
      range.setEnd(host.querySelector('b'), 1)

      expect(content.isAffectedBy(host, range, 'b')).toBe(true)
      expect(content.isAffectedBy(host, range, 'strong')).toBe(false)
    })
  })

  describe('containsString()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('finds a character in the range', function () {
      // <div>|ab|c</div>
      const host = createElement('<div>abc</div>')
      range.setStart(host.firstChild, 0)
      range.setEnd(host.firstChild, 2)

      expect(content.containsString(range, 'a')).toBe(true)
      expect(content.containsString(range, 'b')).toBe(true)
      expect(content.containsString(range, 'c')).toBe(false)
    })
  })

  describe('deleteCharacter()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('removes a character in the range and preserves the range', function () {
      // <div>|ab|c</div>
      const host = createElement('<div>abc</div>')
      range.setStart(host.firstChild, 0)
      range.setEnd(host.firstChild, 2)

      range = content.deleteCharacter(host, range, 'a')
      expect(host.innerHTML).toBe('bc')

      // show resulting text nodes
      expect(host.childNodes.length).toBe(3)
      expect(host.childNodes[0].nodeValue, 'first').toBe('')
      expect(host.childNodes[1].nodeValue, 'second').toBe('b')
      expect(host.childNodes[2].nodeValue, 'third').toBe('c')

      // check range. It should look like this:
      // <div>|b|c</div>
      expect(range.toString(), 'range.toString()').toBe('b')
    })

    it('works with a partially selected tag', function () {
      // <div>|a<em>b|b</em></div>
      const host = createElement('<div>a<em>bb</em></div>')
      range.setStart(host.querySelector('em').firstChild, 0)
      range.setEnd(host.querySelector('em').firstChild, 1)

      range = content.deleteCharacter(host, range, 'b')
      expect(host.innerHTML).toBe('a<em>b</em>')

      // show resulting nodes
      expect(host.childNodes.length).toBe(2)
      expect(host.childNodes[0].nodeValue).toBe('a')
      expect(host.childNodes[1].tagName).toBe('EM')
    })
  })

  describe('toggleTag()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('toggles a <b> tag', function () {
      // <div><b>|a|</b></div>
      const host = createElement('<div><b>a</b></div>')
      range.setStart(host.querySelector('b'), 0)
      range.setEnd(host.querySelector('b'), 1)

      range = content.toggleTag(host, range, createElement('<b>'))
      expect(host.innerHTML).toBe('a')

      content.toggleTag(host, range, createElement('<b>'))
      expect(host.innerHTML).toBe('<b>a</b>')
    })
  })

  describe('nuke()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('removes surrounding <b>', function () {
      // <div><b>|a|</b></div>
      const host = createElement('<div><b>a</b></div>')
      range.setStart(host.querySelector('b'), 0)
      range.setEnd(host.querySelector('b'), 1)
      content.nuke(host, range)
      expect(host.innerHTML).toBe('a')
    })

    it('removes tons of tags', function () {
      // <div><b>|a<i>b</i><em>c|d</em></b></div>
      const host = createElement('<div><b>a<i>b</i><em>cd</em></b></div>')
      range.setStart(host.querySelector('b'), 0)
      range.setEnd(host.querySelector('em').firstChild, 1)
      content.nuke(host, range)
      expect(host.innerHTML).toBe('abcd')
    })

    it('leaves <br> alone', function () {
      // <div>|a<br>b|</div>
      const host = createElement('<div>a<br>b</div>')
      range.setStart(host, 0)
      range.setEnd(host, 3)
      content.nuke(host, range)
      expect(host.innerHTML).toBe('a<br>b')
    })

    it('leaves saved range markers intact', function () {
      // <div><b>|a|</b></div>
      const host = createElement('<div><b>a</b></div>')
      range.setStart(host.querySelector('b'), 0)
      range.setEnd(host.querySelector('b'), 1)
      rangeSaveRestore.save(range)
      content.nuke(host, range)
      expect(host.querySelectorAll('span').length).toBe(2)
      expect(host.querySelectorAll('b').length).toBe(0)
    })
  })

  describe('forceWrap()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('adds a link with an href attribute', function () {
      // <div>|b|</div>
      const host = createElement('<div>b</div>')
      range.setStart(host, 0)
      range.setEnd(host, 1)

      const link = createElement('<a>')
      link.setAttribute('href', 'www.link.io')

      content.forceWrap(host, range, link)
      expect(host.innerHTML).toBe('<a href="www.link.io">b</a>')
    })

    it('does not nest tags', function () {
      // <div>|<em>b</em>|</div>
      const host = createElement('<div><em>b</em></div>')
      range.setStart(host, 0)
      range.setEnd(host, 1)

      const em = createElement('<em>')
      content.forceWrap(host, range, em)
      expect(host.innerHTML).toBe('<em>b</em>')
    })

    it('removes partially selected tags', function () {
      // <div><em>b|c|</em></div>
      const host = createElement('<div><em>bc</em></div>')
      range.setStart(host.querySelector('em').firstChild, 1)
      range.setEnd(host.querySelector('em').firstChild, 2)

      const em = createElement('<em>')
      content.forceWrap(host, range, em)
      expect(host.innerHTML).toBe('b<em>c</em>')
    })
  })

  describe('surround()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('wraps text in double angle quotes (1)', function () {
      // <div><i>|b|</i></div>
      const host = createElement('<div><i>a</i></div>')
      range.setStart(host.querySelector('i'), 0)
      range.setEnd(host.querySelector('i'), 1)
      content.surround(host, range, '«', '»')
      expect(host.innerHTML).toBe('<i>«a»</i>')
    })

    it('wraps text in double angle quotes (2)', function () {
      // <div><i>|b|</i></div>
      const host = createElement('<div><i>a</i></div>')
      range.setStart(host.querySelector('i'), 0)
      range.setEnd(host.querySelector('i'), 1)
      content.surround(host, range, '«', '»')

      expect(host.innerHTML).toBe('<i>«a»</i>')
      expect(range.toString()).toBe('«a»')

      expect(host.querySelector('i').childNodes.length, 'childNodes.length').toBe(3)
      expect(range.startContainer).toBe(host.querySelector('i'))
      expect(range.endContainer).toBe(host.querySelector('i'))
    })

    it('wraps text in double angle quotes (3)', function () {
      // <div><i>a|b|</i></div>
      const host = createElement('<div><i>ab</i></div>')
      range.setStart(host.querySelector('i').firstChild, 1)
      range.setEnd(host.querySelector('i').firstChild, 2)
      content.surround(host, range, '«', '»')

      expect(host.innerHTML).toBe('<i>a«b»</i>')
      expect(range.toString()).toBe('«b»')

      // we have 2 separate text nodes
      expect(host.querySelector('i').childNodes.length, 'childNodes.length').toBe(5)
      expect(range.startContainer, 'startContainer').toBe(host.querySelector('i'))
      expect(range.endContainer, 'endContainer').toBe(host.querySelector('i'))
    })
  })

  describe('isExactSelection()', function () {
    let range

    beforeEach(function () {
      range = createRange()
    })

    it('is true if the selection is directly outside the tag', function () {
      // <div>|<em>b</em>|</div>
      const host = createElement('<div><em>b</em></div>')
      range.setStart(host, 0)
      range.setEnd(host, 1)

      const exact = content.isExactSelection(range, host.querySelector('em'))
      expect(exact).toBe(true)
    })

    it('is true if the selection is directly inside the tag', function () {
      // <div><em>|b|</em></div>
      const host = createElement('<div><em>b</em></div>')
      range.setStart(host.querySelector('em'), 0)
      range.setEnd(host.querySelector('em'), 1)

      const exact = content.isExactSelection(range, host.querySelector('em'))
      expect(exact).toBe(true)
    })

    it('is true if the selection is a text node', function () {
      // <div>|b|<em>b</em></div>
      const host = createElement('<div>b<em>b</em></div>')
      range.setStart(host.firstChild, 0)
      range.setEnd(host.firstChild, 1)

      const exact = content.isExactSelection(range, host.firstChild)
      expect(exact).toBe(true)
    })

    it('is true if the selection contains an invisible node', function () {
      // <div>|b<script>console.log("foo")</script>|</div>
      const host = createElement('<div>hello<script>console.log("foo")</script> world</div>')
      range.setStart(host, 0)
      range.setEnd(host, 3)

      const exact = content.isExactSelection(range, host)
      expect(exact).toBe(true)
    })

    it('is false if the selection goes beyond the tag', function () {
      // <div>|a<em>b</em>|</div>
      const host = createElement('<div>a<em>b</em></div>')
      range.setStart(host, 0)
      range.setEnd(host, 2)

      const exact = content.isExactSelection(range, host.querySelector('em'))
      expect(exact).toBe(false)
    })

    it('is false if the selection is only partial', function () {
      // <div><em>a|b|</em></div>
      const host = createElement('<div><em>ab</em></div>')
      range.setStart(host.querySelector('em').firstChild, 1)
      range.setEnd(host.querySelector('em').firstChild, 2)

      const exact = content.isExactSelection(range, host.querySelector('em'))
      expect(exact).toBe(false)
    })

    it('is false for a collapsed range', function () {
      // <div><em>a|b</em></div>
      const host = createElement('<div><em>ab</em></div>')
      range.setStart(host.querySelector('em').firstChild, 1)
      range.setEnd(host.querySelector('em').firstChild, 1)

      const exact = content.isExactSelection(range, host.querySelector('em'))
      expect(exact).toBe(false)
    })

    it('is false for a collapsed range in an empty tag', function () {
      // <div><em>|</em></div>
      const host = createElement('<div><em></em></div>')
      range.setStart(host.querySelector('em'), 0)
      range.setEnd(host.querySelector('em'), 0)

      const exact = content.isExactSelection(range, host.querySelector('em'))
      expect(exact).toBe(false)
    })

    it('is false if selection and elem do not overlap but have the same content', function () {
      // <div>|b|<em>b</em></div>
      const host = createElement('<div>b<em>b</em></div>')
      range.setStart(host.firstChild, 0)
      range.setEnd(host.firstChild, 1)

      const exact = content.isExactSelection(range, host.querySelector('em'))
      expect(exact).toBe(false)
    })
  })

  describe('extractContent()', function () {
    it('extracts the content', function () {
      const element = createElement('<div>a</div>')
      const result = content.extractContent(element)
      // escape to show invisible characters
      expect(escape(result)).toBe('a')
    })

    it('extracts the content from a document fragment', function () {
      const element = createElement('<div>a<span>b</span>c</div>')
      const fragment = document.createDocumentFragment()
      for (const child of element.childNodes) fragment.appendChild(child.cloneNode(true))
      expect(content.extractContent(fragment)).toBe('a<span>b</span>c')
    })

    it('replaces a zeroWidthSpace with a <br> tag', function () {
      const element = createElement('<div>a\u200Bb</div>')
      const result = content.extractContent(element)
      expect(result).toBe('a<br>b')
    })

    it('removes text nodes and line breaks at the end', function () {
      const element = createElement('<div>a\u200B</div>')
      const result = content.extractContent(element)
      expect(result).toBe('a')

      const element2 = createElement('<div>b<br></div>')
      const result2 = content.extractContent(element2)
      expect(result2).toBe('b')
    })

    it('removes zeroWidthNonBreakingSpaces', function () {
      const element = createElement('<div>a\uFEFFb</div>')
      const result = content.extractContent(element)
      // escape to show invisible characters
      expect(escape(result)).toBe('ab')
    })

    it('removes a marked linebreak', function () {
      const element = createElement('<div>Foo <br data-editable="remove">Bar</div>')
      const result = content.extractContent(element)
      expect(result).toBe('Foo Bar')
    })

    it('removes two nested marked spans', function () {
      const element = createElement('<div><span data-editable="unwrap"><span data-editable="unwrap">a</span></span></div>')
      const result = content.extractContent(element)
      expect(result).toBe('a')
    })

    it('removes two adjacent marked spans', function () {
      const element = createElement('<div><span data-editable="remove"></span><span data-editable="remove"></span></div>')
      const result = content.extractContent(element)
      expect(result).toBe('')
    })

    it('unwraps two marked spans around text', function () {
      const element = createElement('<div>|<span data-editable="unwrap">a</span>|<span data-editable="unwrap">b</span>|</div>')
      const result = content.extractContent(element)
      expect(result).toBe('|a|b|')
    })

    it('unwraps a "ui-unwrap" span', function () {
      const element = createElement('<div>a<span data-editable="ui-unwrap">b</span>c</div>')
      const result = content.extractContent(element)
      expect(result).toBe('abc')
    })

    it('removes a "ui-remove" span', function () {
      const element = createElement('<div>a<span data-editable="ui-remove">b</span>c</div>')
      const result = content.extractContent(element)
      expect(result).toBe('ac')
    })

    describe('trim leading white space', function () {
      it('removes single regular whitespace', function () {
        const element = createElement('<div> hello world</div>')
        const result = content.extractContent(element)
        expect(result).toBe('hello world')
      })

      it('removes multiple regular whitespaces', function () {
        const element = createElement('<div>   hello world</div>')
        const result = content.extractContent(element)
        expect(result).toBe('hello world')
      })

      it('removes &nbsp;', function () {
        const element = createElement('<div>&nbsp; &nbsp;hello world</div>')
        const result = content.extractContent(element)
        expect(result).toBe('hello world')
      })

      it('removes multiple regular whitespaces before tag', function () {
        const element = createElement('<div>   <strong>hello world</strong></div>')
        const result = content.extractContent(element)
        expect(result).toBe('<strong>hello world</strong>')
      })

      it('removes &nbsp; before tag', function () {
        const element = createElement('<div>&nbsp;<strong>hello world</strong></div>')
        const result = content.extractContent(element)
        expect(result).toBe('<strong>hello world</strong>')
      })

      it('keeps whitespace within tag', function () {
        const element = createElement('<div>&nbsp;<strong> hello world</strong></div>')
        const result = content.extractContent(element)
        expect(result).toBe('<strong> hello world</strong>')
      })
    })

    describe('trim trailing white space', function () {
      it('removes single regular whitespace', function () {
        const element = createElement('<div>hello world </div>')
        const result = content.extractContent(element)
        expect(result).toBe('hello world')
      })

      it('removes multiple regular whitespaces', function () {
        const element = createElement('<div>hello world   </div>')
        const result = content.extractContent(element)
        expect(result).toBe('hello world')
      })

      it('removes &nbsp;', function () {
        const element = createElement('<div>hello world&nbsp; &nbsp;</div>')
        const result = content.extractContent(element)
        expect(result).toBe('hello world')
      })

      it('removes multiple regular whitespaces after tag', function () {
        const element = createElement('<div><strong>hello world</strong>   </div>')
        const result = content.extractContent(element)
        expect(result).toBe('<strong>hello world</strong>')
      })

      it('removes &nbsp; after tag', function () {
        const element = createElement('<div><strong>hello world</strong>&nbsp;</div>')
        const result = content.extractContent(element)
        expect(result).toBe('<strong>hello world</strong>')
      })

      it('keeps whitespace within tag', function () {
        const element = createElement('<div><strong>hello world </strong>&nbsp;</div>')
        const result = content.extractContent(element)
        expect(result).toBe('<strong>hello world </strong>')
      })
    })

    describe('called with keepUiElements', function () {

      it('does not unwrap a "ui-unwrap" span', function () {
        const element = createElement('<div>a<span data-editable="ui-unwrap">b</span>c</div>')
        const result = content.extractContent(element, true)
        expect(result).toBe('a<span data-editable="ui-unwrap">b</span>c')
      })

      it('does not remove a "ui-remove" span', function () {
        const element = createElement('<div>a<span data-editable="ui-remove">b</span>c</div>')
        const result = content.extractContent(element, true)
        expect(result).toBe('a<span data-editable="ui-remove">b</span>c')
      })
    })

    describe('with ranges', function () {
      let host, range

      beforeEach(function () {
        host = createElement('<div></div>')
        document.body.appendChild(host)
        range = createRange()
      })

      afterEach(function () {
        host.remove()
      })

      it('removes saved ranges', function () {
        host.innerHTML = 'a'
        range.setStart(host, 0)
        range.setEnd(host, 0)
        rangeSaveRestore.save(range)
        const result = content.extractContent(host)
        expect(result).toBe('a')
      })

      it('leaves the saved ranges in the host', function () {
        range.setStart(host, 0)
        range.setEnd(host, 0)
        rangeSaveRestore.save(range)
        content.extractContent(host)
        expect(host.firstChild.nodeName).toBe('SPAN')
      })

      it('removes a saved range in an otherwise empty host', function () {
        range.setStart(host, 0)
        range.setEnd(host, 0)
        rangeSaveRestore.save(range)
        const result = content.extractContent(host)
        expect(result).toBe('')
      })
    })
  })
})

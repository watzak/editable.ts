
import {vi} from 'vitest'

import {Editable} from '../src/core.js'
import highlightSupport from '../src/highlight-support.js'
import {createElement, createRange, toCharacterRange} from '../src/util/dom.js'
import Selection from '../src/selection.js'

function setupHighlightEnv (text) {
  const context = {}
  context.text = text
  context.div = createElement(`<div>${context.text}</div>`)
  document.body.appendChild(context.div)
  context.editable = new Editable()
  context.editable.add(context.div)

  context.getCharacterRange = () => {
    const range = createRange()
    range.selectNodeContents(context.div)
    const selection = new Selection(context.div, range)
    return selection.getTextRange()
  }

  // eslint-disable-next-line no-shadow
  context.highlightRange = (text, highlightId, start, end, dispatcher, type) => {
    const win = context.div.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : undefined)
    // Ensure win is actually a Window object, not a string
    if (win && typeof win === 'object' && win.document) {
      return highlightSupport.highlightRange(
        context.div,
        text,
        highlightId,
        start,
        end,
        dispatcher,
        win,  // Window parameter (7th)
        type  // type parameter (8th)
      )
    }
    // Fallback - create a window from the document if available
    const doc = context.div?.ownerDocument || (typeof document !== 'undefined' ? document : null)
    const fallbackWin = doc?.defaultView || undefined
    return highlightSupport.highlightRange(
      context.div,
      text,
      highlightId,
      start,
      end,
      dispatcher,
      fallbackWin,
      type
    )
  }

  context.removeHighlight = (highlightId, dispatcher) => {
    return highlightSupport.removeHighlight(
      context.div,
      highlightId,
      dispatcher
    )
  }

  // we don't want to compare the native range in our tests since this is a native JS object
  context.extractWithoutNativeRange = function (type) {
    const positions = context.editable.getHighlightPositions({editableHost: context.div, type})
    // Check if positions is null, undefined, or an empty object
    if (!positions || (typeof positions === 'object' && Object.keys(positions).length === 0)) {
      return undefined
    }
    const extracted = {}
    for (const id in positions) {
      const val = positions[id]
      const {nativeRange, ...withoutNativeRange} = val // eslint-disable-line
      extracted[id] = withoutNativeRange
    }
    return Object.keys(extracted).length === 0 ? undefined : extracted
  }

  context.extract = function (type) {
    return context.editable.getHighlightPositions({editableHost: context.div, type})
  }

  context.getHtml = function () {
    return context.div.innerHTML
  }

  context.formatHtml = (string) => {
    return createElement(`<div>${string.replace(/\n/gm, '')}</div>`).innerHTML
  }
  
  return context
}

describe('highlight-support:', function () {
  let context

  afterEach(function () {
    // teardownHighlightEnv
    if (context) {
      context.div?.remove()
      context.editable?.unload()
      context = null
    }
  })

  describe('editable.highlight()', function () {

    beforeEach(function () {
      context = setupHighlightEnv('People Make The <br> World Go Round')
    })

    it('skips and warns if an invalid range object was passed', function () {
      context.editable.highlight({
        editableHost: context.div,
        highlightId: 'myId',
        textRange: {foo: 3, bar: 7}
      })
      const highlightSpan = context.div.querySelectorAll('[data-word-id="myId"]')
      expect(highlightSpan.length).toBe(0)
      context.div?.remove()
      context.editable?.unload()
    })

    it('skips if the range exceeds the content length', function () {
      const result = context.editable.highlight({
        editableHost: context.div,
        highlightId: 'myId',
        textRange: {foo: 3, bar: 32}
      })
      const highlightSpan = context.div.querySelectorAll('[data-word-id="myId"]')
      expect(highlightSpan.length).toBe(0)
      expect(result).toBe(-1)
    })

    it('skips and warns if the range object represents a cursor', function () {
      context.editable.highlight({
        editableHost: context.div,
        highlightId: 'myId',
        textRange: {start: 3, end: 3}
      })

      const highlightSpan = context.div.querySelectorAll('[data-word-id="myId"]')
      expect(highlightSpan.length).toBe(0)
    })
  })

  describe('highlightRange()', function () {
    let context

    it('handles a single highlight', function () {
      context = setupHighlightEnv('People Make The <br> World Go Round')
      const text = 'ple '
      const startIndex = context.highlightRange(text, 'myId', 3, 7)
      const expectedRanges = {
        myId: {
          text: 'ple ',
          start: 3,
          end: 7
        }
      }
      const expectedHtml = context.formatHtml(`Peo
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">ple </span>
Make The <br> World Go Round`)

      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
      expect(startIndex).toBe(3)
      context.div?.remove()
      context.editable?.unload()
    })

    it('has the native range', function () {
      context = setupHighlightEnv('People Make The <br> World Go Round')
      // Ensure the div is in the document with a valid window
      if (!context.div || !context.div.ownerDocument) {
        document.body.appendChild(context.div)
      }
      context.highlightRange('ple ', 'myId', 3, 7)
      // Use extractHighlightedRanges directly to get nativeRange (getHighlightPositions strips it)
      const extracted = highlightSupport.extractHighlightedRanges(context.div)
      // Check if highlight was created
      if (!extracted || !extracted.myId) {
        throw new Error('Highlight was not created - check window context')
      }
      expect(extracted.myId.nativeRange?.constructor?.name).toBe('Range')
      context.div?.remove()
      context.editable?.unload()
    })

    it('handles adjaccent highlights', function () {
      context = setupHighlightEnv('People Make The <br> World Go Round')
      context.highlightRange('P', 'firstId', 0, 1)
      context.highlightRange('e', 'secondId', 1, 2)
      context.highlightRange('o', 'thirdId', 2, 3)
      context.highlightRange('p', 'fourthId', 3, 4)

      const expectedRanges = {
        firstId: {
          text: 'P',
          start: 0,
          end: 1
        },
        secondId: {
          text: 'e',
          start: 1,
          end: 2
        },
        thirdId: {
          text: 'o',
          start: 2,
          end: 3
        },
        fourthId: {
          text: 'p',
          start: 3,
          end: 4
        }
      }
      const expectedHtml = context.formatHtml(`<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="firstId">P</span>
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="secondId">e</span>
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="thirdId">o</span>
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="fourthId">p</span>
le Make The <br> World Go Round`)

      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
      context.div?.remove()
      context.editable?.unload()
    })

    it('handles nested highlights', function () {
      context = setupHighlightEnv( 'People Make The <br> World Go Round')
      context.highlightRange('P', 'firstId', 0, 1)
      context.highlightRange('e', 'secondId', 1, 2)
      context.highlightRange('ople', 'thirdId', 2, 6)
      context.highlightRange('People', 'fourthId', 0, 6)
      const expectedRanges = {
        firstId: {
          text: 'P',
          start: 0,
          end: 1
        },
        secondId: {
          text: 'e',
          start: 1,
          end: 2
        },
        thirdId: {
          text: 'ople',
          start: 2,
          end: 6
        },
        fourthId: {
          text: 'People',
          start: 0,
          end: 6
        }
      }
      const expectedHtml = context.formatHtml(`<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="firstId">
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="fourthId">P</span></span>
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="secondId">
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="fourthId">e</span></span>
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="thirdId">
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="fourthId">ople</span></span>
 Make The <br> World Go Round`)

      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
    })

    it('handles intersecting highlights', function () {
      context = setupHighlightEnv( 'People Make The <br> World Go Round')
      context.highlightRange('Peo', 'firstId', 0, 3)
      context.highlightRange('ople', 'secondId', 2, 6)
      context.highlightRange('le', 'thirdId', 4, 6)
      const expectedRanges = {
        firstId: {
          text: 'Peo',
          start: 0,
          end: 3
        },
        secondId: {
          text: 'ople',
          start: 2,
          end: 6
        },
        thirdId: {
          text: 'le',
          start: 4,
          end: 6
        }
      }

      const expectedHtml = context.formatHtml(`
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="firstId">Pe
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="secondId">o</span></span>
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="secondId">p
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="thirdId">le</span></span>
 Make The <br> World Go Round`)
      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
    })

    // todo: it seems the string ' The \nWorld' does not matter -> check if this is true
    // todo: the input is ' The <br> World' which would be 11 - 23
    // todo:   is there some whitespace normalization going on?
    it('handles highlights containing break tags', function () {
      context = setupHighlightEnv( 'The <br> World Go Round')
      context.highlightRange('The  World', 'myId', 0, 10)
      const expectedRanges = {
        myId: {
          text: 'The  World',
          start: 0,
          end: 10
        }
      }
      const expectedHtml = context.formatHtml(`
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">The </span>
<br><span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId"> World</span>
 Go Round`)

      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)

    })

    it('handles identical ranges', function () {
      context = setupHighlightEnv( 'People Make The World Go Round')
      context.highlightRange(' The World', 'firstId', 11, 21)
      context.highlightRange(' The World', 'secondId', 11, 21)
      const expectedRanges = {
        firstId: {
          text: ' The World',
          start: 11,
          end: 21
        },
        secondId: {
          text: ' The World',
          start: 11,
          end: 21
        }
      }
      const expectedHtml = context.formatHtml(`People Make
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="firstId">
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="secondId"> The World</span>
</span>
 Go Round`)

      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)

    })

    it('updates any existing range', function () {
      context = setupHighlightEnv( 'People Make The <br> World Go Round')
      context.highlightRange('a', 'myId', 11, 22)
      context.highlightRange('a', 'myId', 8, 9)
      const expectedRanges = {
        myId: {
          text: 'a',
          start: 8,
          end: 9
        }
      }
      const expectedHtml = context.formatHtml(`People M
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">a</span>
ke The <br> World Go Round`)

      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
      expect(context.getHtml()).toBe(expectedHtml)
    })

    it('handles a <br> tag without whitespaces', function () {
      context = setupHighlightEnv( 'a<br>b')
      context.highlightRange('b', 'myId', 1, 2)
      const expectedHtml = context.formatHtml(`a<br>
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">b</span>`)

      expect(context.getHtml()).toBe(expectedHtml)
    })

    it('does not throw when text has been deleted', function () {
      context = setupHighlightEnv( '')
      expect(() => context.highlightRange('not found', 'myId', 33, 38)).not.toThrow()
    })

    it('normalizes a simple text node after removing a highlight', function () {
      context = setupHighlightEnv( 'People Make The World Go Round')
      context.highlightRange('ple ', 'myId', 3, 7)
      const normalizeSpy = vi.spyOn(context.div, 'normalize')
      context.removeHighlight('myId')
      // There is no way to see the actual error in a test since it only happens in (non-headless)
      // Chome environments. We just check if the normalize method has been called here.
      expect(normalizeSpy).toHaveBeenCalledTimes(1)
      normalizeSpy.mockRestore()
    })
  })

  describe('highlightRange() - with formatted text', function () {

    it('handles highlights surrounding <span> tags', function () {
      context = setupHighlightEnv( 'a<span>b</span>cd')
      context.highlightRange('bc', 'myId', 1, 3)
      const extract = context.extractWithoutNativeRange()

      expect(extract.myId.text).toBe('bc')

      const content = context.getHtml()
      expect(content).toBe('a<span><span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">b</span></span><span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">c</span>d')
    })

    it('handles highlights intersecting <span> tags', function () {
      context = setupHighlightEnv( 'a<span data-word-id="x">bc</span>d')
      context.highlightRange('ab', 'myId', 0, 2)
      const extract = context.extractWithoutNativeRange()

      expect(extract.myId.text).toBe('ab')

      const content = context.getHtml()
      expect(content).toBe('<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">a</span><span data-word-id="x"><span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">b</span>c</span>d')
    })
  })

  // How characters are counted determines how the the highlight
  // startIndex and endIndex are applied.
  describe('highlightRange() - character counting', function () {

    // actual / expected length / expected text
    const cases = [
      ['😐', 2, '😐'],
      ['&nbsp;', 1, ' '],
      [' ', 1, ' '], // 160 - no-break space
      [' ', 1, ' '], // 8201 - thin space
      [' ', 1, ' '], // 8202 - hair space
      ['\r', 1, '\n'], // was: ['\r', 0]
      ['\n', 1, '\n'], // was: ['\n', 0]
      ['\n 🌍', 4, '\n 🌍'], // new
      ['\r\n', 1, '\n'], // new
      ['\r \n', 3, '\n \n'], // new
      ['&nbsp; ', 2, '  '], // new
      ['<br>', 0]
    ]

    // Generate a test for each test case
    for (const [char, expectedLength, expectedText] of cases) {

      it(`treats '${char}' as ${expectedLength} characters`, function () {
        context = setupHighlightEnv(char)

        const {start, end} = context.getCharacterRange()
        context.highlightRange(char, 'char', start, end)

        if (expectedLength === 0) {
          expect(context.extractWithoutNativeRange()).toBe(undefined)
        } else {
          expect(context.extractWithoutNativeRange()).toEqual({
            char: {
              start: 0,
              end: expectedLength,
              text: expectedText
            }
          })
        }
        context.div?.remove()
        context.editable?.unload()
      })
    }
  })

  describe('highlightRange() - with special characters', function () {

    it('maps selection offsets to ranges containing multibyte symbols consistently', function () {
      context = setupHighlightEnv( '😐 Make&nbsp;The \n 🌍 Go \n🔄')
      const range = createRange()
      const node = context.div
      range.setStart(node.firstChild, 0)
      range.setEnd(node.firstChild, 2)
      const {start, end} = toCharacterRange(range, context.div)

      context.highlightRange('😐', 'myId', start, end)
      const expectedRanges = {
        myId: {
          text: '😐',
          start: 0,
          end: 2
        }
      }

      const expectedHtml = '<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">😐</span> Make&nbsp;The \n 🌍 Go \n🔄'

      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
      expect(context.getHtml()).toBe(expectedHtml)
    })

    it('treats non-breakable spaces consistently', function () {
      context = setupHighlightEnv( '😐 Make&nbsp;The \n 🌍 Go \n🔄')
      context.highlightRange(' Make T', 'myId', 2, 9)
      const expectedRanges = {
        myId: {
          text: ' Make T',
          start: 2,
          end: 9
        }
      }
      const expectedHtml = `😐<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId"> Make&nbsp;T</span>he \n 🌍 Go \n🔄`

      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
    })

    it('treats \\n spaces consistently', function () {
      context = setupHighlightEnv( '&nbsp;The \n 🌍 Go \n🔄')
      context.highlightRange('The \n 🌍', 'myId', 1, 9)
      const expectedRanges = {
        myId: {
          text: 'The \n 🌍',
          start: 1,
          end: 9
        }
      }

      const expectedHtml = `&nbsp;<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">The \n 🌍</span> Go \n🔄`

      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
    })

    it('extracts a readable text', function () {
      context = setupHighlightEnv( '😐 Make&nbsp;The \r\n 🌍 Go \n🔄')
      context.highlightRange('😐 Make The 🌍 Go 🔄', 'myId', 0, 23)
      const expectedRanges = {
        myId: {
          text: '😐 Make The \n 🌍 Go \n🔄',
          start: 0,
          end: 23
        }
      }
      const expectedHtml = '<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">😐 Make&nbsp;The \n 🌍 Go \n🔄</span>'
      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange()).toEqual(expectedRanges)
    })

    it('notify change on add highlight when dispatcher is given', function () {
      context = setupHighlightEnv( '😐 Make&nbsp;The \r\n 🌍 Go \n🔄')
      let called = 0
      const dispatcher = {notify: () => called++}
      context.highlightRange('😐 Make The 🌍 Go 🔄', 'myId', 0, 20, dispatcher)

      expect(called).toBe(1)
    })

    it('notify change on remove highlight when dispatcher is given', function () {
      context = setupHighlightEnv( '😐 Make&nbsp;The \r\n 🌍 Go \n🔄')
      let called = 0
      const dispatcher = {notify: () => called++}
      context.highlightRange('😐 Make The 🌍 Go 🔄', 'myId', 0, 20)
      context.removeHighlight('first', dispatcher)

      expect(called).toBe(1)
    })
  })

  describe('highlightRange() - multiple white spaces', function () {

    beforeEach(function () {
      context = setupHighlightEnv('People Make The&nbsp;<br>&nbsp;World Go Round')
    })

    afterEach(function () {
      context.div?.remove()
      context.editable?.unload()
    })

    it('can handle all cases combined and creates consistent output', function () {
      context.highlightRange('ople Mak', 'firstId', 2, 10)
      context.highlightRange('l', 'secondId', 4, 5)
      context.highlightRange('ld Go Round', 'thirdId', 20, 31)
      context.highlightRange(' ', 'fourthId', 22, 23)
      context.highlightRange(' ', 'fifthId', 22, 23)

      const expectedRanges = {
        firstId: {
          start: 2,
          end: 10,
          text: 'ople Mak'
        },
        secondId: {
          start: 4,
          end: 5,
          text: 'l'
        },
        thirdId: {
          start: 20,
          end: 31,
          text: 'ld Go Round'
        },
        fourthId: {
          start: 22,
          end: 23,
          text: ' '
        },
        fifthId: {
          start: 22,
          end: 23,
          text: ' '
        }
      }
      const expectedHtml = context.formatHtml(`Pe
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="firstId">op
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="secondId">l</span>
e Mak</span>
e The&nbsp;<br>&nbsp;Wor<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="thirdId">ld
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="fourthId">
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="fifthId"> </span></span>
Go Round</span>`)

      const extractedRanges = context.extractWithoutNativeRange()
      const content = context.editable.getContent(context.div)
      expect(content).toBe(context.text)
      expect(extractedRanges).toEqual(expectedRanges)
      expect(context.getHtml()).toEqual(expectedHtml)
    })

    it('returns only highlightRanges with specific type', function () {
      const startIndex = context.highlightRange('ple ', 'myId', 3, 7)
      context.highlightRange('orld', 'spellcheckId', 18, 22, undefined, 'spellcheck')
      const expectedRanges = {
        myId: {
          text: 'ple ',
          start: 3,
          end: 7
        }
      }
      const expectedHtml = context.formatHtml(`Peo
<span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">ple </span>
Make The&nbsp;<br>&nbsp;W<span class="highlight-spellcheck" data-editable="ui-unwrap" data-highlight="spellcheck" data-word-id="spellcheckId">orld</span> Go Round`)
      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange('comment')).toEqual(expectedRanges)
      expect(startIndex).toBe(3)
    })
  })

  describe('highlightRange() - matches based on both start index and match', function () {
    beforeEach(function () {
      context = setupHighlightEnv( 'People make the world go round and round and round the world')
    })

    it('highlights based on both match and start index', function () {
      context.highlightRange('round', 'myId', 35, 40)
      const expectedRanges = {
        myId: {
          text: 'round',
          start: 35,
          end: 40
        }
      }
      const expectedHtml = context.formatHtml(`People make the world go round and <span class="highlight-comment" data-editable="ui-unwrap" data-highlight="comment" data-word-id="myId">round</span> and round the world`)
      expect(context.getHtml()).toBe(expectedHtml)
      expect(context.extractWithoutNativeRange('comment')).toEqual(expectedRanges)
    })
  })
})


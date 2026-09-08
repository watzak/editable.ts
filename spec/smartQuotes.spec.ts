import {
  isDoubleQuote,
  isSingleQuote,
  isWhitespace,
  isSeparatorOrWhitespace,
  isApostrophe,
  replaceQuote,
  applySmartQuotes,
  shouldApplySmartQuotes
} from '../src/smartQuotes'

const allSingleQuotes = ['‘', '’', '‹', '›', '‚', '‘', '›', '‹', `'`, `‘`]
const allDoubleQuotes = ['«', '»', '»', '«', '"', '"', '“', '”', '”', '”', '“', '“', '„', '“']
const charValues = ['', '*', '<', 'b', 'ab']
const nonStringValues = [undefined, null, true, 123, NaN]
const whitespaceChars = [' ', '\t', '\n', '\r', '\v', '\f']
const separatorValues = ['>', '-', '–—']

describe('Smart Quotes Helper Functions:', () => {
  describe('isDoubleQuote', () => {
    it('Should return false for non double quote values', () => {
      ;[...charValues, ...separatorValues, ...nonStringValues, ...allSingleQuotes].forEach(
        (value) => {
          expect(isDoubleQuote(String(value))).toBe(false)
        }
      )
    })

    it('Should return true for double quote values', () => {
      allDoubleQuotes.forEach((value, index) => {
        if (!isDoubleQuote(value)) {
          console.log(
            `Failed at index ${index}: value="${value}", charCode=${value.charCodeAt(0)}, length=${value.length}, type=${typeof value}`
          )
        }
        expect(isDoubleQuote(value)).toBe(true)
      })
    })
  })

  describe('isSingleQuote', () => {
    it('Should return false for non single quote values', () => {
      ;[...charValues, ...separatorValues, ...nonStringValues, ...allDoubleQuotes].forEach(
        (value) => {
          expect(isSingleQuote(String(value))).toBe(false)
        }
      )
    })

    it('Should return true for single quote values', () => {
      allSingleQuotes.forEach((value, index) => {
        if (!isSingleQuote(value)) {
          console.log(
            `Failed at index ${index}: value="${value}", charCode=${value.charCodeAt(0)}, length=${value.length}, type=${typeof value}`
          )
        }
        expect(isSingleQuote(value)).toBe(true)
      })
    })
  })

  describe('isWhiteSpace', () => {
    it('should return false for non whitespace characters', () => {
      ;[...charValues, ...nonStringValues].forEach((value) => {
        expect(isWhitespace(String(value))).toBe(false)
      })
    })

    it('should return true for  whitespace characters', () => {
      ;[...whitespaceChars].forEach((value) => {
        expect(isWhitespace(value)).toBe(true)
      })
    })
  })

  describe('isSeparatorOrWhitespace', () => {
    it('should return false for non whitespace/ separator characters', () => {
      ;[...charValues, ...nonStringValues].forEach((value) => {
        expect(isSeparatorOrWhitespace(String(value))).toBe(false)
      })
    })

    it('should return true for  whitespace/ separator characters', () => {
      ;[...whitespaceChars, ...separatorValues].forEach((value) => {
        expect(isSeparatorOrWhitespace(value)).toBe(true)
      })
    })
  })

  describe('isApostrophe', () => {
    it('should return false for non apostrophe characters', () => {
      ;[
        ...charValues,
        ...nonStringValues,
        ...allDoubleQuotes,
        `'f`,
        '’j',
        '‘',
        '‹',
        '›',
        '‚',
        '‘',
        '›',
        '‹',
        `‘`
      ].forEach((value) => {
        expect(isApostrophe(String(value))).toBe(false)
      })
    })

    it('should return true for apostrophe characters', () => {
      ;[`'`, '’'].forEach((value, index) => {
        if (!isApostrophe(value)) {
          console.log(
            `Failed at index ${index}: value="${value}", charCode=${value.charCodeAt(0)}, length=${value.length}, type=${typeof value}`
          )
        }
        expect(isApostrophe(value)).toBe(true)
      })
    })
  })
})

const createRangeWithText = (text: string) => {
  const textNode = document.createTextNode(text)
  const range = document.createRange()
  range.selectNodeContents(textNode)
  return range
}

describe('replaceQuote():', () => {
  const testString = '123 "you'
  const index = testString.indexOf('"')

  it('should replace quote at given index', () => {
    const range = createRangeWithText(testString)
    const replacedTextNode = replaceQuote(range, index, '`')
    expect(replacedTextNode.textContent).toBe('123 `you')
  })

  it('should return null if range is invalid', () => {
    const invalidNodeValue = replaceQuote(undefined, index, '`')
    expect(invalidNodeValue).toBe(null)
  })

  it('should return null if range is empty', () => {
    const range = createRangeWithText('')
    const replacedTextNode = replaceQuote(range, 0, '`')
    expect(replacedTextNode).toBe(null)
  })

  it('should insert quote at the end, if index is out of bounds', () => {
    const range = createRangeWithText(testString)
    const replacedTextNode = replaceQuote(range, 40, '`')
    expect(replacedTextNode.textContent).toBe(`${testString}${'`'}`)
  })
})

describe('shouldApplySmartQuotes():', () => {
  it('returns false when smart quotes are disabled or config is incomplete', () => {
    const target = document.createElement('div')
    Object.defineProperty(target, 'isContentEditable', { value: true })

    expect(shouldApplySmartQuotes({}, target)).toBe(false)
    expect(
      shouldApplySmartQuotes({ smartQuotes: true, quotes: ['\u201C', '\u201D'] }, target)
    ).toBe(false)
    expect(
      shouldApplySmartQuotes(
        {
          smartQuotes: true,
          quotes: ['\u201C', '\u201D'],
          singleQuotes: ['\u2018', '\u2019']
        },
        target
      )
    ).toBe(true)
  })

  it('returns false for non-editable targets', () => {
    const target = document.createElement('div')
    Object.defineProperty(target, 'isContentEditable', { value: false })
    expect(
      shouldApplySmartQuotes(
        {
          smartQuotes: true,
          quotes: ['\u201C', '\u201D'],
          singleQuotes: ['\u2018', '\u2019']
        },
        target
      )
    ).toBe(false)
  })
})

describe('applySmartQuotes():', () => {
  function createEditableRange(text: string, offset: number) {
    const host = document.createElement('div')
    host.contentEditable = 'true'
    document.body.appendChild(host)
    const textNode = document.createTextNode(text)
    host.appendChild(textNode)
    const range = document.createRange()
    range.setStart(textNode, offset)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    return { host, range, textNode }
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('transforms a typed double quote into an opening smart quote', () => {
    const { host, range } = createEditableRange('Hello "', 7)
    applySmartQuotes(
      range,
      { quotes: ['\u201C', '\u201D'], singleQuotes: ['\u2018', '\u2019'] },
      '"',
      host
    )
    expect(host.textContent).toBe('Hello \u201C')
  })

  it('transforms a typed double quote into a closing smart quote after a word', () => {
    const { host, range } = createEditableRange('Hello world"', 12)
    applySmartQuotes(
      range,
      { quotes: ['\u201C', '\u201D'], singleQuotes: ['\u2018', '\u2019'] },
      '"',
      host
    )
    expect(host.textContent).toBe('Hello world\u201D')
  })

  it('ignores characters that are already configured quote glyphs', () => {
    const { host, range } = createEditableRange(`Hello ${'\u201C'}`, 7)
    const before = host.textContent
    applySmartQuotes(
      range,
      { quotes: ['\u201C', '\u201D'], singleQuotes: ['\u2018', '\u2019'] },
      '\u201C',
      host
    )
    expect(host.textContent).toBe(before)
  })
})

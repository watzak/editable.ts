const isValidQuotePairConfig = (quotePair: any): boolean => Array.isArray(quotePair) && quotePair.length === 2

export const shouldApplySmartQuotes = (config: {smartQuotes?: boolean, quotes?: any, singleQuotes?: any}, target: HTMLElement): boolean => {
  const {smartQuotes, quotes, singleQuotes} = config
  return !!smartQuotes && isValidQuotePairConfig(quotes) && isValidQuotePairConfig(singleQuotes) && target.isContentEditable
}

export const isDoubleQuote = (char: string): boolean => /^[\u00AB\u00BB\u201C\u201D\u201E\u0022]$/.test(char)
export const isSingleQuote = (char: string): boolean => /^[\u2018\u2019\u2039\u203A\u201A\u0027]$/.test(char)
export const isApostrophe = (char: string): boolean => /^[\u2019\u0027]$/.test(char)
export const isWhitespace = (char: string): boolean => /^\s$/.test(char)
export const isSeparatorOrWhitespace = (char: string): boolean => /\s|[>\-–—]/.test(char)

const shouldBeOpeningQuote = (text: string[], indexCharBefore: number): boolean => indexCharBefore < 0 || isSeparatorOrWhitespace(text[indexCharBefore])
const shouldBeClosingQuote = (text: string[], indexCharBefore: number): boolean => !!text[indexCharBefore] && !isSeparatorOrWhitespace(text[indexCharBefore])
const hasCharAfter = (textArr: string[], indexCharAfter: number): boolean => !!textArr[indexCharAfter] && !isWhitespace(textArr[indexCharAfter])
const shouldBeSingleOpeningQuote = (text: string[], indexCharBefore: number): boolean => !!text[indexCharBefore] && isDoubleQuote(text[indexCharBefore])

export const replaceQuote = (range: Range, index: number, quoteType: string): Text | null => {
  const startContainer = range?.startContainer
  if (!startContainer || startContainer.nodeType !== 3) { // Node.TEXT_NODE
    return null
  }
  const textNode = startContainer as Text
  const nodeValue = textNode.nodeValue
  if (!nodeValue) {
    return null
  }
  const newText = `${nodeValue.substring(0, index)}${quoteType}${nodeValue.substring(index + 1)}`
  const newTextNode = document.createTextNode(newText)
  textNode.replaceWith(newTextNode)
  return newTextNode
}

const hasSingleOpeningQuote = (textArr: string[], offset: number, singleOpeningQuote: string): boolean => {
  if (offset <= 0) {
    return false
  }
  for (let i = offset - 1; i >= 0; i--) {
    if (isSingleQuote(textArr[i]) && (!isApostrophe(singleOpeningQuote) && !isApostrophe(textArr[i]))) {
      return textArr[i] === singleOpeningQuote
    }
  }
  return false
}

export const applySmartQuotes = (range: Range, config: {quotes: string[], singleQuotes: string[]}, char: string, target: HTMLElement, cursorOffset?: number): void => {
  const isCharSingleQuote = isSingleQuote(char)
  const isCharDoubleQuote = isDoubleQuote(char)

  if (!isCharDoubleQuote && !isCharSingleQuote) {
    return
  }

  const {quotes, singleQuotes} = config
  if (char === quotes[0] || char === quotes[1] || char === singleQuotes[0] || char === singleQuotes[1]) {
    return
  }

  const offset = range.startOffset
  const textContent = range.startContainer.textContent
  if (!textContent) return
  const textArr = [...textContent]
  let newTextNode: Text | null = null

  // Special case for a single quote following a double quote,
  // which should be transformed into a single opening quote
  if (isCharSingleQuote && shouldBeSingleOpeningQuote(textArr, offset - 2)) {
    newTextNode = replaceQuote(range, offset - 1, singleQuotes[0])
  } else if (shouldBeClosingQuote(textArr, offset - 2)) {
    if (isCharSingleQuote) {
      // Don't transform apostrophes
      if (hasCharAfter(textArr, offset)) {
        return
      }
      // Don't transform single-quote if there is no respective single-opening-quote
      if (!hasSingleOpeningQuote(textArr, offset, singleQuotes[0])) {
        return
      }
    }
    const closingQuote = isCharSingleQuote ? singleQuotes[1] : quotes[1]
    newTextNode = replaceQuote(range, offset - 1, closingQuote)
  } else if (shouldBeOpeningQuote(textArr, offset - 2)) {
    const openingQuote = isCharSingleQuote ? singleQuotes[0] : quotes[0]
    newTextNode = replaceQuote(range, offset - 1, openingQuote)
  }

  if (!newTextNode) {
    return
  }

  // Resets the cursor to the currentPosition after applying the smart-quote
  const window = target.ownerDocument.defaultView
  if (!window) return
  const selection = window.getSelection()
  if (!selection) return
  selection.collapse(newTextNode, cursorOffset ?? offset)
}


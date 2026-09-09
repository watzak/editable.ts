export type QuotePair = [string, string]
export type SmartQuotesConfig = {
  smartQuotes?: boolean
  quotes?: QuotePair | string[]
  singleQuotes?: QuotePair | string[]
}

const isValidQuotePairConfig = (quotePair: unknown): quotePair is QuotePair =>
  Array.isArray(quotePair) &&
  quotePair.length === 2 &&
  typeof quotePair[0] === 'string' &&
  typeof quotePair[1] === 'string'

export const shouldApplySmartQuotes = (config: SmartQuotesConfig, target: HTMLElement): boolean => {
  const { smartQuotes, quotes, singleQuotes } = config
  const isEditableTarget =
    !!target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true' ||
    target.getAttribute('contenteditable') === ''

  return (
    !!smartQuotes &&
    isValidQuotePairConfig(quotes) &&
    isValidQuotePairConfig(singleQuotes) &&
    isEditableTarget
  )
}

export const isDoubleQuote = (char: string): boolean =>
  /^[\u00AB\u00BB\u201C\u201D\u201E\u0022]$/.test(char)
export const isSingleQuote = (char: string): boolean =>
  /^[\u2018\u2019\u2039\u203A\u201A\u0027]$/.test(char)
export const isApostrophe = (char: string): boolean => /^[\u2019\u0027]$/.test(char)
export const isWhitespace = (char: string): boolean => /^\s$/.test(char)
export const isSeparatorOrWhitespace = (char: string): boolean => /\s|[>\-–—]/.test(char)

const shouldBeOpeningQuote = (text: string[], indexCharBefore: number): boolean =>
  indexCharBefore < 0 || isSeparatorOrWhitespace(text[indexCharBefore])
const shouldBeClosingQuote = (text: string[], indexCharBefore: number): boolean =>
  !!text[indexCharBefore] && !isSeparatorOrWhitespace(text[indexCharBefore])
const hasCharAfter = (textArr: string[], indexCharAfter: number): boolean =>
  !!textArr[indexCharAfter] && !isWhitespace(textArr[indexCharAfter])
const shouldBeSingleOpeningQuote = (text: string[], indexCharBefore: number): boolean =>
  !!text[indexCharBefore] && isDoubleQuote(text[indexCharBefore])

export const replaceQuote = (range: Range, index: number, quoteType: string): Text | null => {
  const startContainer = range?.startContainer
  if (!startContainer || startContainer.nodeType !== 3) {
    // Node.TEXT_NODE
    return null
  }
  const textNode = startContainer as Text
  const nodeValue = textNode.nodeValue
  if (!nodeValue) {
    return null
  }
  const newText = `${nodeValue.substring(0, index)}${quoteType}${nodeValue.substring(index + 1)}`
  const doc = textNode.ownerDocument
  if (!doc) return null
  const newTextNode = doc.createTextNode(newText)
  textNode.replaceWith(newTextNode)
  return newTextNode
}

const hasSingleOpeningQuote = (
  textArr: string[],
  offset: number,
  singleOpeningQuote: string
): boolean => {
  if (offset <= 0) {
    return false
  }
  for (let i = offset - 1; i >= 0; i--) {
    if (
      isSingleQuote(textArr[i]) &&
      !isApostrophe(singleOpeningQuote) &&
      !isApostrophe(textArr[i])
    ) {
      return textArr[i] === singleOpeningQuote
    }
  }
  return false
}

export interface SmartQuoteReplacement {
  index: number
  replacement: string
  applyDom: (host: HTMLElement) => void
}

/** Resolves a smart-quote replacement from operation plain text (no delayed DOM write). */
export function resolveSmartQuoteOperation(
  _textBefore: string,
  textAfter: string,
  char: string,
  config: { quotes: QuotePair | string[]; singleQuotes: QuotePair | string[] }
): SmartQuoteReplacement | undefined {
  const resolution = resolveSmartQuoteIndex(textAfter, char, config)
  if (!resolution) return undefined

  const { index, replacement } = resolution
  return {
    index,
    replacement,
    applyDom(host: HTMLElement) {
      const textNode = findTextNodeAtOffset(host, index)
      if (!textNode) return
      const doc = host.ownerDocument
      if (!doc) return
      const range = doc.createRange()
      range.setStart(textNode.node, textNode.offset)
      range.collapse(true)
      replaceQuote(range, textNode.offset, replacement)
    }
  }
}

function findTextNodeAtOffset(
  host: HTMLElement,
  targetOffset: number
): { node: Text; offset: number } | undefined {
  const walker = host.ownerDocument?.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  if (!walker) return undefined

  let remaining = targetOffset
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const length = node.data.length
    if (remaining < length) {
      return { node, offset: remaining }
    }
    remaining -= length
  }
  return undefined
}

function resolveSmartQuoteIndex(
  textAfter: string,
  char: string,
  config: { quotes: QuotePair | string[]; singleQuotes: QuotePair | string[] }
): { index: number; replacement: string } | undefined {
  const isCharSingleQuote = isSingleQuote(char)
  const isCharDoubleQuote = isDoubleQuote(char)
  if (!isCharDoubleQuote && !isCharSingleQuote) return undefined

  const { quotes, singleQuotes } = config
  if (
    char === quotes[0] ||
    char === quotes[1] ||
    char === singleQuotes[0] ||
    char === singleQuotes[1]
  ) {
    return undefined
  }

  const offset = textAfter.lastIndexOf(char)
  if (offset < 0) return undefined

  const textArr = [...textAfter]
  let replacement: string | undefined

  if (isCharSingleQuote && shouldBeSingleOpeningQuote(textArr, offset - 1)) {
    replacement = singleQuotes[0]
  } else if (shouldBeClosingQuote(textArr, offset - 1)) {
    if (isCharSingleQuote) {
      if (hasCharAfter(textArr, offset + 1)) return undefined
      if (!hasSingleOpeningQuote(textArr, offset + 1, singleQuotes[0])) return undefined
    }
    replacement = isCharSingleQuote ? singleQuotes[1] : quotes[1]
  } else if (shouldBeOpeningQuote(textArr, offset - 1)) {
    replacement = isCharSingleQuote ? singleQuotes[0] : quotes[0]
  }

  if (!replacement) return undefined
  return { index: offset, replacement }
}

export const applySmartQuotes = (
  range: Range,
  config: { quotes: QuotePair | string[]; singleQuotes: QuotePair | string[] },
  char: string,
  target: HTMLElement,
  cursorOffset?: number
): void => {
  const isCharSingleQuote = isSingleQuote(char)
  const isCharDoubleQuote = isDoubleQuote(char)

  if (!isCharDoubleQuote && !isCharSingleQuote) {
    return
  }

  const { quotes, singleQuotes } = config
  if (
    char === quotes[0] ||
    char === quotes[1] ||
    char === singleQuotes[0] ||
    char === singleQuotes[1]
  ) {
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

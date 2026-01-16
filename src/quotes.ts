const doubleQuotePairs = [
  ['«', '»'], // ch german, french
  ['»', '«'], // danish
  ['"', '"'], // danish, not specified
  ['“', '”'], // english US
  ['”', '”'], // swedish
  ['“', '“'], // chinese simplified
  ['„', '“'] // german
]
const singleQuotePairs = [
  ['‘', '’'], // english UK
  ['‹', '›'], // ch german, french
  ['‚', '‘'], // german
  ['’', '’'], // swedish
  ['›', '‹'], // danish
  [`'`, `'`], // danish, not specified
  [`‘`, `’`] // chinese simplified
]

const apostrophe = [
  '’', // german
  `'` // default
]
const quotesRegex = /([‘’‹›‚'«»"“”„])(?![^<]*?>)/g
// whitespace end of tag, or any dash (normal, en or em-dash)
// or any opening double quote
const beforeOpeningQuote = /\s|[>\-–—«»”"“„]/

// whitespace begin of tag, or any dash (normal, en or em-dash)
// or any closing quote, or any punctuation
const afterClosingQuote = /\s|[<\-–—«»”"“‘’‹›'.;?:,]/

interface QuoteMatch {
  char: string
  before: string
  after: string
  replace?: string
}

interface Replacements {
  quotes?: string[]
  singleQuotes?: string[]
  apostrophe?: string
}

let replacements: Replacements

export function replaceAllQuotes (str: string, replaceQuotesRules?: Replacements): string {
  replacements = replaceQuotesRules || {}
  replacements.quotes = replacements.quotes || [undefined as any, undefined as any]
  replacements.singleQuotes = replacements.singleQuotes || [undefined as any, undefined as any]

  const matches = getAllQuotes(str)
  if (matches.length > 0) {
    replaceMatchedQuotes(matches, 0)
    return replaceExistingQuotes(str, matches)
  }

  return str
}

function replaceMatchedQuotes (matches: QuoteMatch[], position: number): void {
  while (position < matches.length) {
    const closingTag = findClosingQuote(matches, position)

    if (closingTag) {
      matches[position].replace = closingTag.type === 'double'
        ? replacements.quotes?.[0]
        : replacements.singleQuotes?.[0]

      matches[closingTag.position].replace = closingTag.type === 'double'
        ? replacements.quotes?.[1]
        : replacements.singleQuotes?.[1]

      if (closingTag.position !== position + 1) {
        const nestedMatches = matches.slice(position + 1, closingTag.position)
        if (nestedMatches && nestedMatches.length > 0) {
          replaceMatchedQuotes(nestedMatches, 0)
        }
      }

      position = closingTag.position + 1
    } else {
      matches[position].replace = replaceApostrophe(matches[position].char)
      position += 1
    }
  }
}

function findClosingQuote (matches: QuoteMatch[], position: number): {position: number, type: 'single' | 'double'} | undefined {
  if (position === matches.length - 1) return undefined
  const current = matches[position]
  const openingQuote = current.char

  if (current.before && !beforeOpeningQuote.test(current.before)) return undefined

  const possibleClosingSingleQuotes = getPossibleClosingQuotes(openingQuote, singleQuotePairs)
  const possibleClosingDoubleQuotes = getPossibleClosingQuotes(openingQuote, doubleQuotePairs)
  // Also allow straight quotes as potential closers when we have quote pairs (they can be converted)
  // But only for the same quote type (straight double quote for double quotes, straight single quote for single quotes)
  let allPossibleDoubleClosers = possibleClosingDoubleQuotes
  let allPossibleSingleClosers = possibleClosingSingleQuotes
  const hasStraightQuoteFallback = (possibleClosingDoubleQuotes.length > 0 && !possibleClosingDoubleQuotes.includes('"')) ||
    (possibleClosingSingleQuotes.length > 0 && !possibleClosingSingleQuotes.includes("'"))
  // Only add straight double quote if this is a double quote type (has double quote pairs defined)
  if (possibleClosingDoubleQuotes.length > 0 && !possibleClosingDoubleQuotes.includes('"')) {
    allPossibleDoubleClosers = [...possibleClosingDoubleQuotes, '"']
  }
  // Only add straight single quote if this is a single quote type (has single quote pairs defined)
  if (possibleClosingSingleQuotes.length > 0 && !possibleClosingSingleQuotes.includes("'")) {
    allPossibleSingleClosers = [...possibleClosingSingleQuotes, "'"]
  }
  
  // Check if opening quote is itself a straight quote - if so, prefer outermost match
  const isStraightQuote = openingQuote === '"' || openingQuote === "'"
  
  // Prefer exact pair matches over straight quote fallbacks
  // For straight quote fallbacks or straight quotes themselves, prefer outermost match to avoid incorrect nested matching
  let bestStraightQuoteMatch: {position: number, type: 'single' | 'double'} | undefined
  
  for (let i = position + 1; i < matches.length; i++) {
    const candidateChar = matches[i].char
    const candidateAfter = matches[i].after
    const passesAfterCheck = (candidateAfter && afterClosingQuote.test(candidateAfter)) || !candidateAfter
    
    if (passesAfterCheck) {
      if (allPossibleSingleClosers.includes(candidateChar)) {
        // Check if this is an exact pair match (not a straight quote fallback)
        const isExactMatch = possibleClosingSingleQuotes.includes(candidateChar)
        // For straight quotes themselves, always prefer outermost match
        if (isExactMatch && !isStraightQuote) {
          // Return immediately for exact pair matches (except for straight quotes)
          return {position: i, type: 'single'}
        }
        // For straight quote fallbacks or straight quotes themselves, continue searching for the outermost match
        if (hasStraightQuoteFallback || isStraightQuote) {
          if (!bestStraightQuoteMatch || (bestStraightQuoteMatch.type === 'single' && i > bestStraightQuoteMatch.position)) {
            bestStraightQuoteMatch = {position: i, type: 'single'}
          }
        } else {
          return {position: i, type: 'single'}
        }
      }
      if (allPossibleDoubleClosers.includes(candidateChar)) {
        // Check if this is an exact pair match (not a straight quote fallback)
        const isExactMatch = possibleClosingDoubleQuotes.includes(candidateChar)
        // For straight quotes themselves, always prefer outermost match
        if (isExactMatch && !isStraightQuote) {
          // Return immediately for exact pair matches (except for straight quotes)
          return {position: i, type: 'double'}
        }
        // For straight quote fallbacks or straight quotes themselves, continue searching for the outermost match
        if (hasStraightQuoteFallback || isStraightQuote) {
          if (!bestStraightQuoteMatch || (bestStraightQuoteMatch.type === 'double' && i > bestStraightQuoteMatch.position)) {
            bestStraightQuoteMatch = {position: i, type: 'double'}
          }
        } else {
          return {position: i, type: 'double'}
        }
      }
    }
  }
  // Return the outermost straight quote match if we found one
  if (bestStraightQuoteMatch) {
    return bestStraightQuoteMatch
  }
  return undefined
}

function getPossibleClosingQuotes (openingQuote: string, pairs: string[][]): string[] {
  return pairs.filter((quotePair: string[]) => quotePair[0] === openingQuote).map((quotePair: string[]) => quotePair[1])
}


function replaceApostrophe (quote: string): string | undefined {
  if (apostrophe.includes(quote)) {
    return replacements.apostrophe
  }
  return undefined
}

function getAllQuotes (str: string): QuoteMatch[] {
  return [...str.matchAll(quotesRegex)].map((match) => {
    const index = match.index!
    return {
      char: match[1],
      before: index > 0 ? str[index - 1] : '',
      after: (index + 1) < str.length ? str[index + 1] : ''
    }
  })
}

function replaceExistingQuotes (str: string, matches: QuoteMatch[]): string {
  let index = 0
  return str.replace(quotesRegex, (match: string) => {
    const replacement = matches[index].replace || matches[index].char
    index += 1
    return replacement
  })
}

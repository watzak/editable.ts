import * as content from '../../content.js'

/**
* Spellcheck class.
*
* @class Spellcheck
* @constructor
*/
export default class SpellcheckService {
  private spellcheckService: (text: string, callback: (misspelledWords: string[] | null) => void) => void

  constructor (spellcheckService: (text: string, callback: (misspelledWords: string[] | null) => void) => void) {
    this.spellcheckService = spellcheckService
  }

  check (text: string, callback: (error: null, misspelledWords?: string[] | null) => void): void {
    if (!text) return callback(null)

    const condensedText = content.normalizeWhitespace(text)

    this.spellcheckService(condensedText, (misspelledWords) => {
      if (misspelledWords && misspelledWords.length > 0) {
        return callback(null, misspelledWords)
      }
      return callback(null)
    })
  }

}

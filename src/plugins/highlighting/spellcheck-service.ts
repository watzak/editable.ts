import * as content from '../../content.js'
import type {
  SpellcheckCheckCallback,
  SpellcheckResult,
  SpellcheckServiceHandler
} from '../../plugin-types.js'

/**
* Spellcheck class.
*
* @class Spellcheck
* @constructor
*/
export default class SpellcheckService {
  private spellcheckService: SpellcheckServiceHandler

  constructor (spellcheckService: SpellcheckServiceHandler) {
    this.spellcheckService = spellcheckService
  }

  check (text: string, callback: SpellcheckCheckCallback): void {
    if (!text) return callback(null)

    const condensedText = content.normalizeWhitespace(text)

    this.spellcheckService(condensedText, (misspelledWords?: SpellcheckResult) => {
      if (misspelledWords && misspelledWords.length > 0) {
        return callback(null, misspelledWords)
      }
      return callback(null)
    })
  }

}

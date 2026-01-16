

import {searchText, searchWord} from '../src/plugins/highlighting/text-search.js'

describe('text-search:', function () {

  describe('searchWord()', function () {

    it('finds the word "a"', function () {
      const text = 'a'
      const matches = searchWord(text, 'a')

      const firstMatch = matches[0]
      expect(firstMatch.match).toBe('a')
      expect(firstMatch.startIndex).toBe(0)
      expect(firstMatch.endIndex).toBe(1)
    })

    it('does not find the word "b"', function () {
      const text = 'a'
      const matches = searchWord(text, 'b')
      expect(matches.length).toBe(0)
    })

    it('finds the word "juice"', function () {
      const text = 'Some juice.'
      const matches = searchWord(text, 'juice')
      const firstMatch = matches[0]
      expect(firstMatch.match).toBe('juice')
      expect(firstMatch.startIndex).toBe(5)
      expect(firstMatch.endIndex).toBe(10)
    })
  })

  describe('searchText()', function () {

    it('does not go into an endless loop without a marker node', function () {
      const blockText = 'Mehr als 90 Prozent der Fälle in Grossbritannien in den letzten vier Wochen gehen auf die Delta-Variante zurück. Anders als bei vorangegangenen Wellen scheinen sich jedoch die Fallzahlen von den Todesfällen und Hospitalisierungen zu entkoppeln.'
      const matches = searchText(blockText, 'foobar')
      expect(matches).toEqual([])
    })

    it('does not go into an endless loop without a html marker node', function () {
      const blockText = 'Mehr als 90 Prozent der Fälle in Grossbritannien in den letzten vier Wochen gehen auf die Delta-Variante zurück. Anders als bei vorangegangenen Wellen scheinen sich jedoch die Fallzahlen von den Todesfällen und Hospitalisierungen zu entkoppeln.'
      const matches = searchText(blockText, 'foobar')
      expect(matches).toEqual([])
    })

    it('handles the marker with a different owner-document correctly', function () {
      const blockText = 'Mehr als 90 Prozent'
      const text = 'Mehr als 90 Prozent'
      const ifrm = window.document.createElement('iframe')
      window.document.body.append(ifrm)
      const matches = searchText(blockText, text)
      expect(matches[0].match).toBe(text)
    })
  })
})

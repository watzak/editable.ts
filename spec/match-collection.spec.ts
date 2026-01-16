
import MatchCollection from '../src/plugins/highlighting/match-collection.js'


describe('MatchCollection', function () {

  describe('new MatchCollection()', function () {

    it('creates an instance', function () {
      const matches = new MatchCollection()
      expect(matches).toBeInstanceOf(MatchCollection)
    })

  })

  describe('addMatches()', function () {
    let collection: MatchCollection

    beforeEach(function () {
      collection = new MatchCollection()
    })


    it('adds a match', function () {
      collection.addMatches([{
        startIndex: 0,
        endIndex: 1
      }])

      expect(collection.matches).toEqual([{
        startIndex: 0,
        endIndex: 1
      }])
    })

    it('merges two matches', function () {
      collection.addMatches([{
        startIndex: 0,
        endIndex: 1
      }])

      collection.addMatches([{
        startIndex: 1,
        endIndex: 2
      }])

      expect(collection.matches).toEqual([{
        startIndex: 0,
        endIndex: 1
      }, {
        startIndex: 1,
        endIndex: 2
      }])
    })


    it('prevents overlaps', function () {
      collection.addMatches([{
        startIndex: 0,
        endIndex: 2
      }])

      collection.addMatches([{
        startIndex: 1,
        endIndex: 2
      }])

      expect(collection.matches).toEqual([{
        startIndex: 0,
        endIndex: 2
      }])
    })
  })

})

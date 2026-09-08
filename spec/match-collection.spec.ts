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
      collection.addMatches([
        {
          startIndex: 0,
          endIndex: 1,
          match: 'x'
        }
      ])

      expect(collection.matches).toEqual([
        {
          startIndex: 0,
          endIndex: 1,
          match: 'x'
        }
      ])
    })

    it('merges two matches', function () {
      collection.addMatches([
        {
          startIndex: 0,
          endIndex: 1,
          match: 'x'
        }
      ])

      collection.addMatches([
        {
          startIndex: 1,
          endIndex: 2,
          match: 'y'
        }
      ])

      expect(collection.matches).toEqual([
        {
          startIndex: 0,
          endIndex: 1,
          match: 'x'
        },
        {
          startIndex: 1,
          endIndex: 2,
          match: 'y'
        }
      ])
    })

    it('prevents overlaps', function () {
      collection.addMatches([
        {
          startIndex: 0,
          endIndex: 2,
          match: 'ab'
        }
      ])

      collection.addMatches([
        {
          startIndex: 1,
          endIndex: 2,
          match: 'b'
        }
      ])

      expect(collection.matches).toEqual([
        {
          startIndex: 0,
          endIndex: 2,
          match: 'ab'
        }
      ])
    })
  })
})

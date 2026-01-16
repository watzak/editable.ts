import {escapeHtml} from '../src/util/string.js'

describe('string util', function () {

  describe('escapeHtml()', function () {

    it('escapes <, > and &', function () {
      expect(escapeHtml('<>&')).toBe('&lt;&gt;&amp;')
    })

    it('escapes <, >, &, " and \' for attributes', function () {
      expect(escapeHtml('<>&\'"', 'attribute')).toBe('&lt;&gt;&amp;&#39;&quot;')
    })
  })
})

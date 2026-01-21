import {computeDiff, type DiffOperation} from '../../src/plugins/text-diff/diff-algorithm.js'

describe('diff-algorithm:', function () {
  describe('computeDiff:', function () {
    it('should return equal operation for identical strings', function () {
      const result = computeDiff('hello', 'hello')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('equal')
      expect(result[0].value).toBe('hello')
      expect(result[0].oldStart).toBe(0)
      expect(result[0].oldEnd).toBe(5)
      expect(result[0].newStart).toBe(0)
      expect(result[0].newEnd).toBe(5)
    })

    it('should handle empty old text', function () {
      const result = computeDiff('', 'hello')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('insert')
      expect(result[0].value).toBe('hello')
      expect(result[0].oldStart).toBe(0)
      expect(result[0].oldEnd).toBe(0)
      expect(result[0].newStart).toBe(0)
      expect(result[0].newEnd).toBe(5)
    })

    it('should handle empty new text', function () {
      const result = computeDiff('hello', '')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('delete')
      expect(result[0].value).toBe('hello')
      expect(result[0].oldStart).toBe(0)
      expect(result[0].oldEnd).toBe(5)
      expect(result[0].newStart).toBe(0)
      expect(result[0].newEnd).toBe(0)
    })

    it('should handle both empty strings', function () {
      const result = computeDiff('', '')
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('equal')
      expect(result[0].value).toBe('')
    })

    it('should handle simple insertion at start', function () {
      const result = computeDiff('world', 'hello world')
      expect(result.length).toBeGreaterThan(0)
      const insertOps = result.filter(op => op.type === 'insert')
      expect(insertOps.length).toBeGreaterThan(0)
      expect(insertOps[0].value).toContain('hello')
    })

    it('should handle simple insertion at end', function () {
      const result = computeDiff('hello', 'hello world')
      expect(result.length).toBeGreaterThan(0)
      const insertOps = result.filter(op => op.type === 'insert')
      expect(insertOps.length).toBeGreaterThan(0)
      expect(insertOps.some(op => op.value.includes('world'))).toBe(true)
    })

    it('should handle simple deletion', function () {
      const result = computeDiff('hello world', 'hello')
      expect(result.length).toBeGreaterThan(0)
      const deleteOps = result.filter(op => op.type === 'delete')
      expect(deleteOps.length).toBeGreaterThan(0)
      expect(deleteOps.some(op => op.value.includes('world'))).toBe(true)
    })

    it('should handle replacement', function () {
      const result = computeDiff('hello', 'world')
      expect(result.length).toBeGreaterThan(0)
      const deleteOps = result.filter(op => op.type === 'delete')
      const insertOps = result.filter(op => op.type === 'insert')
      expect(deleteOps.length).toBeGreaterThan(0)
      expect(insertOps.length).toBeGreaterThan(0)
    })

    it('should handle single character change', function () {
      const result = computeDiff('a', 'b')
      expect(result.length).toBeGreaterThan(0)
      const hasDelete = result.some(op => op.type === 'delete' && op.value === 'a')
      const hasInsert = result.some(op => op.type === 'insert' && op.value === 'b')
      expect(hasDelete || hasInsert).toBe(true)
    })

    it('should handle multiple changes', function () {
      const result = computeDiff('hello world', 'hi there')
      expect(result.length).toBeGreaterThan(0)
      const deleteOps = result.filter(op => op.type === 'delete')
      const insertOps = result.filter(op => op.type === 'insert')
      expect(deleteOps.length + insertOps.length).toBeGreaterThan(0)
    })

    it('should handle whitespace-only changes', function () {
      const result = computeDiff('hello world', 'hello  world')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle unicode characters', function () {
      const result = computeDiff('hello', 'héllo')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle special characters', function () {
      const result = computeDiff('hello!', 'hello?')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle newlines', function () {
      const result = computeDiff('hello\nworld', 'hello\n\nworld')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should preserve operation order', function () {
      const result = computeDiff('abc', 'xyz')
      // Should have delete operations before insert operations (or mixed)
      expect(result.length).toBeGreaterThan(0)
      // Verify operations can reconstruct original texts correctly
      let reconstructedOld = ''
      let reconstructedNew = ''
      for (const op of result) {
        if (op.type === 'delete' || op.type === 'equal') {
          reconstructedOld += op.value
        }
        if (op.type === 'insert' || op.type === 'equal') {
          reconstructedNew += op.value
        }
      }
      expect(reconstructedOld).toBe('abc')
      expect(reconstructedNew).toBe('xyz')
    })

    it('should handle very long strings', function () {
      const longText = 'a'.repeat(1000)
      const modifiedText = 'b' + longText.substring(1)
      const result = computeDiff(longText, modifiedText)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should reconstruct text correctly from operations', function () {
      const oldText = 'hello world'
      const newText = 'hello there'
      const result = computeDiff(oldText, newText)
      
      // Reconstruct old text from delete and equal operations
      let reconstructedOld = ''
      for (const op of result) {
        if (op.type === 'delete' || op.type === 'equal') {
          reconstructedOld += op.value
        }
      }
      expect(reconstructedOld).toBe(oldText)
      
      // Reconstruct new text from insert and equal operations
      let reconstructedNew = ''
      for (const op of result) {
        if (op.type === 'insert' || op.type === 'equal') {
          reconstructedNew += op.value
        }
      }
      expect(reconstructedNew).toBe(newText)
    })

    it('should handle text with same prefix and suffix', function () {
      const result = computeDiff('abc123def', 'abc456def')
      expect(result.length).toBeGreaterThan(0)
      // Should have equal parts at start and end
      const firstOp = result[0]
      const lastOp = result[result.length - 1]
      if (firstOp.type === 'equal') {
        expect(firstOp.value).toContain('abc')
      }
      if (lastOp.type === 'equal') {
        expect(lastOp.value).toContain('def')
      }
    })

    it('should handle complete replacement', function () {
      const result = computeDiff('old', 'new')
      expect(result.length).toBeGreaterThan(0)
      const deleteOps = result.filter(op => op.type === 'delete')
      const insertOps = result.filter(op => op.type === 'insert')
      expect(deleteOps.length).toBeGreaterThan(0)
      expect(insertOps.length).toBeGreaterThan(0)
    })

    it('should handle insertion in middle', function () {
      const result = computeDiff('hello', 'he llo')
      expect(result.length).toBeGreaterThan(0)
      const insertOps = result.filter(op => op.type === 'insert')
      expect(insertOps.length).toBeGreaterThan(0)
    })

    it('should handle deletion in middle', function () {
      const result = computeDiff('hello', 'hllo')
      expect(result.length).toBeGreaterThan(0)
      const deleteOps = result.filter(op => op.type === 'delete')
      expect(deleteOps.length).toBeGreaterThan(0)
    })
  })
})

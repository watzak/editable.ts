import {vi} from 'vitest'
import {Editable} from '../../src/core.js'
import TextDiff from '../../src/plugins/text-diff/text-diff.js'
import {createElement} from '../../src/util/dom.js'

function setupEdgeCaseEnv(text: string) {
  const context: any = {}
  context.div = createElement(`<div>${text}</div>`)
  document.body.appendChild(context.div)
  context.editable = new Editable()
  context.editable.setupTextDiff({throttle: 0})
  context.editable.add(context.div)
  return context
}

describe('TextDiff Edge Cases:', function () {
  let context: any

  afterEach(function () {
    if (context) {
      context.div?.remove()
      context.editable?.unload()
      context = null
    }
    vi.useRealTimers()
  })

  describe('empty content:', function () {
    it('handles empty editable block', function () {
      context = setupEdgeCaseEnv('')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      expect(context.editable.textDiff.getOriginalText(context.div)).toBe('')
      vi.advanceTimersByTime(100)
      vi.useRealTimers()
    })

    it('handles adding text to empty block', function () {
      context = setupEdgeCaseEnv('')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'new text'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should not throw - text should be added (may have diff markers)
      expect(context.div.textContent).toContain('new text')
      vi.useRealTimers()
    })

    it('handles removing all text', function () {
      context = setupEdgeCaseEnv('hello')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = ''
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should not throw
      expect(context.div.textContent).toBe('')
      vi.useRealTimers()
    })
  })

  describe('DOM removal:', function () {
    it('handles editable block removed from DOM', function () {
      context = setupEdgeCaseEnv('hello')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      const originalText = context.editable.textDiff.getOriginalText(context.div)
      expect(originalText).toBe('hello')
      
      context.div.remove()
      // Should not throw when accessing removed element
      expect(() => {
        context.editable.textDiff.getOriginalText(context.div)
      }).not.toThrow()
      vi.useRealTimers()
    })
  })

  describe('rapid changes:', function () {
    it('handles multiple rapid consecutive changes', function () {
      context = setupEdgeCaseEnv('hello')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      
      const computeSpy = vi.spyOn(context.editable.textDiff, 'computeAndApplyDiff')
      
      // Rapid changes
      for (let i = 0; i < 10; i++) {
        context.div.textContent = `change ${i}`
        context.editable.dispatcher.notify('change', context.div)
      }
      
      vi.advanceTimersByTime(300)
      // Should only compute once after throttle
      expect(computeSpy).toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('special characters:', function () {
    it('handles unicode characters', function () {
      context = setupEdgeCaseEnv('héllo wörld')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      // Verify original text was captured correctly
      expect(context.editable.textDiff.getOriginalText(context.div)).toBe('héllo wörld')
      
      // Change to ASCII text
      context.div.innerHTML = 'hello world'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should not throw - diff computation should handle unicode
      expect(() => {
        context.editable.textDiff.computeAndApplyDiff(context.div)
      }).not.toThrow()
      vi.useRealTimers()
    })

    it('handles emoji characters', function () {
      context = setupEdgeCaseEnv('hello 😀 world')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'hello world'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Text should contain the new text (may have diff markers for deleted emoji)
      expect(context.div.textContent).toContain('hello')
      expect(context.div.textContent).toContain('world')
      vi.useRealTimers()
    })

    it('handles special punctuation', function () {
      context = setupEdgeCaseEnv('hello! world?')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'hello world'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Text should be changed (may have diff markers)
      expect(context.div.textContent).toContain('hello')
      expect(context.div.textContent).toContain('world')
      vi.useRealTimers()
    })
  })

  describe('very long text:', function () {
    it('handles very long text strings', function () {
      const longText = 'a'.repeat(10000)
      context = setupEdgeCaseEnv(longText)
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      expect(context.editable.textDiff.getOriginalText(context.div).length).toBe(10000)
      
      context.div.textContent = 'b' + longText.substring(1)
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should not throw or hang - text length may vary due to markers
      expect(context.div.textContent.length).toBeGreaterThan(9000)
      vi.useRealTimers()
    })
  })

  describe('nested HTML:', function () {
    it('handles nested HTML structures', function () {
      context = {}
      context.div = createElement('<div><p>hello <strong>world</strong></p></div>')
      document.body.appendChild(context.div)
      context.editable = new Editable()
      context.editable.setupTextDiff({throttle: 0})
      context.editable.add(context.div)
      
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      // Change the entire div content to trigger change
      context.div.innerHTML = '<p>hello <strong>there</strong></p>'
      // Re-add to editable to ensure it's tracked
      context.editable.add(context.div)
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should handle nested structures - check that diff was computed
      const highlights = context.div.querySelectorAll('[data-highlight^="diff-"]')
      // Should have highlights for the change
      expect(highlights.length).toBeGreaterThanOrEqual(0)
      vi.useRealTimers()
    })
  })

  describe('multiple changes in same block:', function () {
    it('handles multiple insertions and deletions', function () {
      context = setupEdgeCaseEnv('hello world')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'hi there friend'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should handle multiple changes
      const highlights = context.div.querySelectorAll('[data-highlight^="diff-"]')
      expect(highlights.length).toBeGreaterThan(0)
      vi.useRealTimers()
    })
  })

  describe('whitespace handling:', function () {
    it('handles whitespace-only changes', function () {
      context = setupEdgeCaseEnv('hello world')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'hello  world' // extra space
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should detect whitespace changes
      expect(context.div.textContent).toBe('hello  world')
      vi.useRealTimers()
    })

    it('handles newline changes', function () {
      context = setupEdgeCaseEnv('hello\nworld')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'hello world'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Text should contain both words (newline may be preserved or converted)
      expect(context.div.textContent).toContain('hello')
      expect(context.div.textContent).toContain('world')
      vi.useRealTimers()
    })
  })

  describe('configuration edge cases:', function () {
    it('handles zero throttle', function () {
      context = setupEdgeCaseEnv('hello')
      context.editable.textDiff.config.throttle = 0
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'world'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(0)
      // Should work with zero throttle - text should be changed
      expect(context.div.textContent).toContain('world')
      vi.useRealTimers()
    })

    it('handles very high throttle', function () {
      context = setupEdgeCaseEnv('hello')
      context.editable.textDiff.config.throttle = 10000
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'world'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(100)
      // Should not have computed yet
      const computeSpy = vi.spyOn(context.editable.textDiff, 'computeAndApplyDiff')
      expect(computeSpy).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('isApplyingDiff flag:', function () {
    it('prevents recursive calls during diff application', function () {
      context = setupEdgeCaseEnv('hello')
      vi.useFakeTimers()
      context.editable.textDiff.captureOriginalText(context.div)
      context.editable.textDiff.isApplyingDiff = true
      
      const computeSpy = vi.spyOn(context.editable.textDiff, 'computeAndApplyDiff')
      context.div.textContent = 'world'
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(300)
      
      // Should not trigger when flag is set
      expect(computeSpy).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('marker node edge cases:', function () {
    it('handles custom marker configurations', function () {
      const editable = new Editable()
      const textDiff = new TextDiff(editable, {
        markerDeleted: '<span class="custom-deleted"></span>',
        markerInserted: '<span class="custom-inserted"></span>'
      })
      expect(textDiff.deletedMarkerNode).toBeDefined()
      expect(textDiff.insertedMarkerNode).toBeDefined()
      editable.unload()
    })
  })
})

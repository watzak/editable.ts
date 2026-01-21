import {vi} from 'vitest'
import {Editable} from '../../src/core.js'
import {createElement} from '../../src/util/dom.js'
import highlightText from '../../src/highlight-text.js'

function setupIntegrationEnv() {
  const context: any = {}
  context.editable = new Editable()
  context.div1 = createElement('<div>hello world</div>')
  context.div2 = createElement('<div>foo bar</div>')
  document.body.appendChild(context.div1)
  document.body.appendChild(context.div2)
  
  return context
}

describe('TextDiff Integration:', function () {
  let context: any

  afterEach(function () {
    if (context) {
      context.div1?.remove()
      context.div2?.remove()
      context.editable?.unload()
      context = null
    }
  })

  describe('setupTextDiff:', function () {
    it('adds textDiff instance to editable', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({})
      expect(context.editable.textDiff).toBeDefined()
      expect(context.editable.textDiff.editable).toBe(context.editable)
    })

    it('allows chaining', function () {
      context = setupIntegrationEnv()
      const result = context.editable.setupTextDiff({})
      expect(result).toBe(context.editable)
    })
  })

  describe('multiple editable blocks:', function () {
    it('tracks original text independently for each block', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true})
      context.editable.add(context.div1)
      context.editable.add(context.div2)
      
      // Wait for init events
      vi.useFakeTimers()
      vi.advanceTimersByTime(100)
      
      expect(context.editable.textDiff.getOriginalText(context.div1)).toBe('hello world')
      expect(context.editable.textDiff.getOriginalText(context.div2)).toBe('foo bar')
      
      vi.useRealTimers()
    })

    it('computes diffs independently for each block', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true, throttle: 0})
      context.editable.add(context.div1)
      context.editable.add(context.div2)
      
      vi.useFakeTimers()
      vi.advanceTimersByTime(100)
      
      // Change first block
      context.div1.textContent = 'hello there'
      context.editable.dispatcher.notify('change', context.div1)
      vi.advanceTimersByTime(100)
      
      // Second block should still have original text
      expect(context.editable.textDiff.getOriginalText(context.div2)).toBe('foo bar')
      
      vi.useRealTimers()
    })
  })

  describe('diff highlighting:', function () {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('applies insertion highlights', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true, throttle: 0})
      context.editable.add(context.div1)
      vi.advanceTimersByTime(100)
      
      context.div1.textContent = 'hello new world'
      context.editable.dispatcher.notify('change', context.div1)
      vi.advanceTimersByTime(100)
      
      const inserted = context.div1.querySelectorAll('[data-highlight="diff-inserted"]')
      expect(inserted.length).toBeGreaterThan(0)
    })

    it('applies deletion highlights', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true, throttle: 0})
      context.editable.add(context.div1)
      vi.advanceTimersByTime(100)
      
      context.div1.textContent = 'hello'
      context.editable.dispatcher.notify('change', context.div1)
      vi.advanceTimersByTime(100)
      
      const deleted = context.div1.querySelectorAll('[data-highlight="diff-deleted"]')
      expect(deleted.length).toBeGreaterThan(0)
    })

    it('clears highlights when text matches original', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true, throttle: 0})
      context.editable.add(context.div1)
      vi.advanceTimersByTime(100)
      
      // Change text
      context.div1.textContent = 'changed'
      context.editable.dispatcher.notify('change', context.div1)
      vi.advanceTimersByTime(100)
      
      // Revert to original
      context.div1.textContent = 'hello world'
      context.editable.dispatcher.notify('change', context.div1)
      vi.advanceTimersByTime(100)
      
      const highlights = context.div1.querySelectorAll('[data-highlight^="diff-"]')
      expect(highlights.length).toBe(0)
    })
  })

  describe('event integration:', function () {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('captures text on init when checkOnInit is true', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true})
      context.editable.add(context.div1)
      vi.advanceTimersByTime(100)
      
      expect(context.editable.textDiff.getOriginalText(context.div1)).toBe('hello world')
    })

    it('captures text on focus when checkOnFocus is true', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnFocus: true})
      context.editable.add(context.div1)
      
      context.editable.dispatcher.notify('focus', context.div1)
      expect(context.editable.textDiff.getOriginalText(context.div1)).toBe('hello world')
    })

    it('triggers diff on change events', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true, throttle: 0})
      context.editable.add(context.div1)
      vi.advanceTimersByTime(100)
      
      const computeSpy = vi.spyOn(context.editable.textDiff, 'computeAndApplyDiff')
      context.div1.textContent = 'changed'
      context.editable.dispatcher.notify('change', context.div1)
      vi.advanceTimersByTime(100)
      
      expect(computeSpy).toHaveBeenCalledWith(context.div1)
    })
  })

  describe('original text management:', function () {
    it('allows manual setting of original text', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({})
      context.editable.add(context.div1)
      
      context.editable.textDiff.setOriginalText(context.div1, 'manual original')
      expect(context.editable.textDiff.getOriginalText(context.div1)).toBe('manual original')
    })

    it('allows clearing original text', function () {
      context = setupIntegrationEnv()
      context.editable.setupTextDiff({checkOnInit: true})
      context.editable.add(context.div1)
      vi.useFakeTimers()
      vi.advanceTimersByTime(100)
      
      context.editable.textDiff.clearOriginalText(context.div1)
      expect(context.editable.textDiff.getOriginalText(context.div1)).toBeUndefined()
      vi.useRealTimers()
    })
  })
})

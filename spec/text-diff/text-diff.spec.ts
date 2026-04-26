import {vi} from 'vitest'
import {Editable} from '../../src/features.js'
import TextDiff from '../../src/plugins/text-diff/text-diff.js'
import {createElement} from '../../src/util/dom.js'
import highlightText from '../../src/highlight-text.js'

function setupTextDiffEnv(text: string, config?: any) {
  const context: any = {}
  context.text = text
  context.div = createElement(`<div>${context.text}</div>`)
  document.body.appendChild(context.div)
  context.editable = new Editable()
  context.editable.add(context.div)
  
  if (config !== false) {
    context.editable.setupTextDiff(config || {})
    context.textDiff = context.editable.textDiff
  }

  context.getText = () => {
    return highlightText.extractText(context.div)
  }

  context.getHtml = () => {
    return context.div.innerHTML
  }

  return context
}

describe('TextDiff:', function () {
  let context: any

  afterEach(function () {
    if (context) {
      context.div?.remove()
      context.editable?.unload()
      context = null
    }
  })

  describe('constructor:', function () {
    it('creates an instance with a reference to editable', function () {
      const editable = new Editable()
      const textDiff = new TextDiff(editable, {})
      expect(textDiff.editable).toBe(editable)
      expect(textDiff.win).toBe(window)
    })

    it('uses default configuration when none provided', function () {
      const editable = new Editable()
      const textDiff = new TextDiff(editable, {})
      expect(textDiff.config.enabled).toBe(true)
      expect(textDiff.config.checkOnInit).toBe(true)
      expect(textDiff.config.checkOnFocus).toBe(false)
      expect(textDiff.config.throttle).toBe(300)
    })

    it('merges custom configuration with defaults', function () {
      const editable = new Editable()
      const textDiff = new TextDiff(editable, {
        enabled: false,
        throttle: 500
      })
      expect(textDiff.config.enabled).toBe(false)
      expect(textDiff.config.checkOnInit).toBe(true) // default
      expect(textDiff.config.throttle).toBe(500)
    })

    it('creates marker nodes correctly', function () {
      const editable = new Editable()
      const textDiff = new TextDiff(editable, {})
      expect(textDiff.deletedMarkerNode).toBeDefined()
      expect(textDiff.insertedMarkerNode).toBeDefined()
      expect(textDiff.deletedMarkerNode.getAttribute('data-highlight')).toBe('diff-deleted')
      expect(textDiff.insertedMarkerNode.getAttribute('data-highlight')).toBe('diff-inserted')
    })

    it('throws error if marker nodes cannot be created', function () {
      const editable = new Editable()
      // This should not throw with valid config
      expect(() => {
        new TextDiff(editable, {
          markerDeleted: '<span class="highlight-diff-deleted"></span>',
          markerInserted: '<span class="highlight-diff-inserted"></span>'
        })
      }).not.toThrow()
    })
  })

  describe('setupListeners:', function () {
    it('sets up init listener when checkOnInit is true', function () {
      const editable = new Editable()
      const onSpy = vi.spyOn(editable, 'on')
      const textDiff = new TextDiff(editable, {checkOnInit: true})
      expect(onSpy).toHaveBeenCalledWith('init', expect.any(Function))
    })

    it('does not set up init listener when checkOnInit is false', function () {
      const editable = new Editable()
      const onSpy = vi.spyOn(editable, 'on')
      const textDiff = new TextDiff(editable, {checkOnInit: false})
      const initCalls = onSpy.mock.calls.filter(call => call[0] === 'init')
      expect(initCalls.length).toBe(0)
    })

    it('sets up focus listener when checkOnFocus is true', function () {
      const editable = new Editable()
      const onSpy = vi.spyOn(editable, 'on')
      const textDiff = new TextDiff(editable, {checkOnFocus: true})
      expect(onSpy).toHaveBeenCalledWith('focus', expect.any(Function))
    })

    it('sets up change listener when enabled is true', function () {
      const editable = new Editable()
      const onSpy = vi.spyOn(editable, 'on')
      const textDiff = new TextDiff(editable, {enabled: true})
      expect(onSpy).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('does not set up change listener when enabled is false', function () {
      const editable = new Editable()
      const onSpy = vi.spyOn(editable, 'on')
      const textDiff = new TextDiff(editable, {enabled: false})
      const changeCalls = onSpy.mock.calls.filter(call => call[0] === 'change')
      expect(changeCalls.length).toBe(0)
    })
  })

  describe('captureOriginalText:', function () {
    it('stores original text for editable host', function () {
      context = setupTextDiffEnv('hello world')
      context.textDiff.captureOriginalText(context.div)
      const stored = context.textDiff.getOriginalText(context.div)
      expect(stored).toBe('hello world')
    })

    it('clears existing diff highlights when capturing', function () {
      context = setupTextDiffEnv('hello')
      // Add a fake highlight
      const span = document.createElement('span')
      span.setAttribute('data-highlight', 'diff-deleted')
      span.textContent = 'test'
      context.div.appendChild(span)
      
      context.textDiff.captureOriginalText(context.div)
      // Original text should be captured (extracted text, not including highlights)
      const originalText = context.textDiff.getOriginalText(context.div)
      expect(originalText).toContain('hello')
      // The highlight span should be cleared by clearDiffHighlights
      expect(context.div.querySelector('[data-highlight="diff-deleted"]')).toBeNull()
    })
  })

  describe('setOriginalText:', function () {
    it('sets original text and triggers diff computation', function () {
      context = setupTextDiffEnv('hello')
      const computeSpy = vi.spyOn(context.textDiff, 'computeAndApplyDiff')
      context.textDiff.setOriginalText(context.div, 'original')
      expect(context.textDiff.getOriginalText(context.div)).toBe('original')
      expect(computeSpy).toHaveBeenCalledWith(context.div)
    })
  })

  describe('getOriginalText:', function () {
    it('returns undefined for element without stored text', function () {
      context = setupTextDiffEnv('hello')
      const otherDiv = createElement('<div>other</div>')
      expect(context.textDiff.getOriginalText(otherDiv)).toBeUndefined()
      otherDiv.remove()
    })

    it('returns stored text for element', function () {
      context = setupTextDiffEnv('hello')
      context.textDiff.captureOriginalText(context.div)
      expect(context.textDiff.getOriginalText(context.div)).toBe('hello')
    })
  })

  describe('clearOriginalText:', function () {
    it('removes stored text for element', function () {
      context = setupTextDiffEnv('hello')
      context.textDiff.captureOriginalText(context.div)
      context.textDiff.clearOriginalText(context.div)
      expect(context.textDiff.getOriginalText(context.div)).toBeUndefined()
    })

    it('clears diff highlights when clearing original text', function () {
      context = setupTextDiffEnv('hello')
      context.textDiff.captureOriginalText(context.div)
      const clearSpy = vi.spyOn(context.textDiff, 'clearDiffHighlights')
      context.textDiff.clearOriginalText(context.div)
      expect(clearSpy).toHaveBeenCalledWith(context.div)
    })
  })

  describe('computeAndApplyDiff:', function () {
    it('does nothing if no original text stored', function () {
      context = setupTextDiffEnv('hello')
      const applySpy = vi.spyOn(context.textDiff, 'applyDiff')
      context.textDiff.computeAndApplyDiff(context.div)
      expect(applySpy).not.toHaveBeenCalled()
    })

    it('clears highlights if text is unchanged', function () {
      context = setupTextDiffEnv('hello')
      context.textDiff.captureOriginalText(context.div)
      const clearSpy = vi.spyOn(context.textDiff, 'clearDiffHighlights')
      context.textDiff.computeAndApplyDiff(context.div)
      expect(clearSpy).toHaveBeenCalledWith(context.div)
    })

    it('computes and applies diff when text changed', function () {
      context = setupTextDiffEnv('hello')
      context.textDiff.captureOriginalText(context.div)
      context.div.textContent = 'world'
      const applySpy = vi.spyOn(context.textDiff, 'applyDiff')
      context.textDiff.computeAndApplyDiff(context.div)
      expect(applySpy).toHaveBeenCalled()
    })
  })

  describe('onInit:', function () {
    it('captures original text on init event', function () {
      context = setupTextDiffEnv('hello', {checkOnInit: true})
      const captureSpy = vi.spyOn(context.textDiff, 'captureOriginalText')
      context.editable.dispatcher.notify('init', context.div)
      expect(captureSpy).toHaveBeenCalledWith(context.div)
    })
  })

  describe('onFocus:', function () {
    it('captures original text on focus when checkOnFocus is true', function () {
      context = setupTextDiffEnv('hello', {checkOnFocus: true})
      const captureSpy = vi.spyOn(context.textDiff, 'captureOriginalText')
      context.editable.dispatcher.notify('focus', context.div)
      expect(captureSpy).toHaveBeenCalledWith(context.div)
    })

    it('does not capture on focus when checkOnFocus is false', function () {
      context = setupTextDiffEnv('hello', {checkOnFocus: false})
      const captureSpy = vi.spyOn(context.textDiff, 'captureOriginalText')
      context.editable.dispatcher.notify('focus', context.div)
      expect(captureSpy).not.toHaveBeenCalled()
    })
  })

  describe('onChange:', function () {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('triggers diff computation after throttle delay', function () {
      context = setupTextDiffEnv('hello', {throttle: 300})
      context.textDiff.captureOriginalText(context.div)
      const computeSpy = vi.spyOn(context.textDiff, 'computeAndApplyDiff')
      
      context.editable.dispatcher.notify('change', context.div)
      expect(computeSpy).not.toHaveBeenCalled()
      
      vi.advanceTimersByTime(300)
      expect(computeSpy).toHaveBeenCalledWith(context.div)
    })

    it('does not trigger when disabled', function () {
      context = setupTextDiffEnv('hello', {enabled: false})
      context.textDiff.captureOriginalText(context.div)
      const computeSpy = vi.spyOn(context.textDiff, 'computeAndApplyDiff')
      
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(300)
      expect(computeSpy).not.toHaveBeenCalled()
    })

    it('cancels previous timeout on rapid changes', function () {
      context = setupTextDiffEnv('hello', {throttle: 300})
      context.textDiff.captureOriginalText(context.div)
      const computeSpy = vi.spyOn(context.textDiff, 'computeAndApplyDiff')
      
      context.editable.dispatcher.notify('change', context.div)
      context.editable.dispatcher.notify('change', context.div)
      context.editable.dispatcher.notify('change', context.div)
      
      vi.advanceTimersByTime(300)
      // Should only be called once after all rapid changes
      expect(computeSpy).toHaveBeenCalledTimes(1)
    })

    it('does not trigger when isApplyingDiff is true', function () {
      context = setupTextDiffEnv('hello')
      context.textDiff.captureOriginalText(context.div)
      context.textDiff.isApplyingDiff = true
      const computeSpy = vi.spyOn(context.textDiff, 'computeAndApplyDiff')
      
      context.editable.dispatcher.notify('change', context.div)
      vi.advanceTimersByTime(300)
      expect(computeSpy).not.toHaveBeenCalled()
    })
  })

  describe('clearDiffHighlights:', function () {
    it('removes diff highlight markers', function () {
      context = setupTextDiffEnv('hello')
      // Add fake highlights
      const deletedSpan = document.createElement('span')
      deletedSpan.setAttribute('data-highlight', 'diff-deleted')
      deletedSpan.textContent = 'deleted'
      context.div.appendChild(deletedSpan)
      
      const insertedSpan = document.createElement('span')
      insertedSpan.setAttribute('data-highlight', 'diff-inserted')
      insertedSpan.textContent = 'inserted'
      context.div.appendChild(insertedSpan)
      
      context.textDiff.clearDiffHighlights(context.div)
      expect(context.div.querySelector('[data-highlight="diff-deleted"]')).toBeNull()
      expect(context.div.querySelector('[data-highlight="diff-inserted"]')).toBeNull()
    })
  })
})

import { createRange } from '../src/util/dom.js'
import Cursor from '../src/cursor.js'
import { Editable } from '../src/core.js'
import {
  isImeFallbackKey,
  mapInputTypeToCommand,
  resolveEditingAction,
  resolveNavigationAction
} from '../src/input-normalizer.js'
import {
  isBlockComposing,
  isEditingSuppressed,
  setBlockComposing
} from '../src/composition-state.js'
import { InputCommandTracker } from '../src/input-command-tracker.js'

describe('Input pipeline', function () {
  describe('input normalizer', function () {
    it('maps navigation keys via event.key', function () {
      expect(resolveNavigationAction(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(
        'left'
      )
      expect(resolveNavigationAction(new KeyboardEvent('keydown', { key: 'Tab' }))).toBe('tab')
      expect(
        resolveNavigationAction(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
      ).toBe('shiftTab')
    })

    it('maps editing keys via event.key and event.code', function () {
      expect(resolveEditingAction(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe('enter')
      expect(
        resolveEditingAction(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))
      ).toBe('shiftEnter')
      expect(
        resolveEditingAction(
          new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true })
        )
      ).toBe('bold')
    })

    it('suppresses editing actions during IME composition and keyCode 229', function () {
      expect(
        resolveEditingAction(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))
      ).toBe(null)
      expect(
        resolveEditingAction(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 }))
      ).toBe(null)
      expect(isImeFallbackKey(new KeyboardEvent('keydown', { key: 'Process', keyCode: 229 }))).toBe(
        true
      )
    })

    it('maps beforeinput inputType values to semantic commands', function () {
      expect(mapInputTypeToCommand('insertParagraph')).toBe('enter')
      expect(mapInputTypeToCommand('insertLineBreak')).toBe('shiftEnter')
      expect(mapInputTypeToCommand('deleteContentBackward')).toBe('backspace')
      expect(mapInputTypeToCommand('formatBold')).toBe('bold')
      expect(mapInputTypeToCommand('insertFromPaste')).toBe('paste')
    })
  })

  describe('composition state', function () {
    it('tracks per-block composition', function () {
      const block = document.createElement('div')
      expect(isBlockComposing(block)).toBe(false)
      setBlockComposing(block, true)
      expect(isBlockComposing(block)).toBe(true)
      setBlockComposing(block, false)
      expect(isBlockComposing(block)).toBe(false)
    })
  })

  describe('command deduplication', function () {
    it('suppresses only the keydown paired with a handled beforeinput', function () {
      const block = document.createElement('div')
      block.setAttribute('data-editable', 'test-block')
      const tracker = new InputCommandTracker()

      tracker.markBeforeInputHandled(block, 'enter')
      expect(tracker.shouldSuppressKeydown(block, 'enter')).toBe(true)
      expect(tracker.shouldSuppressKeydown(block, 'enter')).toBe(false)
      expect(tracker.shouldSuppressKeydown(block, 'backspace')).toBe(false)
    })
  })

  describe('dispatcher integration', function () {
    let elem: HTMLElement
    let editable: Editable

    function createCursor(range: Range) {
      const cursor = new Cursor(elem, range)
      cursor.setVisibleSelection()
      return cursor
    }

    function createRangeAtEnd(node: HTMLElement) {
      const range = createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      return range
    }

    function createRangeAtBeginning(node: HTMLElement) {
      const range = createRange()
      range.selectNodeContents(node)
      range.collapse(true)
      return range
    }

    function countEvents(eventName: string) {
      const counter = { calls: 0 }
      editable.on(eventName, () => {
        counter.calls += 1
      })
      return counter
    }

    beforeEach(function () {
      elem = document.createElement('div')
      document.body.appendChild(elem)
      editable = new Editable({ defaultBehavior: false })
      editable.add(elem)
      elem.focus()
    })

    afterEach(function () {
      editable.unload()
      elem.remove()
    })

    it('handles Enter at beginning, middle, and end via keydown fallback', function () {
      elem.innerHTML = 'foo'
      const insertAfter = countEvents('insert')
      createCursor(createRangeAtEnd(elem))
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(insertAfter.calls).toBe(1)

      elem.innerHTML = 'foo'
      const insertBefore = countEvents('insert')
      createCursor(createRangeAtBeginning(elem))
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(insertBefore.calls).toBe(1)

      elem.innerHTML = 'foobar'
      const split = countEvents('split')
      const range = createRange()
      range.setStart(elem.firstChild!, 3)
      range.collapse(true)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(split.calls).toBe(1)
    })

    it('handles Shift+Enter via keydown fallback', function () {
      const newline = countEvents('newline')
      elem.innerHTML = 'line'
      createCursor(createRangeAtEnd(elem))
      elem.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
      )
      expect(newline.calls).toBe(1)
    })

    it('handles merge at block boundaries via Backspace and Delete', function () {
      return new Promise<void>((resolve) => {
        elem.innerHTML = 'foo'
        createCursor(createRangeAtBeginning(elem))
        editable.on('merge', (element, direction) => {
          expect(element).toBe(elem)
          expect(direction).toBe('before')
          resolve()
        })
        elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
      })
    })

    it('does not split during active composition when Enter is pressed', function () {
      const split = countEvents('split')
      elem.innerHTML = 'nihongo'
      const range = createRange()
      range.setStart(elem.firstChild!, 3)
      range.collapse(true)
      createCursor(range)

      elem.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      elem.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })
      )

      expect(split.calls).toBe(0)
      expect(isEditingSuppressed(elem)).toBe(true)

      elem.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      expect(isBlockComposing(elem)).toBe(false)
    })

    it('deduplicates beforeinput and subsequent keydown for the same command', function () {
      const split = countEvents('split')
      elem.innerHTML = 'abcdef'
      const range = createRange()
      range.setStart(elem.firstChild!, 3)
      range.collapse(true)
      createCursor(range)

      elem.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertParagraph',
          bubbles: true,
          cancelable: true
        })
      )
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(split.calls).toBe(1)
    })

    it('fires change once for beforeinput-driven structural edits', function () {
      const changes = countEvents('change')
      elem.innerHTML = 'abc'
      createCursor(createRangeAtEnd(elem))

      elem.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertParagraph',
          bubbles: true,
          cancelable: true
        })
      )

      expect(changes.calls).toBe(1)
    })

    it('suppresses duplicate change after paste handling', function () {
      const changes = countEvents('change')
      elem.innerHTML = 'paste here'
      createCursor(createRangeAtEnd(elem))

      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', ' pasted')
      elem.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      )
      elem.dispatchEvent(new InputEvent('input', { bubbles: true }))

      expect(changes.calls).toBe(1)
    })

    it('supports browser undo after a beforeinput split when available', function () {
      elem.innerHTML = 'undo'
      const range = createRange()
      range.setStart(elem.firstChild!, 2)
      range.collapse(true)
      createCursor(range)

      elem.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertParagraph',
          bubbles: true,
          cancelable: true
        })
      )

      if (document.queryCommandSupported?.('undo')) {
        document.execCommand('undo')
        expect(elem.textContent).toContain('undo')
      }
    })
  })
})

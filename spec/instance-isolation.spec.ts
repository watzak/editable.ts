import { cloneDeep } from '../src/util/clone-deep.js'
import { createRange } from '../src/util/dom.js'
import config from '../src/config.js'
import { parseContent, updateConfig } from '../src/clipboard.js'
import Cursor from '../src/cursor.js'
import Keyboard from '../src/keyboard.js'
import { Editable } from '../src/core.js'

const { key } = Keyboard

describe('Instance isolation', function () {
  function createCursor(element: HTMLElement, offset: number) {
    const range = createRange()
    range.setStart(element.firstChild!, offset)
    range.setEnd(element.firstChild!, offset)
    range.collapse(true)
    const cursor = new Cursor(element, range)
    cursor.setVisibleSelection()
    return cursor
  }

  function createRangeAtEnd(node: HTMLElement) {
    const range = createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    return range
  }

  function countEvents(editable: Editable, eventName: string) {
    const counter = { calls: 0 }
    editable.on(eventName, () => {
      counter.calls += 1
    })
    return counter
  }

  describe('block ownership', function () {
    let blockA: HTMLElement
    let blockB: HTMLElement
    let first: Editable
    let second: Editable

    beforeEach(function () {
      blockA = document.createElement('div')
      blockB = document.createElement('div')
      document.body.appendChild(blockA)
      document.body.appendChild(blockB)
      first = new Editable({ defaultBehavior: false })
      second = new Editable({ defaultBehavior: false })
      first.add(blockA)
      second.add(blockB)
    })

    afterEach(function () {
      first.unload()
      second.unload()
      blockA.remove()
      blockB.remove()
    })

    it('routes keyboard events only to the owning instance', function () {
      blockA.innerHTML = 'bar'
      createCursor(blockA, 2)

      const firstSplit = countEvents(first, 'split')
      const secondSplit = countEvents(second, 'split')

      blockA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(firstSplit.calls).toBe(1)
      expect(secondSplit.calls).toBe(0)
    })

    it('routes change events only to the owning instance', function () {
      const firstChange = countEvents(first, 'change')
      const secondChange = countEvents(second, 'change')

      blockA.innerHTML = 'foo'
      new Cursor(blockA, createRangeAtEnd(blockA)).setVisibleSelection()
      blockA.dispatchEvent(new Event('input', { bubbles: true }))

      expect(firstChange.calls).toBe(1)
      expect(secondChange.calls).toBe(0)
    })

    it('routes merge events only to the owning instance', function () {
      return new Promise<void>((resolve) => {
        blockA.innerHTML = 'foo'
        const range = createRange()
        range.selectNodeContents(blockA)
        range.collapse(true)
        new Cursor(blockA, range).setVisibleSelection()

        const secondMerge = countEvents(second, 'merge')
        first.on('merge', (element) => {
          expect(element).toBe(blockA)
          expect(secondMerge.calls).toBe(0)
          resolve()
        })

        blockA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
      })
    })

    it('transfers ownership when the same block is added to another instance', function () {
      const firstChange = countEvents(first, 'change')
      const secondChange = countEvents(second, 'change')

      second.add(blockA)
      expect(first.ownsBlock(blockA)).toBe(false)
      expect(second.ownsBlock(blockA)).toBe(true)

      blockA.innerHTML = 'foo'
      new Cursor(blockA, createRangeAtEnd(blockA)).setVisibleSelection()
      blockA.dispatchEvent(new Event('input', { bubbles: true }))

      expect(firstChange.calls).toBe(0)
      expect(secondChange.calls).toBe(1)
    })

    it('keeps ownership across disable and enable', function () {
      first.disable(blockA)
      expect(first.ownsBlock(blockA)).toBe(true)

      first.enable(blockA)
      expect(first.ownsBlock(blockA)).toBe(true)

      const secondChange = countEvents(second, 'change')
      blockA.innerHTML = 'foo'
      new Cursor(blockA, createRangeAtEnd(blockA)).setVisibleSelection()
      blockA.dispatchEvent(new Event('input', { bubbles: true }))

      expect(secondChange.calls).toBe(0)
    })

    it('releases ownership on remove and allows re-registration', function () {
      first.remove(blockA)
      expect(first.ownsBlock(blockA)).toBe(false)

      second.add(blockA)
      expect(second.ownsBlock(blockA)).toBe(true)

      const secondChange = countEvents(second, 'change')
      blockA.innerHTML = 'foo'
      new Cursor(blockA, createRangeAtEnd(blockA)).setVisibleSelection()
      blockA.dispatchEvent(new Event('input', { bubbles: true }))

      expect(secondChange.calls).toBe(1)
    })

    it('leaves the remaining instance functional after unload', function () {
      first.unload()

      blockB.innerHTML = 'bar'
      createCursor(blockB, 2)

      const secondSplit = countEvents(second, 'split')
      blockB.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(secondSplit.calls).toBe(1)
    })
  })

  describe('per-instance paste rules', function () {
    const originalConfig = cloneDeep(config)

    afterEach(function () {
      Editable.globalConfig(originalConfig)
      updateConfig(originalConfig)
    })

    it('applies different paste allowlists in the same document', function () {
      const withUnderline = new Editable({
        defaultBehavior: false,
        pastedHtmlRules: {
          allowedElements: { u: {} }
        }
      })
      const withoutUnderline = new Editable({ defaultBehavior: false })

      const html = '<u>underlined</u> plain'
      const underlinedDiv = document.createElement('div')
      const plainDiv = document.createElement('div')
      underlinedDiv.innerHTML = html
      plainDiv.innerHTML = html

      expect(parseContent(underlinedDiv, { pasteRules: withUnderline.pasteRules })[0]).toBe(
        '<u>underlined</u> plain'
      )
      expect(parseContent(plainDiv, { pasteRules: withoutUnderline.pasteRules })[0]).toBe(
        'underlined plain'
      )

      withUnderline.unload()
      withoutUnderline.unload()
    })
  })

  describe('global configuration snapshots', function () {
    const originalConfig = cloneDeep(config)

    beforeEach(function () {
      Editable.globalConfig(originalConfig)
    })

    afterEach(function () {
      Editable.globalConfig(originalConfig)
    })

    it('does not expose mutable internal config from getGlobalConfig()', function () {
      const snapshot = Editable.getGlobalConfig()
      snapshot.editableClass = 'mutated-class'
      snapshot.pastedHtmlRules.allowedElements.span = { class: true }

      expect(Editable.getGlobalConfig().editableClass).toBe('js-editable')
      expect(Editable.getGlobalConfig().pastedHtmlRules.allowedElements.span).toBe(undefined)
    })

    it('does not change existing instance settings when globalConfig is updated', function () {
      const editable = new Editable({ defaultBehavior: false })
      const block = document.createElement('div')
      document.body.appendChild(block)
      editable.add(block)

      Editable.globalConfig({
        pastedHtmlRules: {
          allowedElements: { u: {} }
        }
      })

      expect(editable.pasteRules.allowedElements.u).toBe(undefined)
      expect(editable.globalSettings.pastedHtmlRules.allowedElements.u).toBe(undefined)

      editable.unload()
      block.remove()
    })
  })
})

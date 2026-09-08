import { createRange } from '../src/util/dom.js'
import Cursor from '../src/cursor.js'
import Selection from '../src/selection.js'
import { Editable } from '../src/core.js'
import { CommandContext } from '../src/command-context.js'
import {
  getHostTextOffset,
  buildCommandCursor,
  buildCommandSelection
} from '../src/command-builder.js'
import type { EditableCommand, ChangeDetails } from '../src/command-types.js'

describe('Command API', function () {
  describe('offset semantics (UTF-16 code units)', function () {
    it('counts emoji as two code units', function () {
      const host = document.createElement('div')
      host.textContent = 'a😀b'
      const range = createRange()
      range.setStart(host.firstChild!, 2)
      range.collapse(true)
      const cursor = new Cursor(host, range)
      expect(getHostTextOffset(cursor)).toBe(2)
    })

    it('counts combining marks as separate code units from base character', function () {
      const host = document.createElement('div')
      host.textContent = 'e\u0301'
      const range = createRange()
      range.setStart(host.firstChild!, 2)
      range.collapse(true)
      const cursor = new Cursor(host, range)
      expect(getHostTextOffset(cursor)).toBe(2)
      expect(buildCommandCursor(cursor).offset).toBe(2)
    })

    it('reports selection ranges in UTF-16 code units', function () {
      const host = document.createElement('div')
      host.textContent = 'x😀y'
      const range = createRange()
      range.setStart(host.firstChild!, 1)
      range.setEnd(host.firstChild!, 3)
      const selection = new Selection(host, range)
      expect(buildCommandSelection(selection)).toEqual({
        start: 1,
        end: 3,
        text: '😀'
      })
    })
  })

  describe('with defaultBehavior: false (host-driven)', function () {
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

    it('emits command payloads for insertBlock at end', function () {
      let command: EditableCommand | undefined
      editable.on('command', (cmd) => {
        command = cmd
      })
      elem.innerHTML = 'hello'
      createCursor(createRangeAtEnd(elem))
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(command?.type).toBe('insertBlock')
      if (command?.type === 'insertBlock') {
        expect(command.direction).toBe('after')
        expect(command.host).toBe(elem)
        expect(command.source).toBe('keyboard')
        expect(command.cursor.offset).toBe(5)
      }
    })

    it('emits command payloads for splitBlock in the middle', function () {
      let command: EditableCommand | undefined
      editable.on('command', (cmd) => {
        command = cmd
      })
      elem.innerHTML = 'abcdef'
      const range = createRange()
      range.setStart(elem.firstChild!, 3)
      range.collapse(true)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(command?.type).toBe('splitBlock')
      if (command?.type === 'splitBlock') {
        expect(command.htmlBefore).toBe('abc')
        expect(command.htmlAfter).toBe('def')
        expect(command.cursor.offset).toBe(3)
        expect(command.cursor.htmlBefore).toBe('abc')
        expect(command.cursor.htmlAfter).toBe('def')
      }
    })

    it('emits mergeBlock command at block start', function () {
      let command: EditableCommand | undefined
      editable.on('command', (cmd) => {
        command = cmd
      })
      elem.innerHTML = 'merge'
      createCursor(createRangeAtBeginning(elem))
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))

      expect(command?.type).toBe('mergeBlock')
      if (command?.type === 'mergeBlock') {
        expect(command.direction).toBe('before')
        expect(command.cursor.offset).toBe(0)
      }
    })

    it('emits insertLineBreak command for Shift+Enter', function () {
      let command: EditableCommand | undefined
      editable.on('command', (cmd) => {
        command = cmd
      })
      elem.innerHTML = 'line'
      createCursor(createRangeAtEnd(elem))
      elem.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
      )

      expect(command?.type).toBe('insertLineBreak')
    })

    it('emits format command for Ctrl+B', function () {
      let command: EditableCommand | undefined
      editable.on('command', (cmd) => {
        command = cmd
      })
      elem.innerHTML = 'bold text'
      const range = createRange()
      range.setStart(elem.firstChild!, 0)
      range.setEnd(elem.firstChild!, 4)
      const selection = new Selection(elem, range)
      selection.setVisibleSelection()
      elem.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, bubbles: true })
      )

      expect(command?.type).toBe('format')
      if (command?.type === 'format') {
        expect(command.format).toBe('bold')
        expect(command.selection).toEqual({ start: 0, end: 4, text: 'bold' })
      }
    })

    it('does not mutate DOM when host handles commands', function () {
      editable.on('command', () => {})
      const before = elem.innerHTML
      elem.innerHTML = 'abc'
      const range = createRange()
      range.setStart(elem.firstChild!, 1)
      range.collapse(true)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(elem.innerHTML).toBe(before === '' ? 'abc' : before)
    })
  })

  describe('with defaultBehavior: true', function () {
    let elem: HTMLElement
    let editable: Editable

    function createCursor(range: Range) {
      const cursor = new Cursor(elem, range)
      cursor.setVisibleSelection()
      return cursor
    }

    beforeEach(function () {
      elem = document.createElement('div')
      document.body.appendChild(elem)
      editable = new Editable({ defaultBehavior: true })
      editable.add(elem)
      elem.focus()
    })

    afterEach(function () {
      editable.unload()
      elem.remove()
    })

    it('allows beforeCommand to cancel default behavior', function () {
      editable.on('beforeCommand', (ctx: CommandContext) => {
        if (ctx.command.type === 'splitBlock') ctx.cancel()
      })
      elem.innerHTML = 'hello'
      const range = createRange()
      range.setStart(elem.firstChild!, 2)
      range.collapse(true)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(elem.textContent).toBe('hello')
    })

    it('fires legacy split exactly once alongside command', function () {
      let commandCount = 0
      let splitCount = 0
      editable.on('command', () => {
        commandCount += 1
      })
      editable.on('split', () => {
        splitCount += 1
      })
      elem.innerHTML = 'abcdef'
      const range = createRange()
      range.setStart(elem.firstChild!, 3)
      range.collapse(true)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(commandCount).toBe(1)
      expect(splitCount).toBe(1)
    })

    it('does not fire legacy split when beforeCommand cancels', function () {
      let splitCount = 0
      editable.on('beforeCommand', (ctx) => ctx.cancel())
      editable.on('split', () => {
        splitCount += 1
      })
      elem.innerHTML = 'abcdef'
      const range = createRange()
      range.setStart(elem.firstChild!, 3)
      range.collapse(true)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(splitCount).toBe(0)
    })

    it('attaches typed change details for structural commands', function () {
      let details: ChangeDetails | undefined
      editable.on('change', (_elem, changeDetails) => {
        details = changeDetails
      })
      elem.innerHTML = 'end'
      const range = createRange()
      range.selectNodeContents(elem)
      range.collapse(false)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(details?.source).toBe('keyboard')
      expect(details?.command?.type).toBe('insertBlock')
    })

    it('keeps legacy change handler with single HTMLElement argument compatible', function () {
      let legacyCalls = 0
      editable.on('change', (element) => {
        expect(element).toBe(elem)
        legacyCalls += 1
      })
      elem.innerHTML = 'x'
      const range = createRange()
      range.selectNodeContents(elem)
      range.collapse(false)
      createCursor(range)
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(legacyCalls).toBe(1)
    })
  })

  describe('paste command payloads', function () {
    let elem: HTMLElement
    let editable: Editable

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

    it('includes multiple pasted blocks in the command payload', function () {
      let command: EditableCommand | undefined
      editable.on('command', (cmd) => {
        command = cmd
      })
      elem.innerHTML = 'start'
      const range = createRange()
      range.selectNodeContents(elem)
      range.collapse(false)
      new Cursor(elem, range).setVisibleSelection()

      const clipboardData = new DataTransfer()
      clipboardData.setData('text/html', '<p>one</p><p>two</p><p>three</p>')
      elem.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      )

      expect(command?.type).toBe('paste')
      if (command?.type === 'paste') {
        expect(command.blocks.length).toBeGreaterThan(1)
        expect(command.source).toBe('paste')
        expect(command.inputType).toBe('insertFromPaste')
      }
    })

    it('fires legacy paste exactly once with defaultBehavior true', function () {
      editable.unload()
      editable = new Editable({ defaultBehavior: true })
      editable.add(elem)

      let pasteCount = 0
      let commandCount = 0
      editable.on('paste', () => {
        pasteCount += 1
      })
      editable.on('command', () => {
        commandCount += 1
      })

      elem.innerHTML = 'here'
      const range = createRange()
      range.selectNodeContents(elem)
      range.collapse(false)
      new Cursor(elem, range).setVisibleSelection()

      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', 'a\n\nb')
      elem.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      )

      expect(pasteCount).toBe(1)
      expect(commandCount).toBe(1)
    })
  })
})

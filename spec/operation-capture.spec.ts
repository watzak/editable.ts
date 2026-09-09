import { createRange } from '../src/util/dom.js'
import Cursor from '../src/cursor.js'
import Selection from '../src/selection.js'
import { Editable } from '../src/core.js'
import { diffToOperations } from '../src/operation-diff.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { predictOperationsFromBeforeInput } from '../src/operation-input-predict.js'
import eventable from '../src/eventable.js'
import { OperationCapture } from '../src/operation-capture.js'
import { shouldApplySmartQuotes } from '../src/smartQuotes.js'
import type { DispatcherEventMap } from '../src/event-types.js'
import type { EditableOperationBatch } from '../src/operation-types.js'
import type { EditableCommand } from '../src/command-types.js'

describe('Operation capture', function () {
  describe('diffToOperations', function () {
    it('produces insertText for append', function () {
      expect(diffToOperations('hi', 'hi!')).toEqual([{ type: 'insertText', index: 2, text: '!' }])
    })

    it('produces replaceText for selection replacement', function () {
      expect(diffToOperations('hello', 'help')).toEqual([
        { type: 'replaceText', index: 3, length: 2, text: 'p' }
      ])
    })

    it('handles emoji as UTF-16 code units', function () {
      const ops = diffToOperations('a', 'a😀')
      expect(ops).toEqual([{ type: 'insertText', index: 1, text: '😀' }])
      expect('a😀'.length).toBe(3)
    })

    it('handles combining marks separately', function () {
      const composed = 'e\u0301'
      const ops = diffToOperations('e', composed)
      expect(ops).toEqual([{ type: 'insertText', index: 1, text: '\u0301' }])
    })
  })

  describe('predictOperationsFromBeforeInput', function () {
    it('predicts insertText from beforeinput data', function () {
      const host = document.createElement('div')
      host.textContent = 'abc'
      document.body.appendChild(host)

      const range = createRange()
      range.selectNodeContents(host)
      range.collapse(false)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)

      const inputEvent = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '!',
        bubbles: true,
        cancelable: true
      })

      const predicted = predictOperationsFromBeforeInput(host, inputEvent, 'abc', {
        anchor: 3,
        head: 3,
        direction: 'none'
      })

      expect(predicted).toEqual([{ type: 'insertText', index: 3, text: '!' }])
      host.remove()
    })

    it('predicts deleteContentBackward for collapsed caret', function () {
      const host = document.createElement('div')
      host.textContent = 'abc'
      const predicted = predictOperationsFromBeforeInput(
        host,
        new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true }),
        'abc',
        { anchor: 3, head: 3, direction: 'none' }
      )
      expect(predicted).toEqual([{ type: 'deleteText', index: 2, length: 1 }])
    })
  })

  describe('dispatcher integration', function () {
    let elem: HTMLElement
    let editable: Editable

    function createCursorAtEnd(node: HTMLElement) {
      const range = createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      const cursor = new Cursor(node, range)
      cursor.setVisibleSelection()
      return cursor
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
      elem.setAttribute('contenteditable', 'true')
      document.body.appendChild(elem)
      editable = new Editable({ defaultBehavior: false })
      editable.add(elem)
      elem.focus()
    })

    afterEach(function () {
      editable.unload()
      elem.remove()
    })

    it('emits one operation batch and one change for beforeinput insertText', function () {
      elem.innerHTML = 'hello'
      createCursorAtEnd(elem)

      const operations: EditableOperationBatch[] = []
      const commands: EditableCommand[] = []
      const changes = countEvents('change')

      editable.on('operation', (_host, batch) => {
        operations.push(batch)
      })
      editable.on('command', (cmd) => {
        commands.push(cmd)
      })

      elem.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: '!',
          bubbles: true,
          cancelable: true
        })
      )
      elem.textContent = 'hello!'
      elem.dispatchEvent(
        new InputEvent('input', { inputType: 'insertText', data: '!', bubbles: true })
      )

      expect(operations.length).toBe(1)
      expect(operations[0]?.source).toBe('beforeinput')
      expect(operations[0]?.operations).toEqual([{ type: 'insertText', index: 5, text: '!' }])
      expect(commands.length).toBe(1)
      expect(commands[0]?.type).toBe('input')
      expect(changes.calls).toBe(1)
    })

    it('emits replaceText for selection replacement', function () {
      elem.textContent = 'hello'
      const range = createRange()
      range.setStart(elem.firstChild!, 0)
      range.setEnd(elem.firstChild!, 5)
      new Selection(elem, range).setVisibleSelection()
      editable.dispatcher.selectionWatcher.syncSelection()

      const operations: EditableOperationBatch[] = []
      editable.on('operation', (_host, batch) => {
        operations.push(batch)
      })

      elem.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: 'hi',
          bubbles: true,
          cancelable: true
        })
      )
      elem.textContent = 'hi'
      elem.dispatchEvent(
        new InputEvent('input', { inputType: 'insertText', data: 'hi', bubbles: true })
      )

      expect(operations[0]?.operations).toEqual([
        { type: 'replaceText', index: 1, length: 4, text: 'i' }
      ])
    })

    it('emits one composition batch on compositionend', function () {
      elem.innerHTML = 'ni'
      createCursorAtEnd(elem)

      const operations: EditableOperationBatch[] = []
      const changes = countEvents('change')
      editable.on('operation', (_host, batch) => {
        operations.push(batch)
      })

      elem.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      elem.textContent = 'nihongo'
      elem.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

      expect(operations.length).toBe(1)
      expect(operations[0]?.source).toBe('composition')
      expect(operations[0]?.operations).toEqual([{ type: 'insertText', index: 2, text: 'hongo' }])
      expect(changes.calls).toBe(1)
    })

    it('does not emit operations for empty composition', function () {
      elem.innerHTML = 'same'
      createCursorAtEnd(elem)

      const operations: EditableOperationBatch[] = []
      editable.on('operation', (_host, batch) => {
        operations.push(batch)
      })

      elem.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      elem.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

      expect(operations.length).toBe(0)
    })

    it('prepares paste without mutating DOM before command', function () {
      elem.innerHTML = 'before paste'
      createCursorAtEnd(elem)
      const htmlBefore = elem.innerHTML

      let command: EditableCommand | undefined
      editable.on('command', (cmd) => {
        command = cmd
      })

      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', ' inserted')
      elem.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      )

      expect(elem.innerHTML).toBe(htmlBefore)
      expect(command?.type).toBe('paste')
    })

    it('emits paste operation batch before paste command', function () {
      elem.innerHTML = 'x'
      const range = createRange()
      range.selectNodeContents(elem)
      range.collapse(false)
      new Cursor(elem, range).setVisibleSelection()

      const order: string[] = []
      editable.on('beforeOperation', () => order.push('beforeOperation'))
      editable.on('operation', () => order.push('operation'))
      editable.on('beforeCommand', () => order.push('beforeCommand'))
      editable.on('command', () => order.push('command'))

      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', 'yz')
      elem.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      )

      expect(order.indexOf('beforeOperation')).toBeLessThan(order.indexOf('beforeCommand'))
      expect(order).toContain('operation')
      expect(order).toContain('command')
    })

    it('passes smart quote config when enabled on the instance', function () {
      editable.unload()
      editable = new Editable({
        defaultBehavior: false,
        smartQuotes: true,
        quotes: ['\u201C', '\u201D'],
        singleQuotes: ['\u2018', '\u2019']
      })
      editable.add(elem)
      expect(shouldApplySmartQuotes(editable.config, elem)).toBe(true)
    })

    it('integrates smart quotes through OperationCapture directly', function () {
      const host = document.createElement('div')
      host.textContent = 'Hello '
      document.body.appendChild(host)
      const range = createRange()
      range.selectNodeContents(host)
      range.collapse(false)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)

      const bus = {} as {
        notify: import('../src/event-types.js').EventNotify<DispatcherEventMap, Editable>
      }
      eventable(bus, {} as Editable)
      const capture = new OperationCapture()
      const batches: EditableOperationBatch[] = []
      bus.notify = ((...args: unknown[]) => {
        const [event, , batch] = args
        if (event === 'operation') batches.push(batch as EditableOperationBatch)
      }) as typeof bus.notify

      const selectionStub = {
        getFreshSelection: () => ({ range, isSelection: false, host })
      } as unknown as import('../src/selection-watcher.js').default

      capture.beginTextMutation(
        host,
        selectionStub,
        new InputEvent('beforeinput', { inputType: 'insertText', data: '"' }),
        'beforeinput'
      )
      host.textContent = 'Hello "'
      capture.commitTextInput(
        bus.notify,
        host,
        selectionStub,
        new InputEvent('input', { inputType: 'insertText', data: '"' }),
        { quotes: ['\u201C', '\u201D'], singleQuotes: ['\u2018', '\u2019'] }
      )

      expect(batches[0]?.operations.some((op) => op.type === 'replaceText')).toBe(true)
      host.remove()
    })

    it('integrates smart quotes into the same operation batch', function () {
      editable.unload()
      editable = new Editable({
        defaultBehavior: false,
        smartQuotes: true,
        quotes: ['\u201C', '\u201D'],
        singleQuotes: ['\u2018', '\u2019']
      })
      editable.add(elem)
      elem.focus()

      elem.innerHTML = 'Hello '
      createCursorAtEnd(elem)

      const operations: EditableOperationBatch[] = []
      editable.on('operation', (_host, batch) => {
        operations.push(batch)
      })

      elem.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: '"',
          bubbles: true,
          cancelable: true
        })
      )
      elem.textContent = 'Hello "'
      elem.dispatchEvent(
        new InputEvent('input', { inputType: 'insertText', data: '"', bubbles: true })
      )

      expect(operations.length).toBe(1)
      const ops = operations[0]?.operations ?? []
      expect(ops).toEqual(
        expect.arrayContaining([
          { type: 'insertText', index: 6, text: '"' },
          { type: 'replaceText', index: 6, length: 1, text: '\u201C' }
        ])
      )
      expect(getBlockOperationText(elem)).toContain('\u201C')
    })
  })
})

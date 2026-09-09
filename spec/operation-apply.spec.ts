import { createRange } from '../src/util/dom.js'
import { Editable } from '../src/core.js'
import Selection from '../src/selection.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { getOperationTextLength } from '../src/operation-offset.js'
import { domPointToOperationOffset } from '../src/operation-offset.js'
import { OperationValidationError } from '../src/apply-operations.js'
import { getOperationRemoteQueue } from '../src/apply-operations.js'

describe('applyOperations', function () {
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

  it('inserts text at the end of a block', function () {
    elem.textContent = 'hello'
    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 5, text: '!' }]
    })
    expect(getBlockOperationText(elem)).toBe('hello!')
  })

  it('replaces a selection span', function () {
    elem.textContent = 'hello world'
    const range = createRange()
    range.setStart(elem.firstChild!, 6)
    range.setEnd(elem.firstChild!, 11)
    new Selection(elem, range).setVisibleSelection()
    editable.dispatcher.selectionWatcher.syncSelection()

    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'replaceText', index: 6, length: 5, text: 'there' }]
    })
    expect(getBlockOperationText(elem)).toBe('hello there')
  })

  it('preserves caret position inside the host when preserveSelection is true', function () {
    elem.textContent = 'abcdef'
    editable.createCursorAtCharacterOffset({ element: elem, offset: 3 })

    editable.applyOperations(
      elem,
      {
        source: 'remote',
        operations: [{ type: 'insertText', index: 0, text: 'X' }]
      },
      { preserveSelection: true }
    )

    const offset = domPointToOperationOffset(
      elem,
      window.getSelection()!.anchorNode!,
      window.getSelection()!.anchorOffset
    )
    expect(offset).toBe(4)
  })

  it('does not restore selection that was outside the host', function () {
    elem.textContent = 'host'
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    outside.focus()

    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 0, text: '!' }]
    })

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('handles empty hosts', function () {
    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 0, text: 'start' }]
    })
    expect(getBlockOperationText(elem)).toBe('start')
  })

  it('maps line breaks through insertText', function () {
    elem.textContent = 'a'
    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 1, text: '\nb' }]
    })
    expect(getBlockOperationText(elem)).toBe('a\nb')
    expect(elem.querySelector('br')).toBeTruthy()
  })

  it('rejects invalid batches before mutating DOM', function () {
    elem.textContent = 'abc'
    const before = elem.textContent
    expect(() =>
      editable.applyOperations(elem, {
        source: 'remote',
        operations: [{ type: 'deleteText', index: 0, length: 10 }]
      })
    ).toThrow(OperationValidationError)
    expect(elem.textContent).toBe(before)
  })

  it('rejects setTextAttributes on plain-text hosts', function () {
    elem.setAttribute('data-plaintext', 'true')
    elem.textContent = 'plain'
    expect(() =>
      editable.applyOperations(elem, {
        source: 'remote',
        operations: [{ type: 'setTextAttributes', index: 0, length: 5, attributes: { bold: true } }]
      })
    ).toThrow(OperationValidationError)
  })

  it('emits at most one change event per batch', function () {
    elem.textContent = 'one'
    let changes = 0
    editable.on('change', () => {
      changes += 1
    })
    editable.on('operation', () => {
      changes += 1
    })

    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 3, text: '!' }]
    })

    expect(changes).toBe(1)
  })

  it('does not echo remote apply as captured local operations', function () {
    elem.textContent = 'echo'
    let operations = 0
    editable.on('operation', () => {
      operations += 1
    })

    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 4, text: '!' }]
    })

    elem.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    expect(operations).toBe(0)
  })

  it('queues apply during composition and flushes on compositionend', function () {
    elem.textContent = 'ime'
    editable.createCursorAtCharacterOffset({ element: elem, offset: 3 })

    elem.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    const queued = editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 3, text: 'X' }]
    })
    expect(queued.queued).toBe(true)
    expect(getBlockOperationText(elem)).toBe('ime')

    elem.textContent = 'ime語'
    elem.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

    expect(getBlockOperationText(elem)).toBe('imeX語')
    expect(getOperationRemoteQueue().hasPending(elem)).toBe(false)
  })

  it('throws when the host is not registered after unload', function () {
    elem.textContent = 'gone'
    editable.unload()
    expect(() =>
      editable.applyOperations(elem, {
        source: 'remote',
        operations: [{ type: 'insertText', index: 0, text: 'x' }]
      })
    ).toThrow(/not registered/)
  })

  it('handles emoji offsets as UTF-16 code units', function () {
    elem.textContent = 'a😀b'
    expect(getOperationTextLength(elem)).toBe(4)
    editable.applyOperations(elem, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 3, text: '!' }]
    })
    expect(getBlockOperationText(elem)).toBe('a😀!b')
  })
})

describe('operation offset mapping', function () {
  it('round-trips offsets with nested inline markup', function () {
    const host = document.createElement('div')
    host.innerHTML = 'a<strong>b</strong>c'
    document.body.appendChild(host)

    expect(getOperationTextLength(host)).toBe(3)
    expect(getBlockOperationText(host)).toBe('abc')

    host.remove()
  })

  it('skips data-editable=remove nodes', function () {
    const host = document.createElement('div')
    host.innerHTML = 'visible<span data-editable="remove">hidden</span>tail'
    document.body.appendChild(host)

    expect(getBlockOperationText(host)).toBe('visibletail')
    expect(getOperationTextLength(host)).toBe(11)

    host.remove()
  })
})

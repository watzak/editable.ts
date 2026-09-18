import { describe, expect, it } from 'vitest'
import { Editable } from '../src/core.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { OperationValidationError } from '../src/operation-apply.js'
import { validateOperationBatch } from '../src/operation-validate.js'

describe('multi-operation batch semantics (index + cumulative delta)', function () {
  let host: HTMLElement
  let editable: Editable

  beforeEach(function () {
    host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    document.body.appendChild(host)
    editable = new Editable({ defaultBehavior: false })
    editable.add(host)
  })

  afterEach(function () {
    editable.unload()
    host.remove()
  })

  it('applies insert then delete using face indices in one batch', function () {
    host.textContent = 'abcdef'
    editable.applyOperations(host, {
      source: 'remote',
      operations: [
        { type: 'insertText', index: 6, text: 'X' },
        { type: 'deleteText', index: 0, length: 1 }
      ]
    })
    expect(getBlockOperationText(host)).toBe('acdefX')
  })

  it('applies replace then insert at original coordinates', function () {
    host.textContent = 'hello world'
    editable.applyOperations(host, {
      source: 'remote',
      operations: [
        { type: 'replaceText', index: 6, length: 5, text: 'there' },
        { type: 'insertText', index: 11, text: '!' }
      ]
    })
    expect(getBlockOperationText(host)).toBe('hello there!')
  })

  it('documents global delta semantics (insert at end, delete at initial index 0)', function () {
    host.textContent = 'abcdef'
    editable.applyOperations(host, {
      source: 'remote',
      operations: [
        { type: 'insertText', index: 6, text: 'Z' },
        { type: 'deleteText', index: 0, length: 1 }
      ]
    })
    // After append (+1 delta), delete at initial index 0 applies at 1 — removes "b".
    expect(getBlockOperationText(host)).toBe('acdefZ')
  })

  it('validates cumulative bounds before any DOM write', function () {
    host.textContent = 'abc'
    expect(() =>
      validateOperationBatch(host, {
        source: 'api',
        operations: [
          { type: 'insertText', index: 0, text: 'X' },
          { type: 'deleteText', index: 5, length: 1 }
        ]
      })
    ).toThrow(OperationValidationError)
    expect(host.textContent).toBe('abc')
  })

  it('handles UTF-16 surrogate pairs in multi-step batches', function () {
    host.textContent = 'a😀b'
    editable.applyOperations(host, {
      source: 'remote',
      operations: [
        { type: 'insertText', index: 1, text: 'Z' },
        { type: 'insertText', index: 4, text: '!' }
      ]
    })
    expect(getBlockOperationText(host)).toBe('aZ😀b!')
  })

  it('maps line breaks in a single insertText operation', function () {
    host.textContent = 'a'
    editable.applyOperations(host, {
      source: 'remote',
      operations: [{ type: 'insertText', index: 1, text: '\nb' }]
    })
    expect(getBlockOperationText(host)).toBe('a\nb')
    expect(host.querySelector('br')).toBeTruthy()
  })
})

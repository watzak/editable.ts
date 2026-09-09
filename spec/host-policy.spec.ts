import { Editable } from '../src/core.js'
import {
  InlineFormatRegistry,
  defaultInlineFormatRegistry,
  type InlineFormatCodec
} from '../src/inline-format-codec.js'
import {
  filterAttributesForHost,
  isFormatAllowed,
  resolveHostPolicy,
  sanitizeRemoteAttributesForHost,
  validateHostTextLength
} from '../src/host-policy.js'
import { buildToggleFormatOperation } from '../src/format-operations.js'
import { applyOperationBatchToDom, OperationValidationError } from '../src/operation-apply.js'
import { captureSelectionSnapshot } from '../src/operation-selection.js'
import { OPERATION_LINE_BREAK } from '../src/operation-types.js'
import { stripInternalChars } from '../src/operation-text-model.js'
import * as block from '../src/block.js'
import { installHostPolicy } from '../src/host-policy.js'

describe('EditableHostPolicy', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  function richHost(): HTMLElement {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('data-plaintext', 'false')
    document.body.appendChild(host)
    block.setBlockId(host)
    installHostPolicy(host, resolveHostPolicy({ plainText: false }))
    return host
  }

  it('rejects allowlist and denylist together', function () {
    expect(() => resolveHostPolicy({ allowedFormats: ['bold'], deniedFormats: ['link'] })).toThrow(
      /mutually exclusive/
    )
  })

  it('filters formats by allowlist', function () {
    const host = richHost()
    installHostPolicy(host, resolveHostPolicy({ allowedFormats: ['bold'] }))
    expect(isFormatAllowed(host, 'bold')).toBe(true)
    expect(isFormatAllowed(host, 'italic')).toBe(false)
  })

  it('filters formats by denylist', function () {
    const host = richHost()
    installHostPolicy(host, resolveHostPolicy({ deniedFormats: ['link'] }))
    expect(isFormatAllowed(host, 'bold')).toBe(true)
    expect(isFormatAllowed(host, 'link')).toBe(false)
  })

  it('rejects disallowed local format operations before DOM mutation', function () {
    const host = richHost()
    installHostPolicy(host, resolveHostPolicy({ allowedFormats: ['bold'] }))
    host.appendChild(document.createTextNode('text'))
    const selection = captureSelectionSnapshot(host, {
      isSelection: true,
      host,
      start: 0,
      end: 4,
      textBefore: '',
      textAfter: '',
      isAtEnd: false,
      isAtBeginning: true,
      isBlank: false,
      elem: host,
      nativeRange: document.createRange()
    } as never)

    expect(buildToggleFormatOperation(host, selection, 'italic')).toBeNull()
    expect(() =>
      applyOperationBatchToDom(host, {
        source: 'api',
        operations: [
          { type: 'setTextAttributes', index: 0, length: 4, attributes: { italic: true } }
        ]
      })
    ).toThrow(OperationValidationError)
  })

  it('strips unknown and disallowed remote attributes', function () {
    const host = richHost()
    installHostPolicy(host, resolveHostPolicy({ allowedFormats: ['bold'] }))
    const sanitized = sanitizeRemoteAttributesForHost(
      host,
      { bold: true, customMark: true, link: { href: 'https://example.com' } },
      document
    )
    expect(sanitized).toEqual({ bold: true })
  })

  it('validates maxLength without truncating content', function () {
    const policy = resolveHostPolicy({ maxLength: 5 })
    const ok = validateHostTextLength(policy, 4)
    const bad = validateHostTextLength(policy, 6)
    expect(ok.valid).toBe(true)
    expect(bad.valid).toBe(false)
    expect(bad.errors[0]?.code).toBe('too-long')
  })

  it('rejects line breaks when allowLineBreaks is false', function () {
    const host = richHost()
    installHostPolicy(host, resolveHostPolicy({ allowLineBreaks: false }))
    expect(() =>
      applyOperationBatchToDom(host, {
        source: 'api',
        operations: [{ type: 'insertText', index: 0, text: `a${OPERATION_LINE_BREAK}b` }]
      })
    ).toThrow(/Line breaks are not allowed/)
  })

  it('stores placeholder as data attribute only', function () {
    const editable = new Editable({ defaultBehavior: false })
    const host = document.createElement('div')
    document.body.appendChild(host)
    editable.add(host, { placeholder: 'Type here…' })
    expect(host.getAttribute('data-editable-placeholder')).toBe('Type here…')
    expect(host.textContent).toBe('')
    editable.unload()
    host.remove()
  })

  it('supports two hosts with different policies on one instance', function () {
    const editable = new Editable({ defaultBehavior: false })
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    editable.add(a, { allowedFormats: ['bold'] })
    editable.add(b, { allowedFormats: ['italic'] })
    expect(isFormatAllowed(a, 'bold')).toBe(true)
    expect(isFormatAllowed(a, 'italic')).toBe(false)
    expect(isFormatAllowed(b, 'italic')).toBe(true)
    expect(isFormatAllowed(b, 'bold')).toBe(false)
    editable.unload()
    a.remove()
    b.remove()
  })

  it('supports custom span codec on a dedicated registry', function () {
    const highlightCodec: InlineFormatCodec = {
      yjsKey: 'highlight',
      domTags: ['span'],
      readDomElement(element) {
        if (element.nodeName !== 'SPAN') return undefined
        if (element.getAttribute('data-highlight') !== 'true') return undefined
        return true
      },
      createDomWrapper(doc) {
        const span = doc.createElement('span')
        span.setAttribute('data-highlight', 'true')
        return span
      },
      sanitizeYjsValue(value) {
        return value === true ? true : null
      }
    }

    const registry = new InlineFormatRegistry({
      codecs: [
        ...defaultInlineFormatRegistry
          .registeredKeys()
          .map((key) => defaultInlineFormatRegistry.getCodec(key)!),
        highlightCodec
      ]
    })
    const host = richHost()
    installHostPolicy(
      host,
      resolveHostPolicy({ formatRegistry: registry, allowedFormats: ['highlight'] })
    )

    applyOperationBatchToDom(host, {
      source: 'api',
      operations: [{ type: 'insertText', index: 0, text: 'x' }]
    })
    applyOperationBatchToDom(host, {
      source: 'api',
      operations: [
        { type: 'setTextAttributes', index: 0, length: 1, attributes: { highlight: true } }
      ]
    })

    expect(
      stripInternalChars(host.querySelector('span[data-highlight="true"]')?.textContent ?? '')
    ).toBe('x')
    expect(filterAttributesForHost(host, { highlight: true }, document)).toEqual({
      highlight: true
    })
  })
})

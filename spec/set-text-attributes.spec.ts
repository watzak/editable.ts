import { Editable } from '../src/core.js'
import { applyLiveOperationBatchToDom, applyOperationBatchToDom } from '../src/operation-apply.js'
import { getBlockTextRuns } from '../src/dom-text-runs.js'
import { getBlockOperationText } from '../src/operation-text-model.js'
import { setSelectionFromSnapshot } from '../src/operation-selection.js'
import {
  InlineFormatRegistry,
  defaultInlineFormatRegistry,
  type InlineFormatCodec
} from '../src/inline-format-codec.js'
import { installHostPolicy, resolveHostPolicy } from '../src/host-policy.js'
import * as block from '../src/block.js'

describe('setTextAttributes range-faithful apply', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  function richHost(registry = defaultInlineFormatRegistry): HTMLElement {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('data-plaintext', 'false')
    document.body.appendChild(host)
    block.setBlockId(host)
    installHostPolicy(host, resolveHostPolicy({ plainText: false, formatRegistry: registry }))
    return host
  }

  function runFormats(runs: ReturnType<typeof getBlockTextRuns>) {
    return runs.map((run) => ({
      text: run.text,
      bold: run.attributes.bold,
      italic: run.attributes.italic,
      link: run.attributes.link,
      highlight: run.attributes.highlight
    }))
  }

  it('removes bold only from the middle of a strong span', function () {
    const host = richHost()
    host.innerHTML = '<strong>abcdef</strong>'

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [{ type: 'setTextAttributes', index: 2, length: 2, attributes: { bold: null } }]
    })

    expect(getBlockOperationText(host)).toBe('abcdef')
    expect(runFormats(getBlockTextRuns(host))).toEqual([
      { text: 'ab', bold: true, italic: undefined, link: undefined, highlight: undefined },
      { text: 'cd', bold: undefined, italic: undefined, link: undefined, highlight: undefined },
      { text: 'ef', bold: true, italic: undefined, link: undefined, highlight: undefined }
    ])
  })

  it('removes a link from only part of anchor text', function () {
    const host = richHost()
    host.innerHTML = '<a href="https://example.com">abcdef</a>'

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [{ type: 'setTextAttributes', index: 2, length: 2, attributes: { link: null } }]
    })

    expect(getBlockOperationText(host)).toBe('abcdef')
    const runs = getBlockTextRuns(host)
    expect(
      runs.map((run) => {
        const link = run.attributes.link
        const href =
          link && typeof link === 'object' && !Array.isArray(link) && typeof link.href === 'string'
            ? link.href
            : null
        return [run.text, href]
      })
    ).toEqual([
      ['ab', 'https://example.com'],
      ['cd', null],
      ['ef', 'https://example.com']
    ])
  })

  it('updates formats across text nodes and nested inline elements', function () {
    const host = richHost()
    host.innerHTML = 'a<strong>b</strong>c'

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [{ type: 'setTextAttributes', index: 1, length: 1, attributes: { italic: true } }]
    })

    expect(getBlockOperationText(host)).toBe('abc')
    expect(runFormats(getBlockTextRuns(host))).toEqual([
      { text: 'a', bold: undefined, italic: undefined, link: undefined, highlight: undefined },
      { text: 'b', bold: true, italic: true, link: undefined, highlight: undefined },
      { text: 'c', bold: undefined, italic: undefined, link: undefined, highlight: undefined }
    ])
  })

  it('removes bold while preserving italic on nested markup', function () {
    const host = richHost()
    host.innerHTML = '<strong><em>abcd</em></strong>'

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [{ type: 'setTextAttributes', index: 0, length: 4, attributes: { bold: null } }]
    })

    expect(getBlockOperationText(host)).toBe('abcd')
    expect(runFormats(getBlockTextRuns(host))).toEqual([
      { text: 'abcd', bold: undefined, italic: true, link: undefined, highlight: undefined }
    ])
  })

  it('preserves sibling node order when updating one segment', function () {
    const host = richHost()
    host.innerHTML = '<strong>a</strong><em>b</em><strong>c</strong>'

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [{ type: 'setTextAttributes', index: 1, length: 1, attributes: { bold: true } }]
    })

    expect(getBlockOperationText(host)).toBe('abc')
    expect(runFormats(getBlockTextRuns(host))).toEqual([
      { text: 'a', bold: true, italic: undefined, link: undefined, highlight: undefined },
      { text: 'b', bold: true, italic: true, link: undefined, highlight: undefined },
      { text: 'c', bold: true, italic: undefined, link: undefined, highlight: undefined }
    ])
  })

  it('handles line breaks, emoji, and backward selection restore', function () {
    const host = richHost()
    host.innerHTML = 'a😀<br>b'
    const editable = new Editable({ defaultBehavior: false })
    editable.add(host)
    const selectionBefore = { anchor: 4, head: 1, direction: 'backward' as const }
    setSelectionFromSnapshot(host, selectionBefore)
    const selectedBefore = window.getSelection()?.toString() ?? ''

    applyOperationBatchToDom(
      host,
      {
        source: 'remote',
        operations: [{ type: 'setTextAttributes', index: 1, length: 2, attributes: { bold: true } }]
      },
      { preserveSelection: true, selectionBefore }
    )

    expect(getBlockOperationText(host)).toBe('a😀\nb')
    const runs = getBlockTextRuns(host)
    expect(runs.find((run) => run.text === '😀')?.attributes.bold).toBe(true)
    expect(runs.find((run) => run.text === 'a')?.attributes.bold).toBeUndefined()
    expect(runs.some((run) => run.text.includes('b') && !run.attributes.bold)).toBe(true)

    expect(window.getSelection()?.toString()).toBe(selectedBefore)
    expect(selectedBefore).toContain('😀')

    editable.unload()
  })

  it('supports a registered custom codec without format-specific branches', function () {
    const highlightCodec: InlineFormatCodec = {
      yjsKey: 'highlight',
      domTags: ['mark'],
      readDomElement(element) {
        return element.nodeName === 'MARK' ? true : undefined
      },
      createDomWrapper(doc) {
        return doc.createElement('mark')
      },
      sanitizeYjsValue(value) {
        return value === true ? true : null
      }
    }
    const customRegistry = new InlineFormatRegistry()
    for (const key of defaultInlineFormatRegistry.registeredKeys()) {
      const codec = defaultInlineFormatRegistry.getCodec(key)
      if (codec) customRegistry.register(codec)
    }
    customRegistry.register(highlightCodec)

    const host = richHost(customRegistry)
    host.textContent = 'custom'

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [
        { type: 'setTextAttributes', index: 1, length: 3, attributes: { highlight: true } }
      ]
    })

    expect(getBlockOperationText(host)).toBe('custom')
    expect(runFormats(getBlockTextRuns(host, customRegistry))).toEqual([
      { text: 'c', bold: undefined, italic: undefined, link: undefined, highlight: undefined },
      { text: 'ust', bold: undefined, italic: undefined, link: undefined, highlight: true },
      { text: 'om', bold: undefined, italic: undefined, link: undefined, highlight: undefined }
    ])
    expect(host.querySelector('mark')?.textContent).toBe('ust')
  })
})

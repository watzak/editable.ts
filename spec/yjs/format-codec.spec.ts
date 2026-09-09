import {
  defaultInlineFormatRegistry,
  InlineFormatRegistry
} from '../../src/yjs/inline-format-codec.js'
import { getBlockTextRuns } from '../../src/yjs/dom-text-runs.js'
import { applyLiveOperationBatchToDom } from '../../src/operation-apply.js'
import { insertHostRunsIntoYText } from '../../src/yjs/dom-to-ytext.js'
import * as Y from 'yjs'

describe('InlineFormatCodec', function () {
  afterEach(function () {
    document.querySelectorAll('[contenteditable]').forEach((node) => node.remove())
  })

  function richHost(): HTMLElement {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('data-plaintext', 'false')
    document.body.appendChild(host)
    return host
  }

  it('roundtrips bold through DOM runs and Y.Text', function () {
    const host = richHost()
    host.appendChild(document.createTextNode('plain '))
    const strong = document.createElement('strong')
    strong.appendChild(document.createTextNode('bold'))
    host.appendChild(strong)
    host.appendChild(document.createTextNode(' end'))
    const runs = getBlockTextRuns(host)
    expect(runs.map((run) => run.text).join('')).toBe('plain bold end')
    expect(runs.find((run) => run.text === 'bold')?.attributes.bold).toBe(true)
    expect(runs.find((run) => run.text === ' end')?.attributes.bold).toBeUndefined()

    const doc = new Y.Doc()
    const yText = doc.getText('t')
    insertHostRunsIntoYText(yText, host, document)

    expect(yText.toString()).toBe('plain bold end')
    expect(yText.toDelta()).toEqual([
      { insert: 'plain ' },
      { insert: 'bold', attributes: { bold: true } },
      { insert: ' end' }
    ])
  })

  it('combines bold, italic, underline and link', function () {
    const host = richHost()
    const link = document.createElement('a')
    link.setAttribute('href', 'https://example.com')
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener')
    const underline = document.createElement('u')
    const em = document.createElement('em')
    const strong = document.createElement('strong')
    link.appendChild(document.createTextNode('x'))
    underline.appendChild(link)
    em.appendChild(underline)
    strong.appendChild(em)
    host.appendChild(strong)
    const runs = getBlockTextRuns(host)
    expect(runs[0].attributes.bold).toBe(true)
    expect(runs[0].attributes.italic).toBe(true)
    expect(runs[0].attributes.underline).toBe(true)
    expect(runs[0].attributes.link).toEqual({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener noreferrer'
    })
  })

  it('rejects unsafe link protocols', function () {
    const registry = defaultInlineFormatRegistry
    expect(
      registry.sanitizeDeltaAttributes({ link: { href: 'javascript:alert(1)' } }, document)
    ).toBeUndefined()
    expect(
      registry.sanitizeDeltaAttributes({ link: { href: 'data:text/html,x' } }, document)
    ).toBeUndefined()
    expect(
      registry.sanitizeDeltaAttributes({ link: { href: 'java\u0000script:alert(1)' } }, document)
    ).toBeUndefined()
  })

  it('enforces rel when target is _blank', function () {
    const host = richHost()
    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [
        { type: 'insertText', index: 0, text: 'link' },
        {
          type: 'setTextAttributes',
          index: 0,
          length: 4,
          attributes: {
            link: { href: 'https://example.com', target: '_blank' }
          }
        }
      ]
    })

    const anchor = host.querySelector('a')!
    expect(anchor.getAttribute('href')).toBe('https://example.com')
    expect(anchor.getAttribute('target')).toBe('_blank')
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('drops unknown delta attributes unless registered', function () {
    const registry = new InlineFormatRegistry()
    expect(registry.sanitizeDeltaAttributes({ customMark: true, bold: true }, document)).toEqual({
      bold: true
    })
  })

  it('uses null to remove formats in Y.Text apply', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'abc', { bold: true })
    yText.format(0, 3, { bold: null })
    expect(yText.toDelta()).toEqual([{ insert: 'abc' }])
  })

  it('removes link attributes from Y.Text with null', function () {
    const doc = new Y.Doc()
    const yText = doc.getText('t')
    yText.insert(0, 'link', { link: { href: 'https://example.com' } })
    yText.format(0, 4, { link: null })
    expect(yText.toDelta()).toEqual([{ insert: 'link' }])
  })

  it('maps br to newline semantics in runs', function () {
    const host = richHost()
    host.appendChild(document.createTextNode('a'))
    host.appendChild(document.createElement('br'))
    host.appendChild(document.createTextNode('b'))
    const runs = getBlockTextRuns(host)
    expect(runs.map((run) => run.text).join('')).toBe('a\nb')
  })
})

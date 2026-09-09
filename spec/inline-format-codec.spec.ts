import { defaultInlineFormatRegistry, InlineFormatRegistry } from '../src/inline-format-codec.js'
import { stripInternalChars } from '../src/operation-text-model.js'
import { getBlockTextRuns } from '../src/dom-text-runs.js'
import { applyLiveOperationBatchToDom } from '../src/operation-apply.js'
import { installHostPolicy, resolveHostPolicy } from '../src/host-policy.js'
import { insertHostRunsIntoYText } from '../src/yjs/dom-to-ytext.js'
import * as block from '../src/block.js'
import * as Y from 'yjs'

describe('InlineFormatRegistry', function () {
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

  it('supports superscript and subscript', function () {
    const host = richHost()
    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [
        { type: 'insertText', index: 0, text: 'x2' },
        { type: 'setTextAttributes', index: 1, length: 1, attributes: { superscript: true } }
      ]
    })
    expect(stripInternalChars(host.querySelector('sup')?.textContent ?? '')).toBe('2')

    applyLiveOperationBatchToDom(host, {
      source: 'remote',
      operations: [
        { type: 'setTextAttributes', index: 0, length: 1, attributes: { subscript: true } }
      ]
    })
    expect(stripInternalChars(host.querySelector('sub')?.textContent ?? '')).toBe('x')
  })

  it('rejects unsafe link protocols', function () {
    const registry = defaultInlineFormatRegistry
    expect(
      registry.sanitizeDeltaAttributes({ link: { href: 'javascript:alert(1)' } }, document)
    ).toBeUndefined()
    expect(
      registry.sanitizeDeltaAttributes({ link: { href: 'data:text/html,x' } }, document)
    ).toBeUndefined()
  })

  it('drops unknown delta attributes unless registered', function () {
    const registry = new InlineFormatRegistry()
    expect(registry.sanitizeDeltaAttributes({ customMark: true, bold: true }, document)).toEqual({
      bold: true
    })
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

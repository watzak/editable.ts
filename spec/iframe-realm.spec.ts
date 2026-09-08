import { JSDOM } from 'jsdom'
import { parseContent } from '../src/clipboard.js'
import { createRange } from '../src/util/dom.js'
import Cursor from '../src/cursor.js'
import { Editable } from '../src/core.js'
import { cloneDeep } from '../src/util/clone-deep.js'
import config from '../src/config.js'

describe('Iframe and cross-realm editing', function () {
  function createEditorDom(url: string) {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url })
    return dom.window
  }

  afterEach(function () {
    Editable.globalConfig(cloneDeep(config))
  })

  it('accepts a direct element reference from the configured iframe window', function () {
    const iframeWin = createEditorDom('https://iframe-a.example.com/article')
    const block = iframeWin.document.createElement('div')
    iframeWin.document.body.appendChild(block)

    const editable = new Editable({ window: iframeWin, defaultBehavior: false })
    editable.add(block)

    expect(editable.ownsBlock(block)).toBe(true)
    expect(block.ownerDocument).toBe(iframeWin.document)

    editable.unload()
  })

  it('accepts a NodeList from the iframe document', function () {
    const iframeWin = createEditorDom('https://iframe-b.example.com/article')
    const sheet = iframeWin.document.createElement('div')
    sheet.className = 'sheet'
    const first = iframeWin.document.createElement('p')
    const second = iframeWin.document.createElement('p')
    sheet.append(first, second)
    iframeWin.document.body.appendChild(sheet)

    const editable = new Editable({ window: iframeWin, defaultBehavior: false })
    editable.add(iframeWin.document.querySelectorAll('.sheet p'))

    expect(editable.ownsBlock(first)).toBe(true)
    expect(editable.ownsBlock(second)).toBe(true)

    editable.unload()
  })

  it('creates cursor and range objects in the iframe ownerDocument', function () {
    const iframeWin = createEditorDom('https://iframe-c.example.com/article')
    const block = iframeWin.document.createElement('div')
    block.textContent = 'hello'
    iframeWin.document.body.appendChild(block)

    const editable = new Editable({ window: iframeWin, defaultBehavior: false })
    editable.add(block)

    const cursor = editable.createCursorAtEnd(block)
    expect(cursor).toBeDefined()
    expect(cursor!.range.startContainer.ownerDocument).toBe(iframeWin.document)
    expect(cursor!.win).toBe(iframeWin)

    editable.unload()
  })

  it('handles split events only inside the iframe realm', function () {
    const iframeWin = createEditorDom('https://iframe-d.example.com/article')
    const block = iframeWin.document.createElement('div')
    block.textContent = 'split'
    iframeWin.document.body.appendChild(block)

    const editable = new Editable({ window: iframeWin, defaultBehavior: false })
    editable.add(block)

    let splitCount = 0
    editable.on('split', () => {
      splitCount += 1
    })

    const textNode = block.firstChild as Text
    const range = createRange(iframeWin)
    range.setStart(textNode, 2)
    range.collapse(true)
    new Cursor(block, range).setVisibleSelection()

    block.dispatchEvent(new iframeWin.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(splitCount).toBe(1)

    editable.unload()
  })

  it('uses the iframe document origin for internal paste links', function () {
    const iframeWin = createEditorDom('https://iframe-e.example.com/article')
    const editable = new Editable({
      window: iframeWin,
      defaultBehavior: false,
      pastedHtmlRules: {
        keepInternalRelativeLinks: true
      }
    })

    const div = iframeWin.document.createElement('div')
    div.innerHTML = '<a href="https://iframe-e.example.com/internal/path">link</a>'

    expect(parseContent(div, { pasteRules: editable.pasteRules })[0]).toBe(
      '<a href="/internal/path">link</a>'
    )

    editable.unload()
  })

  it('keeps two iframe editors isolated with different paste rules', function () {
    const domA = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://frame-a.example.com/'
    })
    const domB = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://frame-b.example.com/'
    })

    const editableA = new Editable({
      window: domA.window,
      defaultBehavior: false,
      pastedHtmlRules: { allowedElements: { u: {} } }
    })
    const editableB = new Editable({
      window: domB.window,
      defaultBehavior: false
    })

    const html = '<u>underlined</u>'
    const divA = domA.window.document.createElement('div')
    const divB = domB.window.document.createElement('div')
    divA.innerHTML = html
    divB.innerHTML = html

    expect(parseContent(divA, { pasteRules: editableA.pasteRules })[0]).toBe('<u>underlined</u>')
    expect(parseContent(divB, { pasteRules: editableB.pasteRules })[0]).toBe('underlined')

    editableA.unload()
    editableB.unload()
  })

  it('adopts elements from another realm into the configured iframe document', function () {
    const parentDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://parent.example.com/'
    })
    const iframeWin = createEditorDom('https://iframe-f.example.com/article')

    const externalBlock = parentDom.window.document.createElement('div')
    parentDom.window.document.body.appendChild(externalBlock)

    const editable = new Editable({ window: iframeWin, defaultBehavior: false })
    editable.add(externalBlock)

    expect(externalBlock.ownerDocument).toBe(iframeWin.document)
    expect(editable.ownsBlock(externalBlock)).toBe(true)

    editable.unload()
  })
})

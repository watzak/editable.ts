import { createRange, createElement } from '../src/util/dom.js'
import Cursor from '../src/cursor.js'
import config from '../src/config.js'

describe('Unicode text editing', function () {
  let host: HTMLElement

  beforeEach(function () {
    host = createElement(`<div class="${config.editableClass}"></div>`) as HTMLElement
    document.body.appendChild(host)
  })

  afterEach(function () {
    host.remove()
  })

  it('inserts emoji without breaking cursor offsets', function () {
    const textNode = document.createTextNode('Hello 👋 world')
    host.appendChild(textNode)
    const range = createRange()
    range.setStart(textNode, textNode.length)
    range.collapse(true)
    const cursor = new Cursor(host, range)

    cursor.insertBefore('!')
    expect(host.textContent).toBe('Hello 👋 world!')
  })

  it('preserves combining marks when splitting text around the cursor', function () {
    const combining = 'e\u0301' // é
    const textNode = document.createTextNode(`caf${combining}`)
    host.appendChild(textNode)
    const range = createRange()
    range.setStart(textNode, 3)
    range.collapse(true)
    const cursor = new Cursor(host, range)

    expect(cursor.textBefore()).toBe('caf')
    cursor.insertBefore(' ')
    expect(host.textContent?.normalize('NFC')).toContain('é')
  })

  it('handles bidirectional text in before/after fragments', function () {
    const textNode = document.createTextNode('English مرحبا text')
    host.appendChild(textNode)
    const range = createRange()
    range.setStart(textNode, 'English '.length)
    range.collapse(true)
    const cursor = new Cursor(host, range)

    expect(cursor.textBefore()).toBe('English ')
    expect(cursor.textAfter()).toBe('مرحبا text')
    expect(host.textContent).toContain('مرحبا')
  })
})

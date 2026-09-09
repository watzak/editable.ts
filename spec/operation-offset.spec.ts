import { createRange } from '../src/util/dom.js'
import {
  createOperationRange,
  domPointToOperationOffset,
  domRangeToOperationOffsets,
  getOperationTextLength
} from '../src/operation-offset.js'
import { getBlockOperationText } from '../src/operation-text-model.js'

describe('operation offset utilities', function () {
  it('maps DOM range to UTF-16 offsets with emoji', function () {
    const host = document.createElement('div')
    host.textContent = 'Hi 👋'
    document.body.appendChild(host)

    const range = createRange()
    range.selectNodeContents(host.firstChild!)
    range.setStart(host.firstChild!, 3)
    range.setEnd(host.firstChild!, 5)

    const mapped = domRangeToOperationOffsets(host, range)
    expect(mapped).toEqual({ start: 3, end: 5 })
    expect('Hi 👋'.length).toBe(5)

    host.remove()
  })

  it('creates ranges from UTF-16 offsets across text nodes', function () {
    const host = document.createElement('div')
    host.innerHTML = 'ab<strong>c</strong>d'
    document.body.appendChild(host)

    const range = createOperationRange(host, 2, 3)
    expect(range.toString()).toBe('c')
    expect(getBlockOperationText(host)).toBe('abcd')

    host.remove()
  })

  it('resolves offsets immediately after <br>', function () {
    const host = document.createElement('div')
    host.innerHTML = 'ce&#x0301;<br>😀'
    document.body.appendChild(host)

    expect(domPointToOperationOffset(host, host.lastChild as Text, 0)).toBe(4)
    expect(getOperationTextLength(host)).toBe(6)

    host.remove()
  })

  it('treats <br> as one operation code unit', function () {
    const host = document.createElement('div')
    host.innerHTML = 'line<br>two'
    document.body.appendChild(host)

    expect(getOperationTextLength(host)).toBe(8)
    expect(getBlockOperationText(host)).toBe('line\ntwo')

    const point = domPointToOperationOffset(host, host.childNodes[1], 0)
    expect(point).toBe(4)

    host.remove()
  })
})

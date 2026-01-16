
import {createElement, createRange, rangeToHtml} from '../src/util/dom.js'
import * as rangeSaveRestore from '../src/range-save-restore.js'

describe('RangeSaveRestore', function () {
  let range: Range

  beforeEach(function () {
    range = createRange()
  })

  it('saves a range', function () {
    // <div>|a|</div>
    const host = createElement('<div><div>a</div></div>').firstChild as HTMLElement
    range.setStart(host, 0)
    range.setEnd(host, 1)
    rangeSaveRestore.save(range)
    expect(rangeToHtml(range)).toBe('a')
    expect(host.childNodes[0].nodeName).toBe('SPAN')
    expect(host.childNodes[1].nodeValue).toBe('a')
    expect(host.childNodes[2].nodeName).toBe('SPAN')
  })

  it('restores a range', function () {
    // <div>|a|</div>
    const host = createElement('<div><div>a</div></div>').firstChild as HTMLElement
    range.setStart(host, 0)
    range.setEnd(host, 1)
    const savedRange = rangeSaveRestore.save(range)

    const recoveredRange = rangeSaveRestore.restore(host, savedRange)
    expect(host.innerHTML).toBe('a')
    expect(rangeToHtml(recoveredRange)).toBe('a')
  })

  it('handles a range in two adjacent elements', function () {
    // <div><em>|a</em><em>b|</em></div>
    const host = createElement('<div><em>a</em><em>b</em></div>')
    range.setStart(host.querySelector('em:nth-child(1)') as HTMLElement, 0)
    range.setEnd(host.querySelector('em:nth-child(2)') as HTMLElement, 1)
    const savedRange = rangeSaveRestore.save(range)

    expect(host.innerHTML)
      .toBe(`<em><span id="${savedRange.startMarkerId}" data-editable="remove" style="line-height: 0; display: none;">\ufeff</span>a</em><em>b<span id="${savedRange.endMarkerId}" data-editable="remove" style="line-height: 0; display: none;">\ufeff</span></em>`)

    rangeSaveRestore.restore(host, savedRange)

    expect(host.innerHTML)
      .toBe('<em>a</em><em>b</em>', 'after restore')
  })

  it('handles a range in text nodes of two adjacent elements', function () {
    // <div><em>|a</em><em>b|</em></div>
    const host = createElement('<div><em>a</em><em>b</em></div>')
    const em1 = host.querySelector('em:nth-child(1)') as HTMLElement
    const em2 = host.querySelector('em:nth-child(2)') as HTMLElement
    range.setStart(em1.firstChild as Text, 0)
    range.setEnd(em2.firstChild as Text, 1)
    const savedRange = rangeSaveRestore.save(range)

    // Note this triggers the special behavior of insertRangeBoundaryMarker where
    // the range is added outside the element instead of inside where the text node is
    // (compare with the previous test).
    // Use regex to match any ID numbers instead of hardcoded values (IDs can vary between test runs)
    const expectedPattern = /<span id="editable-range-boundary-\d+" data-editable="remove" style="line-height: 0; display: none;">\ufeff<\/span><em>a<\/em><em>b<\/em><span id="editable-range-boundary-\d+" data-editable="remove" style="line-height: 0; display: none;">\ufeff<\/span>/
    expect(host.innerHTML).toMatch(expectedPattern)

    rangeSaveRestore.restore(host, savedRange)

    expect(host.innerHTML)
      .toBe('<em>a</em><em>b</em>', 'after restore')
  })

  it('handles a range around two adjacent elements', function () {
    // <div>|<em>a</em><em>b</em>|</div>
    const host = createElement('<div><em>a</em><em>b</em></div>')
    range.setStart(host, 0)
    range.setEnd(host, 2)
    const savedRange = rangeSaveRestore.save(range)

    expect(host.innerHTML)
      .toBe(`<span id="${savedRange.startMarkerId}" data-editable="remove" style="line-height: 0; display: none;">\ufeff</span><em>a</em><em>b</em><span id="${savedRange.endMarkerId}" data-editable="remove" style="line-height: 0; display: none;">\ufeff</span>`)

    rangeSaveRestore.restore(host, savedRange)

    expect(host.innerHTML)
      .toBe('<em>a</em><em>b</em>', 'after restore')
  })
})


import {createElement} from '../src/util/dom.js'
import NodeIterator from '../src/node-iterator.js'
import highlightText from '../src/highlight-text.js'

describe('NodeIterator', function () {
  // Helper methods
  // --------------

  function callnTimes (object: any, methodName: string, count: number) {
    let returnValue
    while (count--) returnValue = object[methodName]()
    return returnValue
  }

  describe('constructor method', function () {
    let element: HTMLElement
    let iterator: NodeIterator

    beforeEach(function () {
      element = createElement('<div>a</div>') as HTMLElement
      iterator = new NodeIterator(element)
    })

    it('sets its properties', function () {
      expect(iterator.root).toBe(element)
      expect(iterator.current).toBe(element)
      expect(iterator.nextNode).toBe(element)
      expect(iterator.previous).toBe(element)
    })
  })

  describe('getNext()', function () {
    let element: HTMLElement
    let iterator: NodeIterator

    beforeEach(function () {
      element = createElement('<div>a</div>') as HTMLElement
      iterator = new NodeIterator(element)
    })

    it('returns the root on the first call', function () {
      const current = iterator.getNext()
      expect(current).toBe(element)
    })

    it('returns the the first child on the second call', function () {
      const current = callnTimes(iterator, 'getNext', 2)
      expect(current).toBe(element.firstChild)
    })

    it('returns undefined on the third call', function () {
      const current = callnTimes(iterator, 'getNext', 3)
      expect(current).toBe(undefined)
    })
  })

  describe('replaceCurrent() after using highlightText.wrapPortion()', function () {

    it('replaces the text node', function () {
      const element = createElement('<div>a</div>') as HTMLElement
      const iterator = new NodeIterator(element)
      const current = callnTimes(iterator, 'getNext', 2) as Text
      const replacement = highlightText.wrapPortion({
        element: current,
        offset: 0,
        length: 1
      }, createElement('<span>'))

      iterator.replaceCurrent(replacement)
      expect(iterator.current).toBe(replacement)
      expect(iterator.nextNode).toBe(undefined)
    })

    it('replaces the first character of longer a text node', function () {
      const element = createElement('<div>word</div>') as HTMLElement
      const iterator = new NodeIterator(element)
      let current = callnTimes(iterator, 'getNext', 2) as Text
      const replacement = highlightText.wrapPortion({
        element: current,
        offset: 0,
        length: 1
      }, createElement('<span>'))

      iterator.replaceCurrent(replacement)
      current = iterator.getNext() as Text
      expect(current.data).toBe('ord')
    })
  })
})

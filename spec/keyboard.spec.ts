import { createElement, createRange } from '../src/util/dom.js'
import Keyboard from '../src/keyboard.js'
import * as nodeType from '../src/node-type.js'

describe('Keyboard', function () {
  describe('dispatchKeyEvent()', function () {
    let keyboard: Keyboard
    let called: number

    beforeEach(function () {
      const mockedSelectionWatcher = {
        getFreshRange: () => ({})
      }
      keyboard = new Keyboard(mockedSelectionWatcher as never)
      called = 0
    })

    it('notifies a left event', function () {
      keyboard.on('left', () => called++)
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' })
      keyboard.dispatchKeyEvent(event, {} as HTMLElement)
      expect(called).toBe(1)
    })

    describe('notify "character" event', function () {
      it('does not fire the event for a "left" key', function () {
        keyboard.on('character', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(0)
      })

      it('does not fire the event for a "ctrl" key', function () {
        keyboard.on('character', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'Control' })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(0)
      })

      it('does fire the event for a "e" key', function () {
        keyboard.on('character', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'e' })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(1)
      })

      it('does not fire the event for a "e" key without the notifyCharacterEvent param', function () {
        keyboard.on('character', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'e' })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, false)
        expect(called).toBe(0)
      })

      it('does not fire editing events while composing', function () {
        keyboard.on('enter', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement)
        expect(called).toBe(0)
      })

      it('does not fire editing events for IME fallback keyCode 229', function () {
        keyboard.on('enter', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement)
        expect(called).toBe(0)
      })
    })

    describe('notify "bold" event', function () {
      it('does not fire the event for a "b" key without "ctrl" or "meta" key', function () {
        keyboard.on('bold', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(0)
      })

      it('does fire the event for a "b" key with "ctrl" key', function () {
        keyboard.on('bold', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(1)
      })

      it('does fire the event for a "b" key with "meta" key', function () {
        keyboard.on('bold', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', metaKey: true })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(1)
      })
    })

    describe('notify "italic" event', function () {
      it('does not fire the event for a "i" key without "ctrl" or "meta" key', function () {
        keyboard.on('italic', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'i', code: 'KeyI' })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(0)
      })

      it('does fire the event for a "i" key with "ctrl" key', function () {
        keyboard.on('italic', () => called++)
        const event = new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', ctrlKey: true })
        keyboard.dispatchKeyEvent(event, {} as HTMLElement, true)
        expect(called).toBe(1)
      })
    })
  })

  describe('getNodeToRemove()', function () {
    let contenteditable: HTMLElement
    let range: Range
    let nodeText2: Text
    let nodeText3: Text
    let nodeText4: Text
    let nodeText5: Text
    let nodeText6: Text
    let nodeA: Element
    let nodeB: Element

    beforeEach(function () {
      contenteditable = createElement(
        '<CONTENTEDITABLE>Text1<A><B>Text2</B>Text3<C>Text4</C>Text5</A>Text6</CONTENTEDITABLE>'
      ) as HTMLElement
      const nodes: Record<string, Node> = {}
      destructureNodes(contenteditable, nodes)
      nodeText2 = nodes.nodeText2 as Text
      nodeText3 = nodes.nodeText3 as Text
      nodeText4 = nodes.nodeText4 as Text
      nodeText5 = nodes.nodeText5 as Text
      nodeText6 = nodes.nodeText6 as Text
      nodeA = nodes.nodeA as Element
      nodeB = nodes.nodeB as Element
      range = createRange()
    })

    it('returns undefined for a ranga within a node', function () {
      range.setStart(nodeText2, 0)
      range.setEnd(nodeText2, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(undefined)
    })

    it('returns the parent node of the start node when the start node is a text node with offset is 0 and end node is outside of the parent node', function () {
      range.setStart(nodeText2, 0)
      range.setEnd(nodeText3, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(nodeB)
    })

    it('returns the parent node of the start node when the start node is a text node with offset is 0 and end node is within a sibling of the parent node', function () {
      range.setStart(nodeText2, 0)
      range.setEnd(nodeText4, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(nodeB)
    })

    it('returns the parent node of the start node when the start node is a text node with offset is 0 and end node is after a sibling of the parent node', function () {
      range.setStart(nodeText2, 0)
      range.setEnd(nodeText5, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(nodeB)
    })

    it('recursively returns the parent if needed', function () {
      range.setStart(nodeText2, 0)
      range.setEnd(nodeText6, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(nodeA)
    })

    it('returns undefined for a range that starts with an offset of 1', function () {
      range.setStart(nodeText2, 1)
      range.setEnd(nodeText6, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(undefined)
    })

    it('returns undefined for a range that starts with an offset of 1 on text3', function () {
      range.setStart(nodeText3, 0)
      range.setEnd(nodeText6, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(undefined)
    })
  })
})

function destructureNodes(elem: Node, obj: Record<string, Node>) {
  Array.from(elem.childNodes, (node) => {
    if (node.nodeType === nodeType.elementNode) {
      obj[`node${(node as Element).tagName}`] = node
      destructureNodes(node, obj)
    } else if (node.nodeType === nodeType.textNode) {
      obj[`node${node.nodeValue}`] = node
    }
  })
}


import {createElement, createRange} from '../src/util/dom.js'
import Keyboard from '../src/keyboard.js'
import * as nodeType from '../src/node-type.js'

describe('Keyboard', function () {

  describe('dispatchKeyEvent()', function () {
    let keyboard, event, called

    beforeEach(function () {
      const mockedSelectionWatcher = {
        getFreshRange: () => ({})
      }
      keyboard = new Keyboard(mockedSelectionWatcher)
      event = new Event('keydown')
      called = 0
    })

    it('notifies a left event', function () {
      keyboard.on('left', () => called++)

      event.keyCode = Keyboard.key.left
      keyboard.dispatchKeyEvent(event, {})
      expect(called).toBe(1)
    })

    describe('notify "character" event', function () {

      it('does not fire the event for a "left" key', function () {
        keyboard.on('character', () => called++)

        event.keyCode = Keyboard.key.left
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(0)
      })

      it('does not fire the event for a "ctrl" key', function () {
        keyboard.on('character', () => called++)

        event.keyCode = Keyboard.key.ctrl
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(0)
      })

      it('does fire the event for a "e" key', function () {
        keyboard.on('character', () => called++)

        event.keyCode = 'e'.charCodeAt(0)
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(1)
      })

      it('does not fire the event for a "e" key without the notifyCharacterEvent param', function () {
        keyboard.on('character', (evt) => called++)

        event.keyCode = 'e'.charCodeAt(0)
        keyboard.dispatchKeyEvent(event, {}, false)
        expect(called).toBe(0)
      })

      it('does fire the event for a "b" key', function () {
        keyboard.on('character', () => called++)

        event.keyCode = Keyboard.key.b
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(1)
      })

      it('does fire the event for an "i" key', function () {
        keyboard.on('character', () => called++)

        event.keyCode = Keyboard.key.i
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(1)
      })
    })

    describe('notify "bold" event', function () {

      it('does not fire the event for a "b" key without "ctrl" or "meta" key', function () {
        keyboard.on('bold', () => called++)

        event.keyCode = Keyboard.key.b
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(0)
      })

      it('does fire the event for a "b" key with "ctrl" key', function () {
        keyboard.on('bold', () => called++)

        event.keyCode = Keyboard.key.b
        event.ctrlKey = true
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(1)
      })

      it('does fire the event for a "b" key with "meta" key', function () {
        keyboard.on('bold', () => called++)

        event.keyCode = Keyboard.key.b
        event.metaKey = true
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(1)
      })
    })

    describe('notify "italic" event', function () {

      it('does not fire the event for a "i" key without "ctrl" or "meta" key', function () {
        keyboard.on('italic', () => called++)

        event.keyCode = Keyboard.key.i
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(0)
      })

      it('does fire the event for a "i" key with "ctrl" key', function () {
        keyboard.on('italic', () => called++)

        event.keyCode = Keyboard.key.i
        event.ctrlKey = true
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(1)
      })

      it('does fire the event for a "i" key with "meta" key', function () {
        keyboard.on('italic', () => called++)

        event.keyCode = Keyboard.key.i
        event.metaKey = true
        keyboard.dispatchKeyEvent(event, {}, true)
        expect(called).toBe(1)
      })
    })
  })

  describe('getNodeToRemove()', function () {
    let contenteditable, range, nodeText1, nodeText2, nodeText3, nodeText4, nodeText5, nodeText6, nodeA, nodeB, nodeC

    beforeEach(function () {
      contenteditable = createElement('<CONTENTEDITABLE>Text1<A><B>Text2</B>Text3<C>Text4</C>Text5</A>Text6</CONTENTEDITABLE>')
      const nodes = {}
      destructureNodes(contenteditable, nodes)
      nodeText1 = nodes.nodeText1
      nodeText2 = nodes.nodeText2
      nodeText3 = nodes.nodeText3
      nodeText4 = nodes.nodeText4
      nodeText5 = nodes.nodeText5
      nodeText6 = nodes.nodeText6
      nodeA = nodes.nodeA
      nodeB = nodes.nodeB
      nodeC = nodes.nodeC
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

    it('returns undefined for a range that starts with an offset of 1', function () {
      range.setStart(nodeText3, 0)
      range.setEnd(nodeText6, 2)
      expect(Keyboard.getNodeToRemove(range, contenteditable)).toBe(undefined)
    })
  })
})

function destructureNodes (elem, obj) {
  Array.from(elem.childNodes, (node) => {
    if (node.nodeType === nodeType.elementNode) {
      obj[`node${node.tagName}`] = node
      destructureNodes(node, obj)
    } else if (node.nodeType === nodeType.textNode) {
      obj[`node${node.nodeValue}`] = node
    }
  })
}


import {createRange} from '../src/util/dom.js'

import Cursor from '../src/cursor.js'
import {Editable} from '../src/core.js'

describe('Default Events', function () {

  // create a Cursor object and set the selection to it
  function createCursor (elem, range) {
    const cursor = new Cursor(elem, range)
    cursor.setVisibleSelection()
    return cursor
  }

  function createRangeAtEnd (node) {
    const range = createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    return range
  }

  // register one listener per test
  function on (editable, eventName, func) {
    // off() // make sure the last listener is unregistered
    const obj = {calls: 0}
    function proxy () {
      obj.calls += 1
      func.apply(this, arguments)
    }
    editable.on(eventName, proxy)
    return obj
  }

  describe('for editable', function () {

    describe('on focus', function () {
      let focus, blur, elem, editable

      beforeEach(function () {
        focus = new Event('focus')
        blur = new Event('blur')
        elem = document.createElement('div')
        document.body.appendChild(elem)
        editable = new Editable()
        editable.add(elem)
        elem.focus()
      })

      afterEach(function () {
        editable.unload()
        elem.remove()
      })

      it('always dispatches with virtual and native ranges in sync.', function () {
        // <div>foo\</div>
        elem.innerHTML = 'foo'
        createCursor(elem, createRangeAtEnd(elem))

        const onFocus = on(editable, 'focus', (element, selection) => {
          if (!selection) return
          expect(element).toBe(elem)
          expect(selection.range).toBeInstanceOf(Range)
        })

        elem.dispatchEvent(focus)
        elem.dispatchEvent(blur)
        elem.dispatchEvent(focus)
        expect(onFocus.calls).toBe(2)
      })
    })
  })
})

import {createRange, containsRange} from './util/dom.js'
import {contenteditableSpanBug} from './feature-detection.js'
import * as nodeType from './node-type.js'
import eventable from './eventable.js'
import type SelectionWatcher from './selection-watcher.js'

interface KeyCodes {
  left: number
  up: number
  right: number
  down: number
  tab: number
  esc: number
  backspace: number
  delete: number
  enter: number
  shift: number
  ctrl: number
  alt: number
  b: number
  i: number
}

/**
 * The Keyboard module defines an event API for key events.
 */

export default class Keyboard {
  public key: KeyCodes
  public notify!: (event: string, ...args: any[]) => void
  public on!: ((event: string, handler: (...args: any[]) => any) => this) & ((events: Record<string, (...args: any[]) => any>) => this)
  public off!: (...args: any[]) => void
  public selectionWatcher: SelectionWatcher

  constructor (selectionWatcher: SelectionWatcher) {
    eventable(this)
    this.selectionWatcher = selectionWatcher
    this.key = (Keyboard as any).key
  }

  dispatchKeyEvent (event: KeyboardEvent, target: any, notifyCharacterEvent?: boolean): void {
    switch (event.keyCode) {
      case this.key.left:
        return this.notify(target, 'left', event)

      case this.key.right:
        return this.notify(target, 'right', event)

      case this.key.up:
        return this.notify(target, 'up', event)

      case this.key.down:
        return this.notify(target, 'down', event)

      case this.key.tab:
        if (event.shiftKey) return this.notify(target, 'shiftTab', event)
        return this.notify(target, 'tab', event)

      case this.key.esc:
        return this.notify(target, 'esc', event)

      case this.key.backspace:
        this.preventContenteditableBug(target, event)
        return this.notify(target, 'backspace', event)

      case this.key.delete:
        this.preventContenteditableBug(target, event)
        return this.notify(target, 'delete', event)

      case this.key.enter:
        if (event.shiftKey) return this.notify(target, 'shiftEnter', event)
        return this.notify(target, 'enter', event)

      case this.key.ctrl:
      case this.key.shift:
      case this.key.alt:
        return

      // Metakey
      case 224: // Firefox: 224
      case 17: // Opera: 17
      case 91: // Chrome/Safari: 91 (Left)
      case 93: // Chrome/Safari: 93 (Right)
        return

      default:
        // Added here to avoid using fall-through in the switch
        // when b or i are pressed without ctrlKey or metaKey
        if (event.keyCode === this.key.b && (event.ctrlKey || event.metaKey)) {
          return this.notify(target, 'bold', event)
        }
        if (event.keyCode === this.key.i && (event.ctrlKey || event.metaKey)) {
          return this.notify(target, 'italic', event)
        }

        this.preventContenteditableBug(target, event)
        if (!notifyCharacterEvent) return
        // Don't notify character events as long as either the ctrl or
        // meta key are pressed.
        // see: https://github.com/livingdocsIO/editable.js/pull/125
        if (!event.ctrlKey && !event.metaKey) return this.notify(target, 'character', event)
    }
  }

  preventContenteditableBug (target: HTMLElement, event: KeyboardEvent): void {
    if (!contenteditableSpanBug) return
    if (event.ctrlKey || event.metaKey) return

    // This fixes a strange webkit bug that can be reproduced as follows:
    //
    // 1. A node used within a contenteditable has some style, e.g through the
    //    following CSS:
    //
    //      strong {
    //        color: red
    //      }
    //
    // 2. A selection starts with the first character of a styled node and ends
    //    outside of that node, e.g: "big beautiful" is selected in the following
    //    html:
    //
    //      <p contenteditable="true">
    //        Hello <strong>big</strong> beautiful world
    //      </p>
    //
    // 3. The user types a letter character to replace "big beautiful", e.g. "x"
    //
    // Result: Webkits adds <font> and <b> tags:
    //
    //    <p contenteditable="true">
    //      Hello
    //      <font color="#ff0000">
    //        <b>f</b>
    //      </font>
    //      world
    //    </p>
    //
    // This bug ONLY happens, if the first character of the node is selected and
    // the selection goes further than the node.
    //
    // Solution:
    //
    // Manually remove the element that would be removed anyway before inserting
    // the new letter.
    const rangeContainer = this.selectionWatcher.getFreshRange()
    if (!rangeContainer.isSelection || !rangeContainer.range) return

    const nodeToRemove = Keyboard.getNodeToRemove(rangeContainer.range, target)
    if (nodeToRemove) nodeToRemove.remove()
  }

  static getNodeToRemove (selectionRange: Range, target: HTMLElement): Element | undefined {
    // This function is only used by preventContenteditableBug. It is exposed on
    // the Keyboard constructor for testing purpose only.

    // Let's make sure we are in the edge-case, in which the bug happens.
    // The selection does not start at the beginning of a node. We have
    // nothing to do.
    if (selectionRange.startOffset !== 0) return undefined

    let startNodeElement: Element = selectionRange.startContainer as Element

    // If the node is a textNode, we select its parent.
    if (startNodeElement.nodeType === nodeType.textNode) {
      const parent = startNodeElement.parentNode
      if (!parent || parent.nodeType !== nodeType.elementNode) return undefined
      startNodeElement = parent as Element
    }

    // The target is the contenteditable element, which we do not want to replace
    if (startNodeElement === target) return undefined

    // We get a range that contains everything within the sartNodeElement to test
    // if the selectionRange is within the startNode, we have nothing to do.
    const firstChild = startNodeElement.firstChild
    const lastChild = startNodeElement.lastChild
    if (!firstChild || !lastChild) return undefined
    
    const startNodeRange = createRange()
    startNodeRange.setStartBefore(firstChild)
    startNodeRange.setEndAfter(lastChild)
    if (containsRange(startNodeRange, selectionRange)) return undefined

    // If the selectionRange.startContainer was a textNode, we have to make sure
    // that its parent's content starts with this node. Content is either a
    // text node or an element. This is done to avoid false positives like the
    // following one:
    // <strong>foo<em>bar</em>|baz</strong>quux|
    if (selectionRange.startContainer.nodeType === nodeType.textNode) {
      const contentNodeTypes = [nodeType.textNode, nodeType.elementNode]
      let firstContentNode: Node | null = startNodeElement.firstChild

      do {
        if (firstContentNode && contentNodeTypes.indexOf(firstContentNode.nodeType) !== -1) break
        firstContentNode = firstContentNode ? firstContentNode.nextSibling : null
      } while (firstContentNode)

      if (firstContentNode !== selectionRange.startContainer) return undefined
    }

    // Now we know, that we have to return at least the startNodeElement for
    // removal. But it could be, that we also need to remove its parent, e.g.
    // we need to remove <strong> in the following example:
    // <strong><em>|foo</em>bar</strong>baz|
    const rangeStartingBeforeCurrentElement = selectionRange.cloneRange()
    rangeStartingBeforeCurrentElement.setStartBefore(startNodeElement)

    const parentResult = Keyboard.getNodeToRemove(
      rangeStartingBeforeCurrentElement,
      target
    )
    return parentResult || startNodeElement
  }
}

(Keyboard as any).key = Keyboard.prototype.key = {
  left: 37,
  up: 38,
  right: 39,
  down: 40,
  tab: 9,
  esc: 27,
  backspace: 8,
  delete: 46,
  enter: 13,
  shift: 16,
  ctrl: 17,
  alt: 18,
  b: 66,
  i: 73
}

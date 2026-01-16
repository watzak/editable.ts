import * as viewport from './util/viewport.js'

import * as content from './content.js'
import * as parser from './parser.js'
import * as string from './util/string.js'
import {elementNode, documentFragmentNode} from './node-type.js'
import error from './util/error.js'
import * as rangeSaveRestore from './range-save-restore.js'
import type {RangeInfo} from './range-save-restore.js'
import {closest, getSelection, rangesAreEqual} from './util/dom.js'

/**
 * The Cursor module provides a cross-browser abstraction layer for cursor.
 *
 * @module core
 * @submodule cursor
 */

export default class Cursor {
  public host!: HTMLElement
  public range!: Range
  public win!: Window
  public isCursor?: boolean
  public isSelection?: boolean
  private savedRangeInfo?: RangeInfo & {host?: HTMLElement}

  static findHost (elem: Node, selector: string): HTMLElement | undefined {
    return closest(elem, selector)
  }

  /**
  * Class for the Cursor module.
  *
  * @class Cursor
  * @constructor
  */
  constructor (editableHost: HTMLElement, range: Range) {
    this.setHost(editableHost)
    this.range = range
    this.isCursor = true
  }

  // Get all tags that affect the current selection. Optionally pass a
  // method to filter the returned elements.
  //
  // @param {Function filter(node)} [Optional] Method to filter the returned
  //   DOM Nodes.
  // @return {Array of DOM Nodes}
  getTags (filterFunc?: ((node: Node) => boolean) | null): Node[] {
    return content.getTags(this.host, this.range, filterFunc)
  }

  // Get the names of all tags that affect the current selection. Optionally
  // pass a method to filter the returned elements.
  //
  // @param {Function filter(node)} [Optional] Method to filter the DOM
  //   Nodes whose names are returned.
  // @return {Array<String> of tag names}
  getTagNames (filterFunc?: ((node: Node) => boolean) | null): string[] {
    const tags: Node[] = this.getTags(filterFunc)
    return (content.getTagNames as (elements: Node[]) => string[])(tags)
  }

  // Get all tags of the specified type that affect the current selection.
  //
  // @method getTagsByName
  // @param {String} tagName. E.g. 'a' to get all links.
  // @return {Array of DOM Nodes}
  getTagsByName (tagName: string): Node[] {
    return content.getTagsByName(this.host, this.range, tagName) as Node[]
  }

  // Get all tags that are completely within the current selection.
  getInnerTags (filterFunc?: ((node: Node) => boolean) | null): Node[] {
    return content.getInnerTags(this.range, filterFunc)
  }

  // Get all tags whose text is completely within the current selection.
  getContainedTags (filterFunc?: (node: Node) => boolean) {
    return content.getContainedTags(this.range, filterFunc)
  }

  // Get all tags that surround the current selection.
  getAncestorTags (filterFunc?: (node: Node) => boolean) {
    return content.getAncestorTags(this.host, this.range, filterFunc)
  }

  isAtEnd () {
    return parser.isEndOfHost(
      this.host,
      this.range.endContainer,
      this.range.endOffset
    )
  }

  isAtTextEnd () {
    return parser.isTextEndOfHost(
      this.host,
      this.range.endContainer,
      this.range.endOffset
    )
  }

  isAtLastLine () {
    const hostRange = this.win.document.createRange()
    hostRange.selectNodeContents(this.host)
    hostRange.collapse(false)
    const hostCoords = getRangeBoundingClientRect(hostRange, this.win)
    const cursorCoords = getRangeBoundingClientRect(this.range, this.win)
    return isCloseTo(hostCoords.bottom, cursorCoords.bottom)
  }

  isAtFirstLine () {
    const hostRange = this.win.document.createRange()
    hostRange.selectNodeContents(this.host)
    hostRange.collapse(true)
    const hostCoords = getRangeBoundingClientRect(hostRange, this.win)
    const cursorCoords = getRangeBoundingClientRect(this.range, this.win)
    return isCloseTo(hostCoords.top, cursorCoords.top)
  }

  isAtBeginning () {
    return parser.isBeginningOfHost(
      this.host,
      this.range.startContainer,
      this.range.startOffset
    )
  }

  // Insert content before the cursor
  //
  // @param {String, DOM node or document fragment}
  insertBefore (element: Node | string): void {
    if (string.isString(element)) element = content.createFragmentFromString(element)
    if (parser.isDocumentFragmentWithoutChildren(element)) return

    element = this.adoptElement(element)

    let preceedingElement = element
    if (element.nodeType === documentFragmentNode) {
      const lastIndex = element.childNodes.length - 1
      preceedingElement = element.childNodes[lastIndex]
    }

    this.range.insertNode(element)
    this.range.setStartAfter(preceedingElement)
    this.range.setEndAfter(preceedingElement)
    this.host.normalize() // mend text nodes
  }

  // Insert content after the cursor
  //
  // @param {String, DOM node or document fragment}
  insertAfter (element: Node): void {
    if (string.isString(element)) element = content.createFragmentFromString(element)
    if (parser.isDocumentFragmentWithoutChildren(element)) return

    element = this.adoptElement(element)

    const after = this.range.cloneRange()
    after.setStart(after.endContainer, after.endOffset)
    after.collapse(true)
    after.insertNode(element)
    this.host.normalize() // mend text nodes
  }

  // Alias for #setVisibleSelection()
  setSelection () {
    this.setVisibleSelection()
  }

  setVisibleSelection () {
    if (this.win.document.activeElement !== this.host) {
      const {x, y} = viewport.getScrollPosition(this.win)
      this.win.scrollTo(x, y)
    }

    const selection = getSelection(this.win)
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(this.range)
  }

  // Take the following example:
  // (The character '|' represents the cursor position)
  //
  // <div contenteditable="true">fo|o</div>
  // before() will return a document fragment containing a text node 'fo'.
  //
  // @returns {Document Fragment} content before the cursor or selection.
  before () {
    const range = this.range.cloneRange()
    range.collapse(true)
    range.setStartBefore(this.host)
    return content.cloneRangeContents(range)
  }

  textBefore () {
    const range = this.range.cloneRange()
    range.collapse(true)
    range.setStartBefore(this.host)
    return range.toString()
  }

  // Same as before() but returns a string.
  beforeHtml () {
    return content.getInnerHtmlOfFragment(this.before())
  }

  // Take the following example:
  // (The character '|' represents the cursor position)
  //
  // <div contenteditable="true">fo|o</div>
  // after() will return a document fragment containing a text node 'o'.
  //
  // @returns {Document Fragment} content after the cursor or selection.
  after () {
    const range = this.range.cloneRange()
    range.collapse(false)
    range.setEndAfter(this.host)
    return content.cloneRangeContents(range)
  }

  textAfter () {
    const range = this.range.cloneRange()
    range.collapse(false)
    range.setEndAfter(this.host)
    return range.toString()
  }

  // Same as after() but returns a string.
  afterHtml () {
    return content.getInnerHtmlOfFragment(this.after())
  }

  getBoundingClientRect () {
    return this.range.getBoundingClientRect()
  }

  // Get the BoundingClientRect of the cursor.
  // The returned values are transformed to be absolute
  // (relative to the document).
  getCoordinates (positioning = 'absolute') {
    const coords = this.range.getBoundingClientRect()
    if (positioning === 'fixed') return coords

    // translate into absolute positions
    const {x, y} = viewport.getScrollPosition(this.win)
    return {
      top: coords.top + y,
      bottom: coords.bottom + y,
      left: coords.left + x,
      right: coords.right + x,
      height: coords.height,
      width: coords.width
    }
  }

  moveBefore (element: Node): Cursor | void {
    this.updateHost(element)
    this.range.setStartBefore(element)
    this.range.setEndBefore(element)
    if (this.isSelection) return new Cursor(this.host, this.range)
  }

  moveAfter (element: Node): Cursor | void {
    this.updateHost(element)
    this.range.setEndAfter(element)
    this.range.setStartAfter(element)
    if (this.isSelection) return new Cursor(this.host, this.range)
  }

  // Move the cursor to the beginning of the host.
  moveAtBeginning (element: HTMLElement = this.host): Cursor | void {
    this.updateHost(element)
    this.range.selectNodeContents(element)
    this.range.collapse(true)
    if (this.isSelection) return new Cursor(this.host, this.range)
  }

  // Move the cursor to the end of the host.
  moveAtEnd (element: HTMLElement = this.host): Cursor | void {
    this.updateHost(element)
    this.range.selectNodeContents(element)
    this.range.collapse(false)
    if (this.isSelection) return new Cursor(this.host, this.range)
  }

  // Move the cursor after the last visible character of the host.
  moveAtTextEnd (element: HTMLElement): Cursor | void {
    const lastChild = parser.lastChild(element)
    if (lastChild && lastChild.nodeType === elementNode) {
      return this.moveAtEnd(lastChild as HTMLElement)
    }
  }

  setHost (element: HTMLElement | any): void {
    if ((element as any).jquery) element = (element as any)[0]
    this.host = element
    const doc = element.ownerDocument
    this.win = (element === undefined || element === null || !doc) ? window : (doc.defaultView || window)
  }

  updateHost (element: Node): void {
    const host = parser.getHost(element)
    if (!host) error('Can not set cursor outside of an editable block')
    this.setHost(host)
  }

  retainVisibleSelection (callback: () => void): void {
    this.save()
    callback() // eslint-disable-line callback-return
    this.restore()
    this.setVisibleSelection()
  }

  save () {
    this.savedRangeInfo = rangeSaveRestore.save(this.range)
    this.savedRangeInfo.host = this.host
  }

  restore (): void {
    if (!this.savedRangeInfo) {
      error('Could not restore selection')
      return
    }

    if (this.savedRangeInfo.host) {
      this.host = this.savedRangeInfo.host
    }
    const restoredRange = rangeSaveRestore.restore(this.host, this.savedRangeInfo)
    if (!restoredRange) {
      error('Could not restore selection range')
      return
    }
    this.range = restoredRange
    this.savedRangeInfo = undefined
  }

  equals (cursor: Cursor | null | undefined): boolean {
    if (!cursor) return false

    if (!cursor.host) return false
    if (!cursor.host.isEqualNode(this.host)) return false

    if (!cursor.range) return false
    if (!rangesAreEqual(cursor.range, this.range)) return false

    return true
  }

  // Create an element with the correct ownerWindow
  // (see: http://www.w3.org/DOM/faq.html#ownerdoc)
  createElement (tagName: string, attributes: Record<string, string> = {}): HTMLElement {
    const element = this.win.document.createElement(tagName)
    for (const attributeName in attributes) {
      const attributeValue = attributes[attributeName]
      element.setAttribute(attributeName, attributeValue)
    }
    return element
  }

  createTextNode (text: string): Text {
    return this.win.document.createTextNode(text)
  }

  // Make sure a node has the correct ownerWindow
  // (see: https://developer.mozilla.org/en-US/docs/Web/API/Document/importNode)
  adoptElement (node: Node): Node {
    return content.adoptElement(node, this.win.document)
  }

  // Currently we call triggerChange manually after format changes.
  // This is to prevent excessive triggering of the change event during
  // merge or split operations or other manipulations by scripts.
  triggerChange () {
    const event = new Event('formatEditable', {bubbles: true, cancelable: false})
    this.host.dispatchEvent(event)
  }
}


/**
* Get position of the range or cursor
*
* Can be used to reliably get the boundingClientRect without
* some any of the drawbacks that the native range has.
*
* With the native range.getClientBoundingRect(), newlines are
* not considered when calculating the position
*
* @param {Range} range
* @param {Window} win
*/
function getRangeBoundingClientRect (range: Range, win: Window): DOMRect {
  if (range.startContainer.nodeType !== elementNode) return range.getBoundingClientRect()
  const el = win.document.createElement('span')
  el.setAttribute('doc-editable', 'unwrap')
  range.insertNode(el)
  const coords = el.getBoundingClientRect()
  el.remove()
  return coords
}

function isCloseTo (a: number, b: number): boolean {
  if (a === b) return true
  if (Math.abs(a - b) <= 2) return true
  return false
}

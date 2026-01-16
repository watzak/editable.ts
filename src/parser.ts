import * as string from './util/string.js'
import * as nodeType from './node-type.js'
import config from './config.js'
import {closest} from './util/dom.js'

/**
 * The parser module provides helper methods to parse html-chunks
 * manipulations and helpers for common tasks.
 * Provides DOM lookup helpers
 *
 * @module core
 * @submodule parser
 */

/**
 * Get the editableJS host block of a node.
 *
 * @method getHost
 * @param {DOM Node}
 * @return {DOM Node}
 */
export function getHost (node: Node | any): HTMLElement | null {
  node = (node.jquery ? node[0] : node)
  // Check if the node itself is an editable element
  if (node && (node as Element).classList && (node as Element).classList.contains(config.editableClass)) {
    return node as HTMLElement
  }
  const result = closest(node, `.${config.editableClass}`)
  if (result) return result
  const contentEditableHost = closest(node, '[contenteditable="true"]')
  return contentEditableHost || null
}

/**
 * Get the index of a node so that
 * parent.childNodes[ getNodeIndex(node) ] would return the node again.
 *
 * @method getNodeIndex
 * @param {HTMLElement}
 */
export function getNodeIndex (node: Node): number {
  let index = 0
  let currentNode: Node | null = node.previousSibling
  while (currentNode !== null) {
    index++
    currentNode = currentNode.previousSibling
  }
  return index
}

/**
 * Check if node contains text or element nodes
 * whitespace counts too!
 *
 * @method isVoid
 * @param {HTMLElement}
 */
export function isVoid (node: Node): boolean {
  const childNodes = Array.from(node.childNodes)
  for (const child of childNodes) {
    if (child.nodeType === nodeType.textNode && !isVoidTextNode(child)) {
      return false
    }
    if (child.nodeType === nodeType.elementNode) {
      return false
    }
  }
  return true
}

/**
 * Check if node is a text node and completely empty without any whitespace
 *
 * @method isVoidTextNode
 * @param {HTMLElement}
 */
export function isVoidTextNode (node: Node): boolean {
  return node.nodeType === nodeType.textNode && !node.nodeValue
}

/**
 * Check if node is a text node and contains nothing but whitespace
 *
 * @method isWhitespaceOnly
 * @param {HTMLElement}
 */
export function isWhitespaceOnly (node: Node): boolean {
  return node.nodeType === nodeType.textNode && lastOffsetWithContent(node) === 0
}

export function isLinebreak (node: Node): boolean {
  return node.nodeType === nodeType.elementNode && (node as Element).tagName === 'BR'
}

/**
 * Returns the last offset where the cursor can be positioned to
 * be at the visible end of its container.
 * Currently works only for empty text nodes (not empty tags)
 *
 * @method isWhitespaceOnly
 * @param {HTMLElement}
 */
export function lastOffsetWithContent (elem: Node): number {
  if (elem.nodeType === nodeType.textNode) {
    const nodeValue = elem.nodeValue
    if (!nodeValue) return 0
    return string.trimRight(nodeValue).length
  }

  let lastOffset = 0
  Array.from(elem.childNodes).reverse().every((node, index, nodes) => {
    if (isWhitespaceOnly(node) || isLinebreak(node)) return true

    lastOffset = nodes.length - index
    return false
  })
  return lastOffset
}

export function isBeginningOfHost (host: Node, container: Node, offset: number): boolean {
  if (container === host) return isStartOffset(container, offset)

  if (isStartOffset(container, offset)) {
    // The index of the element simulates a range offset
    // right before the element.
    const offsetInParent = getNodeIndex(container)
    const parentNode = container.parentNode
    if (!parentNode) return false
    return isBeginningOfHost(host, parentNode, offsetInParent)
  }

  return false
}

export function isEndOfHost (host: Node, container: Node, offset: number): boolean {
  if (container === host) return isEndOffset(container, offset)

  if (isEndOffset(container, offset)) {
    // The index of the element plus one simulates a range offset
    // right after the element.
    const offsetInParent = getNodeIndex(container) + 1
    const parentNode = container.parentNode
    if (!parentNode) return false
    return isEndOfHost(host, parentNode, offsetInParent)
  }

  return false
}

export function isStartOffset (container: Node, offset: number): boolean {
  if (container.nodeType === nodeType.textNode) return offset === 0

  if (container.childNodes.length === 0) return true

  const firstChild = container.firstChild
  if (
    container.childNodes.length === 1 &&
    firstChild &&
    firstChild.nodeType === nodeType.elementNode &&
    (firstChild as Element).getAttribute('data-editable') === 'remove'
  ) return true

  return container.childNodes[offset] === container.firstChild
}

export function isEndOffset (container: Node, offset: number): boolean {
  if (container.nodeType === nodeType.textNode) return offset === (container as Text).length

  if (container.childNodes.length === 0) return true

  if (offset > 0) return container.childNodes[offset - 1] === container.lastChild

  return false
}

export function isTextEndOfHost (host: Node, container: Node, offset: number): boolean {
  if (container === host) return isTextEndOffset(container, offset)

  if (isTextEndOffset(container, offset)) {
    // The index of the element plus one simulates a range offset
    // right after the element.
    const offsetInParent = getNodeIndex(container) + 1
    const parentNode = container.parentNode
    if (!parentNode) return false
    return isTextEndOfHost(host, parentNode, offsetInParent)
  }

  return false
}

export function isTextEndOffset (container: Node, offset: number): boolean {
  if (container.nodeType === nodeType.textNode) {
    const nodeValue = container.nodeValue
    if (!nodeValue) return offset === 0
    const text = string.trimRight(nodeValue)
    return offset >= text.length
  }

  if (container.childNodes.length === 0) return true

  return offset >= lastOffsetWithContent(container)
}

export function isSameNode (target: Node, source: Node): boolean {
  let i, len, attr

  if (target.nodeType !== source.nodeType) return false

  if (target.nodeName !== source.nodeName) return false

  if (target.nodeType !== 1 || source.nodeType !== 1) return true

  const targetElem = target as Element
  const sourceElem = source as Element

  for (i = 0, len = targetElem.attributes.length; i < len; i++) {
    attr = targetElem.attributes[i]
    if (sourceElem.getAttribute(attr.name) !== attr.value) return false
  }

  return true
}

/**
 * Return the deepest last child of a node.
 *
 * @method  lastChild
 * @param  {HTMLElement} container The container to iterate on.
 * @return {HTMLElement}           The deepest last child in the container.
 */
export function lastChild (container: Node): Node {
  return container.lastChild
    ? lastChild(container.lastChild)
    : container
}

/**
 * Obsolete version of {{#crossLink "lastChild"}}{{/crossLink}}.
 */
export function latestChild (container: Node): Node {
  console.warn('Editable.js: Using obsolete function parser.latestCild(), use lastChild() instead')
  return lastChild(container)
}

/**
 * Checks if a documentFragment has no children.
 * Fragments without children can cause errors if inserted into ranges.
 *
 * @method  isDocumentFragmentWithoutChildren
 * @param  {HTMLElement} DOM node.
 * @return {Boolean}
 */
export function isDocumentFragmentWithoutChildren (fragment: Node | null | undefined): boolean {
  return !!(fragment &&
    fragment.nodeType === nodeType.documentFragmentNode &&
    fragment.childNodes.length === 0)
}

/**
 * Determine if an element behaves like an inline element.
 */
export function isInlineElement (window: Window, element: HTMLElement): boolean {
  const styles = (element as any).currentStyle || window.getComputedStyle(element, '')
  const display = styles.display
  switch (display) {
    case 'inline':
    case 'inline-block':
      return true
    default:
      return false
  }
}

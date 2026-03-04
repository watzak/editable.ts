import NodeIterator from '../node-iterator.js'
import {textNode} from '../node-type.js'

export const domArray = (target: HTMLElement | HTMLElement[] | string | NodeList, doc: Document, scope?: HTMLElement): HTMLElement[] => {
  if (typeof target === 'string') {
    const container = scope || doc
    return Array.from(container.querySelectorAll(target)) as HTMLElement[]
  }
  if (target instanceof Element) return [target as HTMLElement]
  if (Array.isArray(target)) return target
  return Array.from(target as NodeList) as HTMLElement[]
}

export const domSelector = (target: HTMLElement | string, doc: Document): HTMLElement | null => {
  if (typeof target === 'string') return doc.querySelector(target)
  return target
}

export const createElement = (html: string, win: Window = window): HTMLElement | null => {
  const el = win.document.createElement('div')
  el.innerHTML = html
  return el.firstElementChild as HTMLElement | null
}

export const closest = (elem: Node | null | undefined, selector: string): HTMLElement | undefined => {
  if (!elem) return undefined
  const element = elem.nodeType === Node.ELEMENT_NODE
    ? elem as Element
    : elem.parentElement
  return element?.closest<HTMLElement>(selector) ?? undefined
}

export const createRange = (win: Window = window): Range => {
  return win.document.createRange()
}

export const getSelection = (win: Window = window): Selection | null => {
  const docSelection = win.document.getSelection ? win.document.getSelection() : null
  if (docSelection) return docSelection
  return win.getSelection ? win.getSelection() : null
}

export const getNodes = (range: Range, nodeTypes: number[], filterFunc?: ((node: Node) => boolean) | null): Node[] => {
  const nodes: Node[] = []
  const doc = range.commonAncestorContainer.ownerDocument || document

  const nodeIterator = doc.createNodeIterator(
    range.commonAncestorContainer,
    NodeFilter.SHOW_ALL,
    {
      acceptNode(node: Node): number {
        if (
          range.intersectsNode(node) &&
          nodeTypes.includes(node.nodeType) &&
          node !== range.commonAncestorContainer // Exclude the common ancestor container
        ) {
          if (typeof filterFunc === 'function') {
            return filterFunc(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
          }
          return NodeFilter.FILTER_ACCEPT
        }
        return NodeFilter.FILTER_SKIP
      }
    }
  )

  let currentNode: Node | null
  while ((currentNode = nodeIterator.nextNode())) {
    nodes.push(currentNode)
  }

  return nodes
}

export const normalizeBoundaries = (range: Range): void => {
  if (range.startContainer.compareDocumentPosition(range.endContainer) & Node.DOCUMENT_POSITION_FOLLOWING) {
    range.setStartBefore(range.endContainer)
  }

  if (range.endContainer.compareDocumentPosition(range.startContainer) & Node.DOCUMENT_POSITION_PRECEDING) {
    range.setEndAfter(range.startContainer)
  }
}

export const containsRange = (containerRange: Range, testRange: Range): boolean => {
  return (
    containerRange.compareBoundaryPoints(Range.START_TO_START, testRange) <= 0 &&
    containerRange.compareBoundaryPoints(Range.END_TO_END, testRange) >= 0
  )
}

export const containsNodeText = (range: Range, node: Node): boolean => {
  const nodeRange = (node.ownerDocument || document).createRange()
  nodeRange.selectNodeContents(node)
  return containsRange(range, nodeRange)
}

export const nodeContainsRange = (node: Node, range: Range): boolean => {
  const nodeRange = (node.ownerDocument || document).createRange()
  nodeRange.selectNodeContents(node)
  return containsRange(nodeRange, range)
}

const isCharacterDataNode = (node: Node): boolean => {
  return node && (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE)
}

const splitDataNode = (node: Node, offset: number): Text => {
  return (node as Text).splitText(offset)
}

export const splitBoundaries = (range: Range): void => {
  const startContainer = range.startContainer
  const startOffset = range.startOffset
  const endContainer = range.endContainer
  const endOffset = range.endOffset

  if (isCharacterDataNode(endContainer) && endOffset > 0 && endOffset < (endContainer as Text).length) {
    splitDataNode(endContainer, endOffset)
  }

  if (isCharacterDataNode(startContainer) && startOffset > 0 && startOffset < (startContainer as Text).length) {
    const newStartContainer = splitDataNode(startContainer, startOffset)
    range.setStart(newStartContainer, 0)
  }
}

export interface CharacterRange {
  start: number
  end: number
  text: string
}

export const toCharacterRange = (range: Range, container: Node): CharacterRange => {
  const startRange = range.cloneRange()
  startRange.setStart(container, 0)
  startRange.setEnd(range.startContainer, range.startOffset)

  const rangeText = range.toString()
  const start = startRange.toString().length
  const end = start + rangeText.length

  return {start, end, text: rangeText}
}

export const rangesAreEqual = (range1: Range, range2: Range): boolean => {
  return (
    range1.startContainer === range2.startContainer &&
    range1.startOffset === range2.startOffset &&
    range1.endContainer === range2.endContainer &&
    range1.endOffset === range2.endOffset
  )
}

export const rangeToHtml = (range: Range, win: Window = window): string => {
  const div = win.document.createElement('div')
  div.appendChild(range.cloneContents())
  return div.innerHTML
}

export interface Coordinates {
  top: number
  left: number
  bottom: number
  right: number
  width: number
  height: number
}

export const getSelectionCoordinates = (selection: Selection): Coordinates[] => {
  const range = selection.getRangeAt(0)
  return Array.from(range.getClientRects(), ({top, left, bottom, right, width, height}) => ({
    top, left, bottom, right, width, height
  }))
}

export const createRangeFromCharacterRange = (element: Node, actualStartIndex: number, actualEndIndex: number): Range => {
  const doc = element.ownerDocument || document
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
  let currentIndex = 0
  let startNode: Text | null = null
  let endNode: Text | null = null
  let startOffset = 0
  let endOffset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const nodeLength = node.nodeValue?.length || 0

    if (currentIndex + nodeLength <= actualStartIndex) {
      currentIndex += nodeLength
      continue
    }

    if (!startNode) {
      startNode = node
      startOffset = actualStartIndex - currentIndex
    }

    if (currentIndex + nodeLength >= actualEndIndex) {
      endNode = node
      endOffset = actualEndIndex - currentIndex
      break
    }

    currentIndex += nodeLength
  }

  if (startNode && endNode) {
    const range = createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } else {
    throw new Error('Invalid character offsets.')
  }
}

export function findStartExcludingWhitespace({root, startContainer, startOffset, whitespacesOnTheLeft}: {
  root: Node
  startContainer: Node
  startOffset: number
  whitespacesOnTheLeft: number
}): [Text, number] {
  let container: Node = startContainer
  let offset = startOffset
  let remaining = whitespacesOnTheLeft

  while (true) {
    // Resolve non-text nodes to their child at the given offset
    if (container.nodeType !== textNode) {
      container = container.childNodes[offset]
      offset = 0
      continue
    }

    const offsetAfterWhitespace = offset + remaining
    if ((container as Text).length > offsetAfterWhitespace) {
      return [container as Text, offsetAfterWhitespace]
    }

    // Need to continue into the next text node
    remaining = offsetAfterWhitespace - (container as Text).length
    const iterator = new NodeIterator(root)
    iterator.nextNode = container as Text
    iterator.getNextTextNode() // skip self

    const next = iterator.getNextTextNode()
    if (!next) {
      const previousTextNode = iterator.getPreviousTextNode()
      if (!previousTextNode) throw new Error('No previous text node found')
      return [previousTextNode, previousTextNode.length]
    }

    container = next
    offset = 0
  }
}

export function findEndExcludingWhitespace({root, endContainer, endOffset, whitespacesOnTheRight}: {
  root: Node
  endContainer: Node
  endOffset: number
  whitespacesOnTheRight: number
}): [Text, number] {
  let container: Node = endContainer
  let offset = endOffset
  let remaining = whitespacesOnTheRight

  while (true) {
    // Resolve non-text nodes to their child at the given offset
    if (container.nodeType !== textNode) {
      const isFirstNode = !container.childNodes[offset - 1]
      const child = isFirstNode
        ? container.childNodes[offset]
        : container.childNodes[offset - 1]
      if (!isFirstNode) {
        offset = child.nodeType === textNode
          ? (child as Text).length
          : child.childNodes.length
      } else {
        offset = 0
      }
      container = child
      continue
    }

    const offsetBeforeWhitespace = offset - remaining
    if (offsetBeforeWhitespace > 0) {
      return [container as Text, offsetBeforeWhitespace]
    }

    // Need to continue into the previous text node
    remaining = remaining - offset
    const iterator = new NodeIterator(root)
    iterator.previous = container as Text
    iterator.getPreviousTextNode() // skip self

    const prev = iterator.getPreviousTextNode()
    if (!prev) {
      const nextNode = iterator.getNextTextNode()
      if (!nextNode) throw new Error('No next text node found')
      return [nextNode, 0]
    }

    container = prev
    offset = prev.length
  }
}


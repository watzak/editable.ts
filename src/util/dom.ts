import NodeIterator from '../node-iterator.js'
import {textNode} from '../node-type.js'

export const domArray = (target: HTMLElement | HTMLElement[] | string | NodeList, documentOrHost: Document | HTMLElement, host?: HTMLElement): HTMLElement[] => {
  if (typeof target === 'string') {
    const doc = (documentOrHost as Document).querySelectorAll ? documentOrHost as Document : (documentOrHost as HTMLElement).ownerDocument!
    const container = host || documentOrHost as HTMLElement
    return Array.from(container.querySelectorAll ? container.querySelectorAll(target) : doc.querySelectorAll(target)) as HTMLElement[]
  }
  if ((target as HTMLElement).tagName) return [target as HTMLElement]
  if (Array.isArray(target)) return target
  // Support NodeList and jQuery arrays
  return Array.from(target as NodeList) as HTMLElement[]
}

export const domSelector = (target: HTMLElement | string | NodeList | HTMLElement[], document: Document): HTMLElement | null => {
  if (typeof target === 'string') return document.querySelector(target)
  if ((target as HTMLElement).tagName) return target as HTMLElement
  // Support NodeList and jQuery arrays
  if ((target as any)[0]) return (target as any)[0]
  return target as HTMLElement
}

export const createElement = (html: string, win: Window = window): HTMLElement | null => {
  const el = win.document.createElement('div')
  el.innerHTML = html
  return el.firstElementChild as HTMLElement | null
}

export const closest = (elem: Node | null | undefined, selector: string): HTMLElement | undefined => {
  if (!elem) return undefined
  // For text nodes or other nodes without closest, traverse to parent element
  let currentNode: Node | null = elem
  while (currentNode && !(currentNode as any).closest) {
    currentNode = currentNode.parentNode
  }
  if (currentNode && (currentNode as any).closest) {
    return (currentNode as any).closest(selector)
  }
  return undefined
}

export const createRange = (win: Window = window): Range => {
  return win.document.createRange()
}

export const getSelection = (win: Window = window): Selection | null => {
  const docSelection = win.document.getSelection ? win.document.getSelection() : null
  if (docSelection) return docSelection
  return win.getSelection ? win.getSelection() : null
}

export const getNodes = (range: Range, nodeTypes: number[], filterFunc?: ((node: Node) => boolean) | null, win: Window = window): Node[] => {
  const nodes: Node[] = []

  const nodeIterator = win.document.createNodeIterator(
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
  if (range.startContainer.compareDocumentPosition(range.endContainer) === Node.DOCUMENT_POSITION_FOLLOWING) {
    range.setStartBefore(range.endContainer)
  }

  if (range.endContainer.compareDocumentPosition(range.startContainer) === Node.DOCUMENT_POSITION_PRECEDING) {
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
  const nodeRange = document.createRange()
  nodeRange.selectNodeContents(node)
  const comparisonStart = range.compareBoundaryPoints(Range.START_TO_START, nodeRange)
  const comparisonEnd = range.compareBoundaryPoints(Range.END_TO_END, nodeRange)
  return comparisonStart <= 0 && comparisonEnd >= 0
}

export const nodeContainsRange = (node: Node, range: Range): boolean => {
  const nodeRange = document.createRange()
  nodeRange.selectNodeContents(node)
  const comparisonStart = range.compareBoundaryPoints(Range.START_TO_START, nodeRange)
  const comparisonEnd = range.compareBoundaryPoints(Range.END_TO_END, nodeRange)
  return comparisonStart >= 0 && comparisonEnd <= 0
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
  const range = selection.getRangeAt(0) // Assuming you want coordinates of the first range

  const rects = range.getClientRects()
  const coordinates: Coordinates[] = []

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    coordinates.push({
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
      width: rect.width,
      height: rect.height
    })
  }

  return coordinates
}

export const createRangeFromCharacterRange = (element: Node, actualStartIndex: number, actualEndIndex: number): Range => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
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
  const isTextNode = startContainer.nodeType === textNode
  if (!isTextNode) {
    return findStartExcludingWhitespace({
      root,
      startContainer: startContainer.childNodes[startOffset],
      startOffset: 0,
      whitespacesOnTheLeft
    })
  }

  const offsetAfterWhitespace = startOffset + whitespacesOnTheLeft
  if ((startContainer as Text).length > offsetAfterWhitespace) {
    return [startContainer as Text, offsetAfterWhitespace]
  }

  // Pass the root so that the iterator can traverse to siblings
  const iterator = new NodeIterator(root)
  // Set the position to the node which is selected
  iterator.nextNode = startContainer as Text
  // Iterate once to avoid returning self
  iterator.getNextTextNode()

  const container = iterator.getNextTextNode()
  if (!container) {
    // No more text nodes - use the end of the last text node
    const previousTextNode = iterator.getPreviousTextNode()
    if (!previousTextNode) throw new Error('No previous text node found')
    return [previousTextNode, previousTextNode.length]
  }

  return findStartExcludingWhitespace({
    root,
    startContainer: container,
    startOffset: 0,
    whitespacesOnTheLeft: offsetAfterWhitespace - (startContainer as Text).length
  })
}

export function findEndExcludingWhitespace({root, endContainer, endOffset, whitespacesOnTheRight}: {
  root: Node
  endContainer: Node
  endOffset: number
  whitespacesOnTheRight: number
}): [Text, number] {
  const isTextNode = endContainer.nodeType === textNode
  if (!isTextNode) {
    const isFirstNode = !endContainer.childNodes[endOffset - 1]
    const container = isFirstNode
      ? endContainer.childNodes[endOffset]
      : endContainer.childNodes[endOffset - 1]
    let offset = 0
    if (!isFirstNode) {
      offset = container.nodeType === textNode
        ? (container as Text).length
        : container.childNodes.length
    }
    return findEndExcludingWhitespace({
      root,
      endContainer: container,
      endOffset: offset,
      whitespacesOnTheRight
    })
  }

  const offsetBeforeWhitespace = endOffset - whitespacesOnTheRight
  if (offsetBeforeWhitespace > 0) {
    return [endContainer as Text, offsetBeforeWhitespace]
  }

  // Pass the root so that the iterator can traverse to siblings
  const iterator = new NodeIterator(root)
  // Set the position to the node which is selected
  iterator.previous = endContainer as Text
  // Iterate once to avoid returning self
  iterator.getPreviousTextNode()

  const container = iterator.getPreviousTextNode()
  if (!container) {
    // No more text nodes - use the start of the first text node
    const nextNode = iterator.getNextTextNode()
    if (!nextNode) throw new Error('No next text node found')
    return [nextNode, 0]
  }

  return findEndExcludingWhitespace({
    root,
    endContainer: container,
    endOffset: container.length,
    whitespacesOnTheRight: whitespacesOnTheRight - endOffset
  })
}


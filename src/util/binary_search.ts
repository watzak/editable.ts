import {getTotalCharCount, textNodesUnder, getTextNodeAndRelativeOffset} from './element.js'
import {createRange} from './dom.js'

interface BinarySearchData {
  currentOffset: number
  leftLimit: number
  rightLimit: number
}

export interface BinaryCursorSearchResult {
  wasFound: boolean
  distance?: number
  offset?: number
}

/**
 * This is a binary search algorithm implementation aimed at finding
 * a character offset position in a consecutive strings of characters
 * over several lines.
 *
 * Refer to this page in order to learn more about binary search:
 * https://en.wikipedia.org/wiki/Binary_search_algorithm
 *
 * @returns {object}
 *  - object with boolean `wasFound` indicating if the binary search found an offset and `offset` to indicate the actual character offset
 */
export function binaryCursorSearch({
  host,
  requiredOnFirstLine,
  requiredOnLastLine,
  positionX // coordinates relative to viewport (e.g. from getBoundingClientRect())
}: {
  host: HTMLElement
  requiredOnFirstLine: boolean
  requiredOnLastLine: boolean
  positionX: number
}): BinaryCursorSearchResult {
  const hostRange = host.ownerDocument.createRange()
  hostRange.selectNodeContents(host)
  // JSDOM doesn't support getBoundingClientRect on Range, use element instead
  let hostCoords: DOMRect
  try {
    hostCoords = hostRange.getBoundingClientRect()
  } catch (e) {
    // Fallback for JSDOM
    hostCoords = host.getBoundingClientRect() || {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect
  }
  const totalCharCount = getTotalCharCount(host)
  const textNodes = textNodesUnder(host)

  // early terminate on empty editables
  if (totalCharCount === 0) return {wasFound: false}

  const data: BinarySearchData = {
    currentOffset: Math.floor(totalCharCount / 2),
    leftLimit: 0,
    rightLimit: totalCharCount
  }

  let offset = data.currentOffset
  let distance = 0
  let safety = 20
  while (data.leftLimit < data.rightLimit && safety > 0) {
    safety = safety - 1
    offset = data.currentOffset
    const range = createRangeAtCharacterOffset({textNodes, offset: data.currentOffset})
    // JSDOM doesn't support getBoundingClientRect on Range
    let coords: DOMRect
    try {
      coords = range.getBoundingClientRect()
    } catch (e) {
      // Fallback for JSDOM - use a mock DOMRect
      coords = {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRect
    }
    distance = Math.abs(coords.left - positionX)

    // up / down axis
    if (requiredOnFirstLine && hostCoords.top !== coords.top) {
      moveLeft(data)
      continue
    } else if (requiredOnLastLine && hostCoords.bottom !== coords.bottom) {
      moveRight(data)
      continue
    }

    // left / right axis
    if (positionX < coords.left) {
      moveLeft(data)
    } else {
      moveRight(data)
    }
  }

  const range = createRangeAtCharacterOffset({textNodes, offset: data.currentOffset})
  // JSDOM doesn't support getBoundingClientRect on Range
  let coords: DOMRect
  try {
    coords = range.getBoundingClientRect()
  } catch (e) {
    // Fallback for JSDOM
    coords = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect
  }
  const finalDistance = Math.abs(coords.left - positionX)

  // Decide if last or second last offset is closest
  if (finalDistance < distance) {
    distance = finalDistance
    offset = data.currentOffset
  }

  return {distance, offset, wasFound: true}
}

// move the binary search index in between the current position and the left limit
function moveLeft(data: BinarySearchData): void {
  data.rightLimit = data.currentOffset
  data.currentOffset = Math.floor((data.currentOffset + data.leftLimit) / 2)
}

// move the binary search index in between the current position and the right limit
function moveRight(data: BinarySearchData): void {
  data.leftLimit = data.currentOffset
  data.currentOffset = Math.ceil((data.currentOffset + data.rightLimit) / 2)
}

function createRangeAtCharacterOffset({textNodes, offset}: {
  textNodes: Text[]
  offset: number
}): Range {
  const {node, relativeOffset} = getTextNodeAndRelativeOffset({textNodes, absOffset: offset})
  if (!node) throw new Error('Could not find text node for offset')

  const newRange = node.ownerDocument.createRange()
  newRange.setStart(node, relativeOffset)
  newRange.collapse(true)

  return newRange
}


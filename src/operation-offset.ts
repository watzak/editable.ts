import NodeIterator from './node-iterator.js'
import * as nodeType from './node-type.js'
import { stripInternalChars } from './operation-text-model.js'

export interface OperationBoundary {
  node: Node
  /** UTF-16 offset inside `node` when it is a text node; ignored for `<br>`. */
  offset: number
}

interface OperationSegment {
  start: number
  end: number
  node: Node
  nodeStart: number
  nodeEnd: number
  kind: 'text' | 'lineBreak'
}

function collectOperationSegments(host: HTMLElement): OperationSegment[] {
  const segments: OperationSegment[] = []
  let offset = 0
  const iterator = new NodeIterator(host)
  let next: Node | undefined

  while ((next = iterator.getNext())) {
    if (next.nodeType === nodeType.textNode) {
      const raw = (next as Text).data
      if (raw === '') continue
      const text = stripInternalChars(raw)
      if (!text) continue
      segments.push({
        start: offset,
        end: offset + text.length,
        node: next,
        nodeStart: 0,
        nodeEnd: text.length,
        kind: 'text'
      })
      offset += text.length
      continue
    }

    if (next.nodeType === nodeType.elementNode && (next as Element).nodeName === 'BR') {
      segments.push({
        start: offset,
        end: offset + 1,
        node: next,
        nodeStart: 0,
        nodeEnd: 1,
        kind: 'lineBreak'
      })
      offset += 1
    }
  }

  return segments
}

/** UTF-16 length of the host in the operation text model. */
export function getOperationTextLength(host: HTMLElement): number {
  const segments = collectOperationSegments(host)
  return segments.length ? segments[segments.length - 1].end : 0
}

export function resolveOperationBoundary(
  host: HTMLElement,
  operationOffset: number
): OperationBoundary {
  const doc = host.ownerDocument
  if (!doc) throw new Error('Host requires ownerDocument')

  const segments = collectOperationSegments(host)
  const length = segments.length ? segments[segments.length - 1].end : 0

  if (operationOffset < 0 || operationOffset > length) {
    throw new Error(`Operation offset ${operationOffset} out of range (0..${length})`)
  }

  if (segments.length === 0) {
    return ensureEditableTextPoint(host, operationOffset)
  }

  for (const segment of segments) {
    if (operationOffset < segment.end) {
      if (segment.kind === 'lineBreak') {
        return { node: segment.node, offset: 0 }
      }
      const within = operationOffset - segment.start
      return { node: segment.node, offset: within }
    }
    if (operationOffset === segment.end && segment.kind === 'lineBreak') {
      return { node: segment.node, offset: 0 }
    }
  }

  const last = segments[segments.length - 1]
  if (last.kind === 'lineBreak') {
    return { node: last.node, offset: 0 }
  }
  return { node: last.node, offset: (last.node as Text).data.length }
}

function ensureEditableTextPoint(host: HTMLElement, operationOffset: number): OperationBoundary {
  const doc = host.ownerDocument!
  const iterator = new NodeIterator(host)
  let next: Node | undefined
  while ((next = iterator.getNext())) {
    if (next.nodeType === nodeType.textNode) {
      const stripped = stripInternalChars((next as Text).data)
      if (!stripped && operationOffset === 0) {
        return { node: next, offset: 0 }
      }
    }
  }

  if (host.childNodes.length === 0) {
    const textNode = doc.createTextNode('\uFEFF')
    host.appendChild(textNode)
    return { node: textNode, offset: 0 }
  }

  return { node: host, offset: 0 }
}

function setRangeBoundary(
  range: Range,
  boundary: OperationBoundary,
  position: 'start' | 'end',
  collapsed: boolean
): void {
  const isBr =
    boundary.node.nodeType === nodeType.elementNode && (boundary.node as Element).nodeName === 'BR'

  if (isBr) {
    if (position === 'start') {
      range.setStartBefore(boundary.node)
    } else if (collapsed) {
      range.setEndBefore(boundary.node)
    } else {
      range.setEndAfter(boundary.node)
    }
    return
  }

  if (position === 'start') {
    range.setStart(boundary.node, boundary.offset)
  } else {
    range.setEnd(boundary.node, boundary.offset)
  }
}

export function createOperationRange(host: HTMLElement, start: number, end: number): Range {
  const doc = host.ownerDocument
  if (!doc) throw new Error('Host requires ownerDocument')

  const range = doc.createRange()
  const collapsed = start === end
  const startBoundary = resolveOperationBoundary(host, start)
  const endBoundary = resolveOperationBoundary(host, end)

  setRangeBoundary(range, startBoundary, 'start', collapsed)
  setRangeBoundary(range, endBoundary, 'end', collapsed)

  return range
}

function mapTextNodeOffset(node: Text, offset: number): number {
  const raw = node.data
  const stripped = stripInternalChars(raw)
  if (!stripped) return 0
  if (offset <= 0) return 0
  const prefix = stripInternalChars(raw.slice(0, offset))
  return prefix.length
}

export function domPointToOperationOffset(
  host: HTMLElement,
  container: Node,
  offset: number
): number | undefined {
  if (!host.contains(container)) return undefined

  const segments = collectOperationSegments(host)

  if (container.nodeType === nodeType.elementNode && (container as Element).nodeName === 'BR') {
    const segment = segments.find((entry) => entry.kind === 'lineBreak' && entry.node === container)
    return segment?.start
  }

  if (container === host) {
    return offset === 0 ? 0 : undefined
  }

  for (const segment of segments) {
    if (segment.kind !== 'text' || segment.node !== container) continue
    const within = mapTextNodeOffset(container as Text, offset)
    return segment.start + within
  }

  return undefined
}

export function domRangeToOperationOffsets(
  host: HTMLElement,
  range: Range
): { start: number; end: number } | undefined {
  if (!host.contains(range.commonAncestorContainer)) return undefined

  const start = domPointToOperationOffset(host, range.startContainer, range.startOffset)
  const end = domPointToOperationOffset(host, range.endContainer, range.endOffset)
  if (start === undefined || end === undefined) return undefined
  return { start, end }
}

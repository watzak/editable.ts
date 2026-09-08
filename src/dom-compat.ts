export interface JQueryLike<T> {
  jquery: unknown
  0: T
}

export type MaybeWrapped<T> = T | JQueryLike<T>

export function isJQueryLike<T>(value: unknown): value is JQueryLike<T> {
  return value !== null && typeof value === 'object' && 'jquery' in value && 0 in value
}

export function unwrapElement<T>(value: MaybeWrapped<T>): T {
  return isJQueryLike<T>(value) ? value[0] : value
}

export interface SelectionChangeDocument extends Document {
  onselectionchange: ((this: GlobalEventHandlers, ev: Event) => unknown) | null
}

export const NODE_FILTER = {
  SHOW_ALL: 0xffffffff,
  SHOW_TEXT: 4,
  FILTER_ACCEPT: 1,
  FILTER_SKIP: 3
} as const

export function isElement(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nodeType' in value &&
    (value as Node).nodeType === 1
  )
}

export function isNodeLike(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'nodeType' in value
}

export function isNodeListLike(value: unknown): value is NodeList {
  return (
    typeof value === 'object' &&
    value !== null &&
    'length' in value &&
    typeof (value as NodeList).item === 'function'
  )
}

export function getNodeFilter(doc: Document | null | undefined): typeof NODE_FILTER {
  return doc?.defaultView?.NodeFilter ?? NODE_FILTER
}

export function getRangeConstants(doc: Document | null | undefined): {
  START_TO_START: number
  END_TO_END: number
} {
  const RangeCtor = doc?.defaultView?.Range
  return {
    START_TO_START: RangeCtor?.START_TO_START ?? 0,
    END_TO_END: RangeCtor?.END_TO_END ?? 2
  }
}

export function getNodePositionConstants(doc: Document | null | undefined): {
  DOCUMENT_POSITION_FOLLOWING: number
  DOCUMENT_POSITION_PRECEDING: number
} {
  const NodeCtor = doc?.defaultView?.Node
  return {
    DOCUMENT_POSITION_FOLLOWING: NodeCtor?.DOCUMENT_POSITION_FOLLOWING ?? 4,
    DOCUMENT_POSITION_PRECEDING: NodeCtor?.DOCUMENT_POSITION_PRECEDING ?? 2
  }
}

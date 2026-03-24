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

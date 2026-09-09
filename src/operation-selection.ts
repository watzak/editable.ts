import { toCharacterRange } from './util/dom.js'
import type { SelectionDirection, SelectionSnapshot } from './operation-types.js'
import type Selection from './selection.js'
import type Cursor from './cursor.js'

export function selectionDirection(anchor: number, head: number): SelectionDirection {
  if (anchor === head) return 'none'
  return head > anchor ? 'forward' : 'backward'
}

export function captureSelectionSnapshot(
  host: HTMLElement,
  cursorOrSelection: Cursor | Selection | undefined
): SelectionSnapshot | undefined {
  if (!cursorOrSelection?.range) return undefined
  if (!host.contains(cursorOrSelection.range.commonAncestorContainer)) return undefined

  const { start, end } = toCharacterRange(cursorOrSelection.range, host)
  const anchor = cursorOrSelection.isSelection ? start : start
  const head = cursorOrSelection.isSelection ? end : start

  return {
    anchor,
    head,
    direction: selectionDirection(anchor, head)
  }
}

export function collapsedOffset(snapshot: SelectionSnapshot): number {
  return snapshot.direction === 'backward' ? snapshot.anchor : snapshot.head
}

export function selectionSpan(snapshot: SelectionSnapshot): { start: number; end: number } {
  return {
    start: Math.min(snapshot.anchor, snapshot.head),
    end: Math.max(snapshot.anchor, snapshot.head)
  }
}

export function staticRangeToCharacterRange(
  range: StaticRange | Range,
  host: HTMLElement
): { start: number; end: number } {
  const doc = host.ownerDocument
  if (!doc) return { start: 0, end: 0 }

  const liveRange = doc.createRange()
  liveRange.setStart(range.startContainer, range.startOffset)
  liveRange.setEnd(range.endContainer, range.endOffset)
  return toCharacterRange(liveRange, host)
}

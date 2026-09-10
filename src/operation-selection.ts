import { toCharacterRange } from './util/dom.js'
import {
  createOperationRange,
  domPointToOperationOffset,
  domRangeToOperationOffsets
} from './operation-offset.js'
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

  const win = host.ownerDocument?.defaultView
  const browserSelection = win?.getSelection()

  if (
    browserSelection &&
    browserSelection.rangeCount > 0 &&
    browserSelection.anchorNode &&
    browserSelection.focusNode &&
    host.contains(browserSelection.anchorNode) &&
    host.contains(browserSelection.focusNode)
  ) {
    const anchor = domPointToOperationOffset(
      host,
      browserSelection.anchorNode,
      browserSelection.anchorOffset
    )
    const head = domPointToOperationOffset(
      host,
      browserSelection.focusNode,
      browserSelection.focusOffset
    )
    if (anchor !== undefined && head !== undefined) {
      return {
        anchor,
        head,
        direction: selectionDirection(anchor, head)
      }
    }
  }

  const mapped = domRangeToOperationOffsets(host, cursorOrSelection.range)
  if (mapped) {
    const anchor = mapped.start
    const head = cursorOrSelection.isSelection ? mapped.end : mapped.start
    return {
      anchor,
      head,
      direction: selectionDirection(anchor, head)
    }
  }

  const { start, end } = toCharacterRange(cursorOrSelection.range, host)
  const anchor = start
  const head = cursorOrSelection.isSelection ? end : start

  return {
    anchor,
    head,
    direction: selectionDirection(anchor, head)
  }
}

export function setSelectionFromSnapshot(host: HTMLElement, snapshot: SelectionSnapshot): void {
  const doc = host.ownerDocument
  const win = doc?.defaultView
  if (!doc || !win) return

  const start = Math.min(snapshot.anchor, snapshot.head)
  const end = Math.max(snapshot.anchor, snapshot.head)
  const startRange = createOperationRange(host, start, start)
  const range = doc.createRange()

  if (start === end) {
    range.setStart(startRange.startContainer, startRange.startOffset)
    range.collapse(true)
  } else {
    const endRange = createOperationRange(host, end, end)
    range.setStart(startRange.startContainer, startRange.startOffset)
    range.setEnd(endRange.endContainer, endRange.endOffset)
  }

  const selection = win.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
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

import * as content from './content.js'
import highlightText from './highlight-text.js'
import {searchText, type Match} from './plugins/highlighting/text-search.js'
import {createElement, createRange, toCharacterRange} from './util/dom.js'
import type Dispatcher from './dispatcher.js'

interface ExtendedMatch extends Match {
  id?: string
}

const highlightSupport = {

  // Used to highlight arbitrary text in an editable. All occurrences
  // will be highlighted.
  highlightText (editableHost: HTMLElement, text: string, highlightId: string, type: string, dispatcher: Dispatcher | undefined, win?: Window): number | undefined {
    if (this.hasHighlight(editableHost, highlightId)) return
    const blockText = highlightText.extractText(editableHost)

    const marker = `<span class="highlight-${type}"></span>`
    let winWindow: Window | undefined = win
    if (!winWindow) {
      const doc = editableHost.ownerDocument || (typeof document !== 'undefined' ? document : null)
      winWindow = doc?.defaultView || undefined
    }
    if (!winWindow) {
      winWindow = (typeof window !== 'undefined' && window.document ? window : undefined)
    }
    if (!winWindow) {
      throw new Error('Could not determine window object for highlightText')
    }
    const markerNode = highlightSupport.createMarkerNode(marker, type, winWindow)

    if (!markerNode) return undefined

    const matches = searchText(blockText, text, markerNode)

    if (matches && matches.length) {
      const match = matches[0] as ExtendedMatch
      if (highlightId) match.id = highlightId
      highlightText.highlightMatches(editableHost, matches)
      if (dispatcher) dispatcher.notify('change', editableHost)
      return match.startIndex
    }
    return undefined
  },

  // Used to highlight comments.
  // This function was changed to track matches when text is added to the start
  // of a component, but multiple white spaces break it in a strict sense
  // The function works in the editor and in browsers, but tests with
  // multiple white spaces will fail.
  // Browsers change the white spaces to &nbsp and the function works,
  // and the tests in highlight.spec.js have been updated to represent this.
  highlightRange (editableHost: HTMLElement, text: string, highlightId: string, startIndex: number, endIndex: number, dispatcher: Dispatcher | undefined, win?: Window, type: string = 'comment'): number {
    if (this.hasHighlight(editableHost, highlightId)) {
      this.removeHighlight(editableHost, highlightId, dispatcher)
    }

    const blockText = highlightText.extractText(editableHost, false)
    if (blockText === '') return -1 // the text was deleted so we can't highlight anything

    let winWindow: Window | undefined = win
    if (!winWindow) {
      const doc = editableHost.ownerDocument || (typeof document !== 'undefined' ? document : null)
      winWindow = doc?.defaultView || undefined
    }
    if (!winWindow) {
      winWindow = (typeof window !== 'undefined' && window.document ? window : undefined)
    }
    if (!winWindow) {
      throw new Error('Could not determine window object for highlightRange')
    }
    const marker = this.createMarkerNode(
      `<span class="highlight-${type}"></span>`,
      type,
      winWindow as Window
    )

    if (!marker) return -1

    const actualStartIndex = startIndex
    const actualEndIndex = endIndex

    highlightText.highlightMatches(editableHost, [{
      startIndex: actualStartIndex,
      endIndex: actualEndIndex,
      match: text.substring(actualStartIndex, actualEndIndex),
      id: highlightId,
      marker
    }], false)

    if (dispatcher) dispatcher.notify('change', editableHost)

    return actualStartIndex
  },

  updateHighlight (editableHost: HTMLElement, highlightId: string, addCssClass?: string, removeCssClass?: string): void {
    if (!document.documentElement.classList) return

    const elems = editableHost.querySelectorAll(`[data-word-id="${highlightId}"]`)
    for (const elem of Array.from(elems)) {
      if (removeCssClass) elem.classList.remove(removeCssClass)
      if (addCssClass) elem.classList.add(addCssClass)
    }
  },

  removeHighlight (editableHost: HTMLElement, highlightId: string, dispatcher?: Dispatcher): void {
    const elems = editableHost.querySelectorAll(`[data-word-id="${highlightId}"]`)
    for (const elem of Array.from(elems)) {
      content.unwrap(elem)
    }

    // remove empty text nodes, combine adjacent text nodes
    editableHost.normalize()

    if (dispatcher) dispatcher.notify('change', editableHost)
  },

  hasHighlight (editableHost: HTMLElement, highlightId: string): boolean {
    const matches = editableHost.querySelectorAll(`[data-word-id="${highlightId}"]`)
    return !!matches.length
  },

  extractHighlightedRanges (editableHost: HTMLElement, type?: string): Record<string, {start: number, end: number, text: string, nativeRange: Range}> | undefined {
    let findMarkersQuery = '[data-word-id]'
    if (type) findMarkersQuery += `[data-highlight="${type}"]`
    const markers = editableHost.querySelectorAll(findMarkersQuery)
    if (!markers.length) return undefined

    const groups: Record<string, NodeListOf<Element>> = {}
    for (const marker of Array.from(markers)) {
      const highlightId = marker.getAttribute('data-word-id')
      if (highlightId && !groups[highlightId]) {
        groups[highlightId] = editableHost.querySelectorAll(`[data-word-id="${highlightId}"]`)
      }
    }

    const res: Record<string, {start: number, end: number, text: string, nativeRange: Range}> = {}
    for (const highlightId in groups) {
      const position = this.extractMarkerNodePosition(editableHost, groups[highlightId])
      if (position) res[highlightId] = position
    }

    return res
  },

  extractMarkerNodePosition (editableHost: HTMLElement, markers: NodeListOf<Element>): {start: number, end: number, text: string, nativeRange: Range} | undefined {
    if (markers.length === 0) return undefined

    const range = createRange()
    if (markers.length > 1) {
      range.setStartBefore(markers[0])
      range.setEndAfter(markers[markers.length - 1])
    } else {
      range.selectNode(markers[0])
    }

    const textRange = toCharacterRange(range, editableHost)
    return {
      start: textRange.start,
      end: textRange.end,
      text: textRange.text, // browser range result (does whitespace normalization)
      nativeRange: range
    }
  },

  cleanupStaleMarkerNodes (editableHost: HTMLElement, highlightType: string): void {
    const nodes = editableHost.querySelectorAll(`span[data-highlight="${highlightType}"]`)
    for (const node of Array.from(nodes)) {
      if (!node.textContent || !node.textContent.length) {
        node.remove()
      }
    }
  },

  createMarkerNode (markerMarkup: string, highlightType: string, win?: Window): HTMLElement | null {
    let winWindow: Window | null = win || null
    if (!winWindow) {
      // Try to get window from global scope
      winWindow = (typeof window !== 'undefined' && window.document ? window : null) as Window | null
    }
    if (!winWindow || !winWindow.document) {
      throw new Error(`Window object with document is required. win: ${typeof win}, window: ${typeof window}`)
    }
    const marker = createElement(markerMarkup, winWindow)
    if (!marker) return null
    marker.setAttribute('data-editable', 'ui-unwrap')
    marker.setAttribute('data-highlight', highlightType)
    return marker
  }
}

export default highlightSupport

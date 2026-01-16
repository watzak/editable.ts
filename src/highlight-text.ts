import NodeIterator from './node-iterator.js'
import * as nodeType from './node-type.js'
import {createRange} from './util/dom.js'
import type {Match} from './plugins/highlighting/text-search.js'

interface ExtendedMatch extends Match {
  id?: string | number
  title?: string
}

interface Portion {
  element: Text
  text: string
  offset: number
  length: number
  isLastPortion: boolean
  wordId: string | number
}

export default {

  // Get the text from an editable block with a NodeIterator.
  // This must work the same as when later iterating over the text
  // in highlightMatches().
  extractText (element: HTMLElement, convertBRs: boolean = true): string {
    let text = ''
    getText(element, convertBRs, (part: string) => { text += part })
    return text
  },

  // Go through the element to highlight the matches while keeping the
  // existing html valid (highlighting a match may require inserting multiple
  // elements).
  //
  // @params
  // - matches
  //   Array of positions in the string to highlight:
  //   e.g [{
  //         startIndex: 0,
  //         endIndex: 1,
  //         match: 'The', // not used, only the indexes are used for highlighting)
  //         marker: DOMNode, // A clone of this element will be inserted
  //         id: 'a7382', // used in word-id attribute
  //         title: 'The World' // used in title attribute (optional)
  //       }]
  highlightMatches (element: HTMLElement, matches: ExtendedMatch[], countBRs: boolean = true): void {
    if (!matches || matches.length === 0) {
      return
    }

    element.normalize() // mend text nodes

    const iterator = new NodeIterator(element)
    let currentMatchIndex = 0
    let totalOffset = 0
    let currentMatch = matches[currentMatchIndex]
    let portions: Portion[] = []
    let next: Node | undefined
    let wordId: string | number = currentMatch.id || currentMatch.startIndex
    let textNode: Text | undefined
    while ((next = iterator.getNext())) {
      // Account for <br> elements
      if (next.nodeType === nodeType.textNode && (next as Text).data !== '') {
        textNode = next as Text
      } else if (countBRs && next.nodeType === nodeType.elementNode && (next as Element).nodeName === 'BR') {
        totalOffset += 1
        continue
      } else {
        continue
      }

      if (!textNode) continue

      const nodeText = textNode.data
      let nodeEndOffset = totalOffset + nodeText.length
      if (currentMatch.startIndex < nodeEndOffset && totalOffset < currentMatch.endIndex) {
        // get portion position (fist, last or in the middle)
        const isFirstPortion = totalOffset <= currentMatch.startIndex
        const isLastPortion = nodeEndOffset >= currentMatch.endIndex

        if (isFirstPortion) {
          wordId = currentMatch.id || currentMatch.startIndex
        }

        // calculate offset and length
        let offset: number
        if (isFirstPortion) {
          offset = currentMatch.startIndex - totalOffset
        } else {
          offset = 0
        }

        let length: number
        if (isLastPortion) {
          length = (currentMatch.endIndex - totalOffset) - offset
        } else {
          length = nodeText.length - offset
        }

        // create portion object
        const portion: Portion = {
          element: textNode,
          text: nodeText.substring(offset, offset + length),
          offset,
          length,
          isLastPortion,
          wordId
        }

        portions.push(portion)

        if (isLastPortion) {
          const lastNode = this.wrapMatch(portions, currentMatch.marker!, currentMatch.title)
          if (lastNode) {
            iterator.replaceCurrent(lastNode)

            // recalculate nodeEndOffset if we have to replace the current node.
            nodeEndOffset = totalOffset + portion.length + portion.offset

            portions = []
            currentMatchIndex += 1
            if (currentMatchIndex < matches.length) {
              currentMatch = matches[currentMatchIndex]
            }
          }
        }
      }

      totalOffset = nodeEndOffset
    }
  },

  // @return the last wrapped element
  wrapMatch (portions: Portion[], stencilElement: HTMLElement, title?: string): HTMLElement | undefined {
    return portions.map((portion) => this.wrapPortion(portion, stencilElement, title)).pop()
  },

  wrapPortion (portion: Portion, stencilElement: HTMLElement, title?: string): HTMLElement {
    const range = createRange()
    range.setStart(portion.element, portion.offset)
    range.setEnd(portion.element, portion.offset + portion.length)
    const node = stencilElement.cloneNode(true) as HTMLElement
    node.setAttribute('data-word-id', String(portion.wordId))
    if (title) node.setAttribute('title', title)
    range.surroundContents(node)

    // Fix a weird behaviour where an empty text node is inserted after the range
    if (node.nextSibling) {
      const next = node.nextSibling
      if (next.nodeType === nodeType.textNode && (next as Text).data === '') {
        next.remove()
      }
    }

    return node
  }

}

// Extract the text of an element.
// This has two notable behaviours:
// - It uses a NodeIterator which will skip elements
//   with data-editable="remove"
// - It returns a \n for <br> elements
//   (The only block level element allowed inside of editables)
function getText (element: HTMLElement, convertBRs: boolean, func: (text: string) => void): void {
  const iterator = new NodeIterator(element)
  let next: Node | undefined
  while ((next = iterator.getNext())) {
    if (next.nodeType === nodeType.textNode && (next as Text).data !== '') {
      func((next as Text).data)
    } else if (convertBRs && next.nodeType === nodeType.elementNode && (next as Element).nodeName === 'BR') {
      func('\n')
    }
  }
}

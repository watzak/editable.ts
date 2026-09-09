import NodeIterator from './node-iterator.js'
import * as nodeType from './node-type.js'
import * as content from './content.js'
import { OPERATION_LINE_BREAK } from './operation-types.js'

const ZERO_WIDTH_SPACE = /\u200B/g
const ZERO_WIDTH_NO_BREAK = /\uFEFF/g

/**
 * Plain-text view of a block host for operation diffing.
 * `<br>` maps to {@link OPERATION_LINE_BREAK}; internal zero-width helpers are stripped.
 */
export function getBlockOperationText(host: HTMLElement): string {
  const parts: string[] = []
  const iterator = new NodeIterator(host)
  let next: Node | undefined
  while ((next = iterator.getNext())) {
    if (next.nodeType === nodeType.textNode) {
      const data = (next as Text).data
      if (data === '') continue
      parts.push(stripInternalChars(data))
    } else if (next.nodeType === nodeType.elementNode && (next as Element).nodeName === 'BR') {
      parts.push(OPERATION_LINE_BREAK)
    }
  }
  return parts.join('')
}

export function stripInternalChars(text: string): string {
  return text.replace(ZERO_WIDTH_NO_BREAK, '').replace(ZERO_WIDTH_SPACE, '')
}

/** Converts sanitized paste HTML into operation plain text. */
export function htmlToOperationText(html: string, doc: Document): string {
  const fragment = content.createFragmentFromString(html, doc)
  const wrapper = doc.createElement('div')
  wrapper.appendChild(fragment)
  return getBlockOperationText(wrapper)
}

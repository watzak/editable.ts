import * as nodeType from './node-type.js'
import * as rangeSaveRestore from './range-save-restore.js'
import * as parser from './parser.js'
import * as string from './util/string.js'
import {createElement, createRange, getNodes, normalizeBoundaries, splitBoundaries, containsNodeText} from './util/dom.js'
import config from './config.js'

function restoreRange (host: HTMLElement, range: Range, func: () => void): Range | undefined {
  const savedRange = rangeSaveRestore.save(range)
  func()
  return rangeSaveRestore.restore(host, savedRange)
}

const zeroWidthSpace = /\u200B/g
const zeroWidthNonBreakingSpace = /\uFEFF/g
const whitespaceExceptSpace = /[^\S ]/g

const everythingWhitespace = /^\s+$/
const leadingWhitespace = /^\s+/
const trailingWhitespace = /\s+$/

// Clean up the Html.
export function tidyHtml (element: HTMLElement): void {
  // if (element.normalize) element.normalize()
  normalizeTags(element)
}

// Remove empty tags and merge consecutive tags (they must have the same
// attributes).
//
// @method normalizeTags
// @param  {HTMLElement} element The element to process.
export function normalizeTags (element: HTMLElement): void {
  const fragment = document.createDocumentFragment()

  // Remove line breaks at the beginning of a content block
  removeWhitespaces(element, 'firstChild')

  // Remove line breaks at the end of a content block
  removeWhitespaces(element, 'lastChild')

  const nodesToProcess = Array.from(element.childNodes)
  const processedIndices = new Set<number>()

  for (let i = 0; i < nodesToProcess.length; i++) {
    if (processedIndices.has(i)) continue
    
    const node = nodesToProcess[i]
    
    // skip empty tags, so they'll get removed
    if (node.nodeName !== 'BR' && !node.textContent) continue

    if (node.nodeType === nodeType.elementNode && node.nodeName !== 'BR') {
      // Create a merged node starting with this node
      const mergedNode = node.cloneNode(false) as HTMLElement
      
      // Copy children from the first node
      for (const child of Array.from(node.childNodes)) {
        mergedNode.appendChild(child.cloneNode(true))
      }
      
      // Merge consecutive same tags
      let j = i + 1
      while (j < nodesToProcess.length) {
        const sibling = nodesToProcess[j]
        if (!parser.isSameNode(sibling, node)) break
        
        // Copy children from the consecutive sibling
        for (const siblingChild of Array.from(sibling.childNodes)) {
          mergedNode.appendChild(siblingChild.cloneNode(true))
        }
        
        processedIndices.add(j)
        sibling.remove()
        j++
      }
      
      // Recursively normalize the merged node
      normalizeTags(mergedNode)
      
      fragment.appendChild(mergedNode)
    } else {
      fragment.appendChild(node.cloneNode(true))
    }
  }

  while (element.firstChild) element.removeChild(element.firstChild)

  element.appendChild(fragment)
}

export function normalizeWhitespace (text: string): string {
  return text.replace(whitespaceExceptSpace, ' ')
}

// Clean the element from character, tags, etc... added by the plugin logic.
//
// @method cleanInternals
// @param  {HTMLElement} element The element to process.
export function cleanInternals (element: HTMLElement): void {
  // Uses extract content for simplicity. A custom method
  // that does not clone the element could be faster if needed.
  element.innerHTML = extractContent(element, true)
}

// Extracts the content from a host element.
// Does not touch or change the host. Just returns
// the content and removes elements marked for removal by editable.
//
// @param {DOM node or document fragment} Element where to clean out the innerHTML.
// If you pass a document fragment it will be empty after this call.
// @param {Boolean} Flag whether to keep ui elements like spellchecking highlights.
// @returns {String} The cleaned innerHTML of the passed element or document fragment.
export function extractContent (element: HTMLElement | DocumentFragment | null | undefined, keepUiElements?: boolean): string {
  if (!element) return ''
  const innerHtml = (element.nodeType === nodeType.documentFragmentNode
    ? getInnerHtmlOfFragment(element as DocumentFragment)
    : (element as HTMLElement).innerHTML
  )
    .replace(zeroWidthNonBreakingSpace, '') // Used for forcing inline elements to have a height
    .replace(zeroWidthSpace, '<br>') // Used for cross-browser newlines

  const clone = document.createElement('div')
  clone.innerHTML = innerHtml
  unwrapInternalNodes(clone, keepUiElements)

  // Remove line breaks at the beginning of a content block
  removeWhitespaces(clone, 'firstChild')

  // Remove line breaks at the end of a content block
  removeWhitespaces(clone, 'lastChild')

  return clone.innerHTML
}

export function getInnerHtmlOfFragment (documentFragment: DocumentFragment | null | undefined): string {
  if (!documentFragment || !documentFragment.childNodes) {
    return ''
  }
  const div = document.createElement('div')
  // JSDOM doesn't support appendChild with DocumentFragment directly
  // Clone and append each child instead
  const children = Array.from(documentFragment.childNodes)
  for (const child of children) {
    div.appendChild(child.cloneNode(true))
  }
  return div.innerHTML
}

// Create a document fragment from an html string
// @param {String} e.g. 'some html <span>text</span>.'
export function createFragmentFromString (htmlString: string): DocumentFragment {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = htmlString

  const fragment = document.createDocumentFragment()
  while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild)
  return fragment
}

export function adoptElement (node: Node | string, doc: Document): HTMLElement {
  if (typeof node === 'string') {
    // If node is a string (selector), query for it
    const element = doc.querySelector(node)
    if (!element) throw new Error(`Element not found: ${node}`)
    return element as HTMLElement
  }
  if (node.ownerDocument !== doc) {
    return doc.adoptNode(node) as HTMLElement
  }
  return node as HTMLElement
}

// It will return a fragment with the cloned contents of the range
// without the commonAncestorElement.
//
// @param {Range}
// @return {DocumentFragment}
export function cloneRangeContents (range: Range): DocumentFragment {
  const rangeFragment = range.cloneContents()
  const parent = rangeFragment.childNodes[0]
  const fragment = document.createDocumentFragment()
  while (parent.childNodes.length) fragment.appendChild(parent.childNodes[0])
  return fragment
}

function removeWhitespaces (node: HTMLElement, type: 'firstChild' | 'lastChild', firstCall = true): void {
  let elem
  // loop through all children:
  // from left to right if type = 'firstChild',
  // from right to left if type = 'lastChild'
  while ((elem = node[type])) {
    if (elem.nodeType === nodeType.textNode) {
      // Just remove text nodes if they consist only of whitespace
      if (elem.textContent && everythingWhitespace.test(elem.textContent)) node.removeChild(elem)
      else break
    } else if (elem.nodeName === 'BR') {
      elem.remove()
    } else {
      // For element nodes (e.g. <strong> tags), we repeat the logic recursively
      // to remove empty text nodes or <br> tags.
      if ((elem as HTMLElement)[type]) removeWhitespaces(elem as HTMLElement, type, false)
      break
    }
  }

  // Text nodes with leading/trailing whitespace can be trimmed if config allows.
  // We only do it to the outermost text node. Once a text was wrapped in
  // another element, we preserve the whitespace.
  if (!firstCall) return
  elem = node[type]
  if (elem?.nodeType !== nodeType.textNode) return
  // Remove whitespaces at the end or start of a block with content
  //   e.g. '  Hello world' > 'Hello World'
  if (config.trimLeadingAndTrailingWhitespaces && elem.textContent) {
    elem.textContent = elem.textContent.replace(type.startsWith('last') ? trailingWhitespace : leadingWhitespace, '')
  }
}

// Remove elements that were inserted for internal or user interface purposes
//
// @param {DOM node}
// @param {Boolean} whether to keep ui elements like spellchecking highlights
// Currently:
// - Saved ranges
export function unwrapInternalNodes (sibling: Node | null, keepUiElements?: boolean): void {
  while (sibling) {
    const nextSibling = sibling.nextSibling

    if (sibling.nodeType !== nodeType.elementNode) {
      sibling = nextSibling
      continue
    }

    const elem = sibling as Element
    const attr = elem.getAttribute('data-editable')

    if (elem.firstChild) unwrapInternalNodes(elem.firstChild, keepUiElements)

    if (attr === 'remove' || (attr === 'ui-remove' && !keepUiElements)) {
      elem.remove()
    } else if (attr === 'unwrap' || (attr === 'ui-unwrap' && !keepUiElements)) {
      unwrap(elem as HTMLElement)
    }

    sibling = nextSibling
  }
}

// Get all tags that start or end inside the range
export function getTags (host: HTMLElement, range: Range, filterFunc?: ((node: Node) => boolean) | null): Node[] {
  const innerTags = getInnerTags(range, filterFunc)
  const ancestorTags = getAncestorTags(host, range, filterFunc)
  return innerTags.concat(ancestorTags)
}

// Get all ancestor tags that start or end inside the range
export function getAncestorTags (host: HTMLElement, range: Range, filterFunc?: ((node: Node) => boolean) | null): Node[] {
  const tags: Node[] = []
  let node: Node | null = range.commonAncestorContainer
  while (node && node !== host) {
    if (!filterFunc || filterFunc(node)) tags.push(node)
    node = node.parentNode
  }

  return tags
}

export function getTagsByName (host: HTMLElement, range: Range, tagName: string): Node[] {
  return getTags(host, range, (node) => {
    return node.nodeName.toUpperCase() === tagName.toUpperCase()
  })
}

export function getTagsByNameAndAttributes (host: HTMLElement, range: Range, elem: HTMLElement): Node[] {
  return getTags(host, range, (node) => {
    return node.nodeName.toUpperCase() === elem.nodeName.toUpperCase() &&
      node.nodeType === nodeType.elementNode &&
      areSameAttributes((node as Element).attributes, elem.attributes)
  })
}

export function areSameAttributes (attrs1: NamedNodeMap, attrs2: NamedNodeMap): boolean {
  if (attrs1.length !== attrs2.length) return false

  for (let i = 0; i < attrs1.length; i++) {
    const attr1 = attrs1[i]
    const attr2 = attrs2.getNamedItem(attr1.name)
    if (!attr2 || attr2.value !== attr1.value) return false
  }

  return true
}

// Get all tags that start or end inside the range
export function getInnerTags (range: Range, filterFunc?: ((node: Node) => boolean) | null): Node[] {
  return getNodes(range, [nodeType.elementNode], filterFunc)
}

// Get all tags whose text is completely within the current selection.
export function getContainedTags (range: Range, filterFunc?: ((node: Node) => boolean) | null): Node[] {
  return getNodes(range, [nodeType.elementNode], filterFunc)
    .filter(elem => containsNodeText(range, elem))
}

// Transform an array of elements into an array
// of tagnames in uppercase
//
// @return example: ['STRONG', 'B']
export function getTagNames (elements: Node[] = []): string[] {
  return elements.map((element: Node) => element.nodeName)
}

export function isAffectedBy (host: HTMLElement, range: Range, tagName: string): boolean {
  return getTags(host, range, null)
    .some((elem) => elem.nodeName === tagName.toUpperCase())
}

// select a whole element
export function selectNodeContents (element: HTMLElement): Range {
  const range = createRange()
  range.selectNodeContents(element)
  return range
}

function intersectsRange (range1: Range, range2: Range): boolean {
  return range1.compareBoundaryPoints(Range.END_TO_START, range2) === -1 &&
    range2.compareBoundaryPoints(Range.END_TO_START, range1) === -1
}

// Check if the range selects all of the elements contents,
// not less or more.
//
// @param visible: Only compare visible text. That way it does not
//   matter if the user selects an additional whitespace or not.
export function isExactSelection (range: Range, elem: HTMLElement | any, visible?: boolean): boolean {
  const elemRange = createRange()
  elemRange.selectNodeContents(elem)

  if (!intersectsRange(range, elemRange)) return false

  let rangeText = range.toString()
  let elemText = (elem.jquery ? elem[0] : elem).textContent

  if (visible) {
    rangeText = string.trim(rangeText)
    elemText = string.trim(elemText)
  }

  return rangeText !== '' && rangeText === elemText
}

export function expandTo (host: HTMLElement, range: Range, elem: HTMLElement): Range {
  range.selectNodeContents(elem)
  return range
}

export function toggleTag (host: HTMLElement, range: Range, elem: HTMLElement): Range {
  const elems = getTagsByNameAndAttributes(host, range, elem)

  if (elems.length === 1 &&
    elems[0].nodeType === nodeType.elementNode &&
    isExactSelection(range, elems[0] as HTMLElement, true)) {
    const result = removeFormattingElem(host, range, elem)
    if (!result) return range
    return result
  }

  return forceWrap(host, range, elem)
}

export function isWrappable (range: Range): boolean {
  return canSurroundContents(range)
}

export function forceWrap (host: HTMLElement, range: Range, elem: HTMLElement): Range {
  let restoredRange = restoreRange(host, range, () => {
    nukeElem(host, range, elem)
  })

  // remove all tags if the range is not wrappable
  if (!restoredRange || !isWrappable(restoredRange)) {
    if (!restoredRange) return range
    restoredRange = restoreRange(host, restoredRange, () => {
      nuke(host, restoredRange!, null)
    })
    if (!restoredRange) return range
  }

  wrap(restoredRange, elem)
  return restoredRange
}

export function wrap (range: Range, elem: HTMLElement | string): void {
  if (!isWrappable(range)) {
    console.log('content.wrap(): can not surround range')
    return
  }

  let element: HTMLElement | null
  if (typeof elem === 'string') {
    element = createElement(elem)
    if (!element) {
      console.log('content.wrap(): could not create element')
      return
    }
  } else {
    element = elem
  }
  range.surroundContents(element)
}

export function unwrap (elem: HTMLElement | any): void {
  elem = (elem as any).jquery ? (elem as any)[0] : elem
  const parent = elem.parentNode
  if (!parent) return
  while (elem.firstChild) parent.insertBefore(elem.firstChild, elem)
  parent.removeChild(elem)
}

export function removeFormattingElem (host: HTMLElement, range: Range, elem: HTMLElement): Range | undefined {
  return restoreRange(host, range, () => {
    nukeElem(host, range, elem)
  })
}

export function removeFormatting (host: HTMLElement, range: Range, selector: string | null): Range | undefined {
  return restoreRange(host, range, () => {
    nuke(host, range, selector)
  })
}

// Unwrap all tags this range is affected by.
// Can also affect content outside of the range.
export function nuke (host: HTMLElement, range: Range, selector: string | null): void {
  getTags(host, range, null).forEach((elem) => {
    if (elem.nodeName.toUpperCase() !== 'BR' && (!selector || (elem as Element).matches(selector))) {
      unwrap(elem as HTMLElement)
    }
  })
}

// Unwrap all tags this range is affected by.
// Can also affect content outside of the range.
export function nukeElem (host: HTMLElement, range: Range, node: HTMLElement | null): void {
  getTags(host, range, null).forEach((elem) => {
    if (elem.nodeName.toUpperCase() !== 'BR' && (!node ||
        (elem.nodeName.toUpperCase() === node.nodeName.toUpperCase() &&
          areSameAttributes((elem as Element).attributes, node.attributes)))) {
      unwrap(elem as HTMLElement)
    }
  })
}

// Insert a single character (or string) before or after
// the range.
export function insertCharacter (range: Range, character: string, atStart: boolean): void {
  const insertEl = document.createTextNode(character)
  const boundaryRange = range.cloneRange()
  boundaryRange.collapse(atStart)
  boundaryRange.insertNode(insertEl)
  range[atStart ? 'setStartBefore' : 'setEndAfter'](insertEl)
  normalizeBoundaries(range)
}

// Surround the range with characters like start and end quotes.
//
// @method surround
export function surround (host: HTMLElement, range: Range, startCharacter: string, endCharacter?: string): Range {
  insertCharacter(range, endCharacter || startCharacter, false)
  insertCharacter(range, startCharacter, true)
  return range
}

// Removes a character from the text within a range.
//
// @method deleteCharacter
export function deleteCharacter (host: HTMLElement, range: Range, character: string): Range {
  if (!containsString(range, character)) return range

  // check for selection.rangeCount > 0 ?
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) splitBoundaries(range)
  const restoredRange = restoreRange(host, range, () => {
    getNodes(range, [nodeType.textNode], (node: Node) => {
      return (node as Text).nodeValue !== null && (node as Text).nodeValue!.indexOf(character) >= 0
    })
      .forEach((node) => {
        const textNode = node as Text
        if (textNode.nodeValue) {
          // Use replace with global regex instead of replaceAll for better compatibility
          textNode.nodeValue = textNode.nodeValue.replace(new RegExp(character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
        }
      })
  })

  if (restoredRange) {
    normalizeBoundaries(restoredRange)
    return restoredRange
  }
  return range
}

export function containsString (range: Range, str: string): boolean {
  return range.toString().indexOf(str) >= 0
}

// Unwrap all tags this range is affected by.
// Can also affect content outside of the range.
export function nukeTag (host: HTMLElement, range: Range, tagName: string): void {
  getTags(host, range, null).forEach((elem) => {
    if (elem.nodeName.toUpperCase() === tagName.toUpperCase()) unwrap(elem as HTMLElement)
  })
}

function createNodeIterator (root: Node, filter: ((node: Node) => boolean) | null): {next: () => Node | null} {
  let currentNode: Node | null = root
  let previousNode: Node | null = null

  function nextNode () {
    if (!currentNode) {
      return null
    }

    if (currentNode.firstChild && previousNode !== currentNode.firstChild) {
      previousNode = currentNode
      currentNode = currentNode.firstChild
    } else if (currentNode.nextSibling) {
      previousNode = currentNode
      currentNode = currentNode.nextSibling
    } else {
      let parent = currentNode.parentNode
      while (parent && parent !== root) {
        if (parent.nextSibling) {
          previousNode = currentNode = parent.nextSibling
          break
        }
        parent = parent.parentNode
      }
      if (!parent || parent === root) {
        previousNode = currentNode = null
      }
    }

    return currentNode
  }

  return {
    next: nextNode
  }
}

function isNodeFullyContained (node: Node, range: Range): boolean {
  const nodeRange = document.createRange()
  nodeRange.selectNodeContents(node)
  return range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
         range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0
}

function canSurroundContents (range: Range): boolean {
  if (!range || !range.startContainer || !range.endContainer) {
    return false
  }

  if (range.startContainer === range.endContainer) return true

  // Create a custom node iterator for the common ancestor container
  const iterator = createNodeIterator(range.commonAncestorContainer, function (node) {
    return range.isPointInRange(node, 0)
  })

  let currentNode
  let boundariesInvalid = false

  while ((currentNode = iterator.next())) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      if (!isNodeFullyContained(currentNode, range)) {
        boundariesInvalid = true
        break
      }
    }
  }

  return !boundariesInvalid
}

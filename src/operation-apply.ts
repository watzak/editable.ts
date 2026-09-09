import { createOperationRange } from './operation-offset.js'
import { transformSelectionThroughBatch } from './operation-selection-transform.js'
import { validateOperationBatch, OperationValidationError } from './operation-validate.js'
import { setSelectionFromSnapshot } from './operation-selection.js'
import { OPERATION_LINE_BREAK } from './operation-types.js'
import { defaultInlineFormatRegistry } from './yjs/inline-format-codec.js'
import { normalizeRelForBlankTarget, sanitizeUrlAttribute } from './url-security.js'
import type {
  EditableOperation,
  EditableOperationBatch,
  JsonValue,
  TextAttributes
} from './operation-types.js'
import type { SelectionSnapshot } from './operation-types.js'

export interface ApplyOperationsOptions {
  origin?: EditableOperationBatch['origin']
  preserveSelection?: boolean
  emitChange?: boolean
}

export interface ApplyOperationsResult {
  applied: boolean
  queued?: boolean
}

function textToInsertFragment(
  doc: Document,
  text: string,
  attributes?: TextAttributes
): DocumentFragment {
  const parts = text.split(OPERATION_LINE_BREAK)
  const fragment = doc.createDocumentFragment()

  parts.forEach((part, index) => {
    if (part) {
      appendStyledText(doc, fragment, part, attributes)
    }
    if (index < parts.length - 1) {
      fragment.appendChild(doc.createElement('br'))
    }
  })

  return fragment
}

function appendStyledText(
  doc: Document,
  parent: DocumentFragment | HTMLElement,
  text: string,
  attributes?: TextAttributes
): void {
  parent.appendChild(defaultInlineFormatRegistry.wrapStyledText(doc, text, attributes))
}

function applyBooleanFormat(
  host: HTMLElement,
  index: number,
  length: number,
  tagNames: string[],
  value: JsonValue | null | undefined
): void {
  if (value === undefined) return
  const range = createOperationRange(host, index, index + length)
  const doc = host.ownerDocument!

  if (value === null) {
    for (const tag of tagNames) unwrapTagInRange(range, tag.toUpperCase())
    return
  }
  if (value !== true) return

  const wrapper = doc.createElement(tagNames[0])
  try {
    range.surroundContents(wrapper)
  } catch {
    const extracted = range.extractContents()
    wrapper.appendChild(extracted)
    range.insertNode(wrapper)
  }
}

function applyLinkFormat(
  host: HTMLElement,
  index: number,
  length: number,
  value: JsonValue | null | undefined
): void {
  if (value === undefined) return
  const range = createOperationRange(host, index, index + length)
  const doc = host.ownerDocument!

  if (value === null) {
    unwrapTagInRange(range, 'A')
    unwrapAncestorTagInRange(range, 'A')
    return
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return
  const hrefValue = value.href
  if (typeof hrefValue !== 'string') return

  const href = sanitizeUrlAttribute(hrefValue, doc)
  if (!href) return

  unwrapTagInRange(range, 'A')
  const updatedRange = createOperationRange(host, index, index + length)

  const anchor = doc.createElement('a')
  anchor.setAttribute('href', href)
  if (value.target === '_blank') {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute(
      'rel',
      typeof value.rel === 'string'
        ? normalizeRelForBlankTarget(value.rel)
        : normalizeRelForBlankTarget(undefined)
    )
  } else if (typeof value.rel === 'string' && value.rel) {
    anchor.setAttribute('rel', value.rel)
  }

  try {
    updatedRange.surroundContents(anchor)
  } catch {
    const extracted = updatedRange.extractContents()
    anchor.appendChild(extracted)
    updatedRange.insertNode(anchor)
  }
}

function applySetTextAttributes(
  host: HTMLElement,
  index: number,
  length: number,
  attributes: TextAttributes
): void {
  if (length === 0) return

  applyBooleanFormat(host, index, length, ['strong', 'b'], attributes.bold)
  applyBooleanFormat(host, index, length, ['em', 'i'], attributes.italic)
  applyBooleanFormat(host, index, length, ['u'], attributes.underline)
  applyLinkFormat(host, index, length, attributes.link)
}

function unwrapTagInRange(range: Range, tagName: string): void {
  const doc = range.commonAncestorContainer.ownerDocument
  if (!doc) return
  const container = range.cloneContents()
  const wrapper = doc.createElement('div')
  wrapper.appendChild(container)
  wrapper.querySelectorAll(tagName.toLowerCase()).forEach((el) => {
    while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el)
    el.remove()
  })
  range.deleteContents()
  while (wrapper.firstChild) range.insertNode(wrapper.firstChild)
}

function unwrapAncestorTagInRange(range: Range, tagName: string): void {
  const host = range.commonAncestorContainer
  const root = host.nodeType === Node.ELEMENT_NODE ? (host as Element) : host.parentElement
  if (!root) return

  const upperTag = tagName.toUpperCase()
  let node: Node | null = range.startContainer
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode

  const anchors: Element[] = []
  while (node && node !== root.parentNode) {
    if (node.nodeName === upperTag) anchors.push(node as Element)
    node = node.parentNode
  }

  for (const anchor of anchors) {
    while (anchor.firstChild) anchor.parentNode?.insertBefore(anchor.firstChild, anchor)
    anchor.remove()
  }
}

function applySingleOperation(
  host: HTMLElement,
  op: EditableOperation,
  appliedIndex: number
): void {
  const doc = host.ownerDocument!

  switch (op.type) {
    case 'insertText': {
      const range = createOperationRange(host, appliedIndex, appliedIndex)
      const fragment = textToInsertFragment(doc, op.text, op.attributes)
      range.insertNode(fragment)
      break
    }
    case 'deleteText': {
      const range = createOperationRange(host, appliedIndex, appliedIndex + op.length)
      range.deleteContents()
      break
    }
    case 'replaceText': {
      const range = createOperationRange(host, appliedIndex, appliedIndex + op.length)
      range.deleteContents()
      const fragment = textToInsertFragment(doc, op.text, op.attributes)
      range.insertNode(fragment)
      break
    }
    case 'setTextAttributes':
      applySetTextAttributes(host, appliedIndex, op.length, op.attributes)
      break
  }

  host.normalize()
}

/**
 * Applies operations sequentially at face-value indices against the evolving DOM.
 * Used for Y.Text deltas where each step targets the current document state.
 */
export function applyLiveOperationBatchToDom(
  host: HTMLElement,
  batch: EditableOperationBatch,
  options: {
    preserveSelection?: boolean
    selectionBefore?: SelectionSnapshot
  } = {}
): void {
  for (const op of batch.operations) {
    applySingleOperation(host, op, op.index)
  }

  const targetSelection =
    batch.selectionAfter ??
    (options.selectionBefore
      ? transformSelectionThroughBatch(options.selectionBefore, batch.operations)
      : undefined)

  if (options.preserveSelection !== false && targetSelection) {
    setSelectionFromSnapshot(host, targetSelection)
  }
}

export function applyOperationBatchToDom(
  host: HTMLElement,
  batch: EditableOperationBatch,
  options: {
    preserveSelection?: boolean
    selectionBefore?: SelectionSnapshot
  } = {}
): void {
  validateOperationBatch(host, batch)

  let delta = 0
  for (const op of batch.operations) {
    const appliedIndex = op.index + delta
    applySingleOperation(host, op, appliedIndex)

    switch (op.type) {
      case 'insertText':
        delta += op.text.length
        break
      case 'deleteText':
        delta -= op.length
        break
      case 'replaceText':
        delta += op.text.length - op.length
        break
      default:
        break
    }
  }

  const targetSelection =
    batch.selectionAfter ??
    (options.selectionBefore
      ? transformSelectionThroughBatch(options.selectionBefore, batch.operations)
      : undefined)

  if (options.preserveSelection !== false && targetSelection) {
    setSelectionFromSnapshot(host, targetSelection)
  }
}

export { OperationValidationError }

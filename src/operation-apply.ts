import * as content from './content.js'
import { createOperationRange } from './operation-offset.js'
import { transformSelectionThroughBatch } from './operation-selection-transform.js'
import { validateOperationBatch, OperationValidationError } from './operation-validate.js'
import { setSelectionFromSnapshot } from './operation-selection.js'
import { OPERATION_LINE_BREAK } from './operation-types.js'
import type {
  EditableOperation,
  EditableOperationBatch,
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
  if (!attributes || Object.keys(attributes).length === 0) {
    parent.appendChild(doc.createTextNode(text))
    return
  }

  let node: Node = doc.createTextNode(text)
  if (attributes.bold === true) {
    const strong = doc.createElement('strong')
    strong.appendChild(node)
    node = strong
  }
  if (attributes.italic === true) {
    const em = doc.createElement('em')
    em.appendChild(node)
    node = em
  }
  parent.appendChild(node)
}

function applySetTextAttributes(
  host: HTMLElement,
  index: number,
  length: number,
  attributes: TextAttributes
): void {
  if (length === 0) return
  const range = createOperationRange(host, index, index + length)
  const doc = host.ownerDocument!

  if (attributes.bold === true) {
    const strong = doc.createElement('strong')
    try {
      range.surroundContents(strong)
    } catch {
      const extracted = range.extractContents()
      strong.appendChild(extracted)
      range.insertNode(strong)
    }
  }

  if (attributes.bold === null) {
    unwrapTagInRange(range, 'STRONG')
  }
  if (attributes.italic === true) {
    const em = doc.createElement('em')
    try {
      range.surroundContents(em)
    } catch {
      const extracted = range.extractContents()
      em.appendChild(extracted)
      range.insertNode(em)
    }
  }
  if (attributes.italic === null) {
    unwrapTagInRange(range, 'EM')
  }
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
  content.tidyHtml(host)
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

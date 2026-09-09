import { isPlainTextBlock } from './block.js'
import {
  filterAttributesForHost,
  getHostPolicy,
  isFormatAllowed,
  validateHostTextLength
} from './host-policy.js'
import { getOperationTextLength } from './operation-offset.js'
import { OPERATION_LINE_BREAK } from './operation-types.js'
import type {
  EditableOperation,
  EditableOperationBatch,
  TextAttributes
} from './operation-types.js'

export class OperationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OperationValidationError'
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new OperationValidationError(`${label} must be a non-negative integer`)
  }
}

function validateAttributes(host: HTMLElement, attributes: TextAttributes | undefined): void {
  if (!attributes) return
  const doc = host.ownerDocument
  if (!doc) return

  for (const key of Object.keys(attributes)) {
    if (!isFormatAllowed(host, key)) {
      throw new OperationValidationError(`Format "${key}" is not allowed on this host`)
    }
  }

  const filtered = filterAttributesForHost(host, attributes, doc)
  for (const key of Object.keys(attributes)) {
    if (attributes[key] === null) continue
    if (filtered[key] === undefined) {
      throw new OperationValidationError(
        `Format "${key}" was rejected by host policy or sanitization`
      )
    }
  }
}

function validateOperation(
  host: HTMLElement,
  op: EditableOperation,
  textLength: number,
  plainText: boolean
): number {
  const policy = getHostPolicy(host)

  switch (op.type) {
    case 'insertText': {
      assertNonNegativeInteger(op.index, 'insertText.index')
      if (op.index > textLength) {
        throw new OperationValidationError(
          `insertText.index ${op.index} exceeds text length ${textLength}`
        )
      }
      if (typeof op.text !== 'string') {
        throw new OperationValidationError('insertText.text must be a string')
      }
      if (op.attributes && plainText) {
        throw new OperationValidationError(
          'insertText.attributes are not allowed on plain-text hosts'
        )
      }
      if (op.attributes) validateAttributes(host, op.attributes)
      if (!policy.allowLineBreaks && op.text.includes(OPERATION_LINE_BREAK)) {
        throw new OperationValidationError('Line breaks are not allowed on this host')
      }
      return op.text.length
    }
    case 'deleteText': {
      assertNonNegativeInteger(op.index, 'deleteText.index')
      assertNonNegativeInteger(op.length, 'deleteText.length')
      if (op.index + op.length > textLength) {
        throw new OperationValidationError(
          `deleteText range ${op.index}..${op.index + op.length} exceeds text length ${textLength}`
        )
      }
      return -op.length
    }
    case 'replaceText': {
      assertNonNegativeInteger(op.index, 'replaceText.index')
      assertNonNegativeInteger(op.length, 'replaceText.length')
      if (op.index + op.length > textLength) {
        throw new OperationValidationError(
          `replaceText range ${op.index}..${op.index + op.length} exceeds text length ${textLength}`
        )
      }
      if (typeof op.text !== 'string') {
        throw new OperationValidationError('replaceText.text must be a string')
      }
      if (op.attributes && plainText) {
        throw new OperationValidationError(
          'replaceText.attributes are not allowed on plain-text hosts'
        )
      }
      if (op.attributes) validateAttributes(host, op.attributes)
      if (!policy.allowLineBreaks && op.text.includes(OPERATION_LINE_BREAK)) {
        throw new OperationValidationError('Line breaks are not allowed on this host')
      }
      return op.text.length - op.length
    }
    case 'setTextAttributes': {
      assertNonNegativeInteger(op.index, 'setTextAttributes.index')
      assertNonNegativeInteger(op.length, 'setTextAttributes.length')
      if (plainText) {
        throw new OperationValidationError('setTextAttributes is not allowed on plain-text hosts')
      }
      if (op.index + op.length > textLength) {
        throw new OperationValidationError(
          `setTextAttributes range ${op.index}..${op.index + op.length} exceeds text length ${textLength}`
        )
      }
      validateAttributes(host, op.attributes)
      return 0
    }
    default:
      throw new OperationValidationError(`Unknown operation type`)
  }
}

/** Validates the full batch against the current host text length without mutating DOM. */
export function validateOperationBatch(host: HTMLElement, batch: EditableOperationBatch): void {
  if (!batch.operations.length) {
    throw new OperationValidationError('Operation batch must contain at least one operation')
  }

  const plainText = isPlainTextBlock(host)
  const policy = getHostPolicy(host)
  let textLength = getOperationTextLength(host)
  let delta = 0

  for (const op of batch.operations) {
    const appliedIndex = op.index + delta
    const normalized = { ...op, index: appliedIndex } as EditableOperation
    const change = validateOperation(host, normalized, textLength, plainText)
    delta += change
    textLength += change
  }

  if (policy.maxLength !== undefined) {
    const validation = validateHostTextLength(policy, textLength)
    if (!validation.valid) {
      const issue = validation.errors.find((entry) => entry.code === 'too-long')
      throw new OperationValidationError(
        `Operation batch would exceed maxLength ${issue?.limit ?? policy.maxLength}`
      )
    }
  }

  for (const op of batch.operations) {
    if (op.type === 'insertText' || op.type === 'replaceText') {
      if (op.text.includes('\r')) {
        throw new OperationValidationError('Operation text must not contain \\r')
      }
    }
  }
}

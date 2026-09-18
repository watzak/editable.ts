import type * as Y from 'yjs'
import { PlainTextYjsError } from './plain-text-yjs-error.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'
import { buildInsertFormatMap } from './dom-to-ytext.js'
import type { EditableOperation, TextAttributes } from '../operation-types.js'

export interface ApplyOperationsToYTextOptions {
  registry?: InlineFormatRegistry
  doc?: Document
  richText?: boolean
}

function formatMapForInsert(
  attributes: TextAttributes | undefined,
  activeKeys: readonly string[],
  doc: Document,
  registry: InlineFormatRegistry,
  richText: boolean
): Record<string, unknown> | undefined {
  if (!richText) return undefined
  const format = buildInsertFormatMap(attributes ?? {}, activeKeys, registry, doc)
  return Object.keys(format).length > 0 ? format : undefined
}

function formatMapForMutation(
  attributes: TextAttributes,
  doc: Document,
  registry: InlineFormatRegistry
): Record<string, unknown> {
  return registry.toYTextFormatMap(attributes, doc)
}

/**
 * Validates operations against current {@link Y.Text} length using the same cumulative
 * index + delta semantics as {@link validateOperationBatch} (see docs/OPERATION_CONTRACT.md).
 * Does not mutate CRDT state.
 */
export function validateEditableOperationsForYText(
  yText: Y.Text,
  operations: readonly EditableOperation[],
  options: ApplyOperationsToYTextOptions = {}
): void {
  const richText = options.richText ?? false
  const registry = options.registry ?? defaultInlineFormatRegistry
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : undefined)

  if (richText && !doc) {
    throw new PlainTextYjsError(
      'Rich-text Yjs validation requires a Document for attribute sanitization'
    )
  }

  let textLength = yText.length
  let delta = 0

  for (const op of operations) {
    const appliedIndex = op.index + delta

    switch (op.type) {
      case 'insertText': {
        if (!Number.isInteger(appliedIndex) || appliedIndex < 0 || appliedIndex > textLength) {
          throw new PlainTextYjsError(
            `insertText.index ${appliedIndex} exceeds Y.Text length ${textLength}`
          )
        }
        if (richText && op.attributes && Object.keys(op.attributes).length > 0 && doc) {
          const format = buildInsertFormatMap(op.attributes, [], registry, doc)
          if (Object.keys(format).length === 0 && Object.keys(op.attributes).length > 0) {
            throw new PlainTextYjsError(
              'Rich-text Yjs validation rejected insertText.attributes after sanitization'
            )
          }
        }
        delta += op.text.length
        textLength += op.text.length
        break
      }
      case 'deleteText': {
        if (appliedIndex + op.length > textLength) {
          throw new PlainTextYjsError(`deleteText range exceeds Y.Text length ${textLength}`)
        }
        delta -= op.length
        textLength -= op.length
        break
      }
      case 'replaceText': {
        if (appliedIndex + op.length > textLength) {
          throw new PlainTextYjsError(`replaceText range exceeds Y.Text length ${textLength}`)
        }
        if (richText && op.attributes && Object.keys(op.attributes).length > 0 && doc) {
          const format = buildInsertFormatMap(op.attributes, [], registry, doc)
          if (Object.keys(format).length === 0) {
            throw new PlainTextYjsError(
              'Rich-text Yjs validation rejected replaceText.attributes after sanitization'
            )
          }
        }
        const change = op.text.length - op.length
        delta += change
        textLength += change
        break
      }
      case 'setTextAttributes': {
        if (!richText) {
          throw new PlainTextYjsError(
            'Plain-text Yjs binding cannot apply setTextAttributes to Y.Text'
          )
        }
        if (appliedIndex + op.length > textLength) {
          throw new PlainTextYjsError(`setTextAttributes range exceeds Y.Text length ${textLength}`)
        }
        if (op.length > 0 && doc) {
          const format = formatMapForMutation(op.attributes, doc, registry)
          if (Object.keys(format).length === 0 && Object.keys(op.attributes).length > 0) {
            throw new PlainTextYjsError(
              'Rich-text Yjs validation rejected setTextAttributes after sanitization'
            )
          }
        }
        break
      }
      default:
        throw new PlainTextYjsError(`Unknown operation type for Y.Text validation`)
    }
  }
}

/** Applies a confirmed operation batch to {@link Y.Text} using UTF-16 index semantics. */
export function applyEditableOperationsToYText(
  yText: Y.Text,
  operations: readonly EditableOperation[],
  options: ApplyOperationsToYTextOptions = {}
): void {
  const richText = options.richText ?? false
  const registry = options.registry ?? defaultInlineFormatRegistry
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : undefined)

  if (richText && !doc) {
    throw new PlainTextYjsError(
      'Rich-text Yjs apply requires a Document for attribute sanitization'
    )
  }

  validateEditableOperationsForYText(yText, operations, options)

  let delta = 0
  let activeKeys: string[] = []

  for (const op of operations) {
    const appliedIndex = op.index + delta

    switch (op.type) {
      case 'insertText': {
        const format = doc
          ? formatMapForInsert(op.attributes, activeKeys, doc, registry, richText)
          : undefined
        if (format && Object.keys(format).length > 0) {
          yText.insert(appliedIndex, op.text, format)
          activeKeys = Object.keys(op.attributes ?? {})
        } else {
          if (richText && op.attributes && Object.keys(op.attributes).length > 0) {
            throw new PlainTextYjsError(
              'Rich-text Yjs apply rejected insertText.attributes after sanitization'
            )
          }
          yText.insert(appliedIndex, op.text)
          activeKeys = []
        }
        delta += op.text.length
        break
      }
      case 'deleteText':
        yText.delete(appliedIndex, op.length)
        delta -= op.length
        break
      case 'replaceText': {
        yText.delete(appliedIndex, op.length)
        const format = doc
          ? formatMapForInsert(op.attributes, activeKeys, doc, registry, richText)
          : undefined
        if (format && Object.keys(format).length > 0) {
          yText.insert(appliedIndex, op.text, format)
          activeKeys = Object.keys(op.attributes ?? {})
        } else {
          if (richText && op.attributes && Object.keys(op.attributes).length > 0) {
            throw new PlainTextYjsError(
              'Rich-text Yjs apply rejected replaceText.attributes after sanitization'
            )
          }
          yText.insert(appliedIndex, op.text)
          activeKeys = []
        }
        delta += op.text.length - op.length
        break
      }
      case 'setTextAttributes': {
        if (!richText) {
          throw new PlainTextYjsError(
            'Plain-text Yjs binding cannot apply setTextAttributes to Y.Text'
          )
        }
        if (!doc) {
          throw new PlainTextYjsError('Rich-text Yjs apply requires a Document')
        }
        if (op.length === 0) break
        const format = formatMapForMutation(op.attributes, doc, registry)
        if (Object.keys(format).length > 0) {
          yText.format(appliedIndex, op.length, format)
          for (const [key, value] of Object.entries(op.attributes)) {
            if (value === null) {
              activeKeys = activeKeys.filter((activeKey) => activeKey !== key)
            } else if (value !== undefined) {
              if (!activeKeys.includes(key)) activeKeys.push(key)
            }
          }
        }
        break
      }
    }
  }
}

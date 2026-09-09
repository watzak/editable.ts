import { getBlockOperationText } from './operation-text-model.js'
import { OPERATION_LINE_BREAK } from './operation-types.js'
import {
  collapsedOffset,
  selectionSpan,
  staticRangeToCharacterRange
} from './operation-selection.js'
import type { EditableOperation, SelectionSnapshot } from './operation-types.js'

/** Text-level beforeinput types captured into operation batches. */
export const TEXT_INPUT_TYPES = [
  'insertText',
  'insertReplacementText',
  'insertLineBreak',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteByCut'
] as const

export type TextInputType = (typeof TEXT_INPUT_TYPES)[number]

const TEXT_INPUT_TYPE_SET = new Set<string>(TEXT_INPUT_TYPES)

export function isTextInputType(inputType: string): inputType is TextInputType {
  return TEXT_INPUT_TYPE_SET.has(inputType)
}

export function supportsTargetRanges(inputEvent: InputEvent): boolean {
  return typeof inputEvent.getTargetRanges === 'function'
}

export function predictOperationsFromBeforeInput(
  host: HTMLElement,
  inputEvent: InputEvent,
  textBefore: string,
  selectionBefore: SelectionSnapshot
): EditableOperation[] | undefined {
  const inputType = inputEvent.inputType
  if (!isTextInputType(inputType)) return undefined

  const span = resolveMutationSpan(host, inputEvent, selectionBefore)
  if (!span) return undefined

  return buildOperationsForInputType(inputType, inputEvent.data ?? '', span, textBefore)
}

function resolveMutationSpan(
  host: HTMLElement,
  inputEvent: InputEvent,
  selectionBefore: SelectionSnapshot
): { start: number; end: number } | undefined {
  if (supportsTargetRanges(inputEvent)) {
    const ranges = inputEvent.getTargetRanges()
    if (ranges.length > 0) {
      return staticRangeToCharacterRange(ranges[0], host)
    }
  }

  const { start, end } = selectionSpan(selectionBefore)
  const collapsed = collapsedOffset(selectionBefore)
  const textLength = getBlockOperationText(host).length

  switch (inputEvent.inputType) {
    case 'insertText':
    case 'insertReplacementText':
    case 'insertLineBreak':
      return start === end ? { start: collapsed, end: collapsed } : { start, end }
    case 'deleteContentBackward':
      if (start !== end) return { start, end }
      return collapsed > 0 ? { start: collapsed - 1, end: collapsed } : undefined
    case 'deleteContentForward':
      if (start !== end) return { start, end }
      return collapsed < textLength ? { start: collapsed, end: collapsed + 1 } : undefined
    case 'deleteByCut':
      return start !== end ? { start, end } : undefined
    default:
      return undefined
  }
}

function buildOperationsForInputType(
  inputType: TextInputType,
  data: string,
  span: { start: number; end: number },
  textBefore: string
): EditableOperation[] | undefined {
  const length = span.end - span.start

  switch (inputType) {
    case 'insertText':
    case 'insertReplacementText':
      if (length > 0) {
        return [{ type: 'replaceText', index: span.start, length, text: data }]
      }
      return data ? [{ type: 'insertText', index: span.start, text: data }] : []
    case 'insertLineBreak': {
      const text = data || OPERATION_LINE_BREAK
      if (length > 0) {
        return [{ type: 'replaceText', index: span.start, length, text }]
      }
      return [{ type: 'insertText', index: span.start, text }]
    }
    case 'deleteContentBackward':
    case 'deleteContentForward':
    case 'deleteByCut':
      if (length <= 0) return []
      if (span.start + length > textBefore.length) return undefined
      return [{ type: 'deleteText', index: span.start, length }]
    default:
      return undefined
  }
}

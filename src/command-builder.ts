import { toCharacterRange } from './util/dom.js'
import type Cursor from './cursor.js'
import type Selection from './selection.js'
import type {
  CommandCursorPayload,
  CommandSelectionPayload,
  CommandSource,
  EditableCommand,
  FormatCommand,
  InputChangeCommand,
  InsertBlockCommand,
  InsertLineBreakCommand,
  MergeBlockCommand,
  PasteCommand,
  SplitBlockCommand
} from './command-types.js'

export function getHostTextOffset(cursor: Cursor): number {
  return toCharacterRange(cursor.range, cursor.host).start
}

export function buildCommandCursor(
  cursor: Cursor,
  options?: { htmlBefore?: string; htmlAfter?: string }
): CommandCursorPayload {
  const payload: CommandCursorPayload = { offset: getHostTextOffset(cursor) }
  if (options?.htmlBefore !== undefined) payload.htmlBefore = options.htmlBefore
  if (options?.htmlAfter !== undefined) payload.htmlAfter = options.htmlAfter
  return payload
}

export function buildCommandSelection(selection: Selection): CommandSelectionPayload {
  const range = selection.getTextRange()
  return { start: range.start, end: range.end, text: range.text }
}

function baseFields(
  host: HTMLElement,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): Pick<EditableCommand, 'host' | 'source' | 'nativeEvent' | 'inputType'> {
  return {
    host,
    source,
    ...(inputType !== undefined && { inputType }),
    ...(nativeEvent !== undefined && { nativeEvent: nativeEvent })
  }
}

export function buildInsertBlockCommand(
  host: HTMLElement,
  direction: 'before' | 'after',
  cursor: Cursor,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): InsertBlockCommand {
  return {
    type: 'insertBlock',
    direction,
    cursor: buildCommandCursor(cursor),
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

export function buildSplitBlockCommand(
  host: HTMLElement,
  htmlBefore: string,
  htmlAfter: string,
  cursor: Cursor,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): SplitBlockCommand {
  return {
    type: 'splitBlock',
    htmlBefore,
    htmlAfter,
    cursor: buildCommandCursor(cursor, { htmlBefore, htmlAfter }),
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

export function buildMergeBlockCommand(
  host: HTMLElement,
  direction: 'before' | 'after',
  cursor: Cursor,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): MergeBlockCommand {
  return {
    type: 'mergeBlock',
    direction,
    cursor: buildCommandCursor(cursor),
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

export function buildInsertLineBreakCommand(
  host: HTMLElement,
  cursor: Cursor,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): InsertLineBreakCommand {
  return {
    type: 'insertLineBreak',
    cursor: buildCommandCursor(cursor),
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

export function buildPasteCommand(
  host: HTMLElement,
  blocks: string[],
  cursor: Cursor,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): PasteCommand {
  return {
    type: 'paste',
    blocks,
    cursor: buildCommandCursor(cursor),
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

/** Paste command when DOM has not yet been mutated (e.g. `defaultBehavior: false`). */
export function buildPasteCommandAtOffset(
  host: HTMLElement,
  blocks: string[],
  offset: number,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): PasteCommand {
  return {
    type: 'paste',
    blocks,
    cursor: { offset },
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

export function buildFormatCommand(
  host: HTMLElement,
  format: FormatCommand['format'],
  selection: Selection,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): FormatCommand {
  return {
    type: 'format',
    format,
    selection: buildCommandSelection(selection),
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

/**
 * Metadata command for plain-text input. Always paired with an
 * {@link EditableOperationBatch} emitted via the operation pipeline for the
 * same user gesture — see `InputChangeCommand` in command-types.
 */
export function buildInputChangeCommand(
  host: HTMLElement,
  source: CommandSource,
  nativeEvent?: Event,
  inputType?: string
): InputChangeCommand {
  return {
    type: 'input',
    ...baseFields(host, source, nativeEvent, inputType)
  }
}

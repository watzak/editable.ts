/**
 * Command source describes how an editing command entered the pipeline.
 */
export type CommandSource = 'keyboard' | 'beforeinput' | 'paste' | 'api'

/**
 * Character offsets are **UTF-16 code units** measured from the start of the
 * host block's text content — the same indexing model as JavaScript strings
 * and DOM `Range#toString()`. Surrogate pairs (e.g. emoji) count as two units;
 * combining marks are separate units from their base character.
 */
export interface CharacterOffsetRange {
  start: number
  end: number
}

/** Collapsed caret position and optional HTML fragments around it. */
export interface CommandCursorPayload {
  offset: number
  htmlBefore?: string
  htmlAfter?: string
}

/** Non-collapsed selection as stable character offsets within the host block. */
export interface CommandSelectionPayload extends CharacterOffsetRange {
  text: string
}

interface CommandBase {
  host: HTMLElement
  source: CommandSource
  inputType?: string
  nativeEvent?: Event
}

export interface InsertBlockCommand extends CommandBase {
  type: 'insertBlock'
  direction: 'before' | 'after'
  cursor: CommandCursorPayload
}

export interface SplitBlockCommand extends CommandBase {
  type: 'splitBlock'
  htmlBefore: string
  htmlAfter: string
  cursor: CommandCursorPayload
}

export interface MergeBlockCommand extends CommandBase {
  type: 'mergeBlock'
  direction: 'before' | 'after'
  cursor: CommandCursorPayload
}

export interface InsertLineBreakCommand extends CommandBase {
  type: 'insertLineBreak'
  cursor: CommandCursorPayload
}

export interface PasteCommand extends CommandBase {
  type: 'paste'
  blocks: string[]
  cursor: CommandCursorPayload
}

export interface FormatCommand extends CommandBase {
  type: 'format'
  format: 'bold' | 'italic'
  selection: CommandSelectionPayload
}

/**
 * Metadata for non-structural text input.
 *
 * Emitted together with exactly one {@link EditableOperationBatch} per user
 * gesture: the batch carries canonical text ops (`insertText`, `deleteText`, …)
 * while this command preserves 1.x `change` compatibility and links the gesture
 * to block-level adapters via `ChangeDetails.command`.
 */
export interface InputChangeCommand extends CommandBase {
  type: 'input'
}

export type EditableCommand =
  | InsertBlockCommand
  | SplitBlockCommand
  | MergeBlockCommand
  | InsertLineBreakCommand
  | PasteCommand
  | FormatCommand
  | InputChangeCommand

export interface ChangeDetails {
  source: CommandSource
  inputType?: string
  command?: EditableCommand
}

export type StructuralCommand = Exclude<EditableCommand, InputChangeCommand>

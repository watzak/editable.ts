import type { EditableCommand } from './command-types.js'

/**
 * JSON-compatible value for serializable operation payloads.
 * Attribute maps use `null` to remove a key.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/** Inline text attributes attached to inserted or replaced spans. */
export type TextAttributes = Record<string, JsonValue | null>

/**
 * Describes how an operation batch entered the pipeline.
 * Broader than {@link CommandSource} — includes IME composition and remote sync.
 */
export type OperationSource =
  | 'keyboard'
  | 'beforeinput'
  | 'paste'
  | 'composition'
  | 'api'
  | 'remote'

/** Collapsed caret (`none`) or non-collapsed selection direction in UTF-16 offsets. */
export type SelectionDirection = 'none' | 'forward' | 'backward'

/**
 * Serializable selection state within a single block host.
 * `anchor` and `head` are **UTF-16 code unit** offsets — same model as
 * JavaScript strings and DOM `Range` string indexing.
 */
export interface SelectionSnapshot {
  anchor: number
  head: number
  direction: SelectionDirection
}

/**
 * Canonical line break in the operation text model.
 * DOM `<br>` elements map to this character; operations never embed HTML.
 */
export const OPERATION_LINE_BREAK = '\n'

export interface InsertTextOperation {
  type: 'insertText'
  /** UTF-16 code unit offset where `text` is inserted. */
  index: number
  /** Plain text; use {@link OPERATION_LINE_BREAK} instead of `<br>`. */
  text: string
  attributes?: TextAttributes
}

export interface DeleteTextOperation {
  type: 'deleteText'
  /** UTF-16 code unit offset of the first removed character. */
  index: number
  /** UTF-16 code unit length to remove. */
  length: number
}

export interface ReplaceTextOperation {
  type: 'replaceText'
  /** UTF-16 code unit offset of the first replaced character. */
  index: number
  /** UTF-16 code unit length replaced. */
  length: number
  /** Plain text; use {@link OPERATION_LINE_BREAK} instead of `<br>`. */
  text: string
  attributes?: TextAttributes
}

export interface SetTextAttributesOperation {
  type: 'setTextAttributes'
  /** UTF-16 code unit offset of the first affected character. */
  index: number
  /** UTF-16 code unit length of the affected span. */
  length: number
  attributes: Record<string, JsonValue | null>
}

/** Canonical, validated text/attribute mutation — Yjs-adapter input. */
export type EditableOperation =
  | InsertTextOperation
  | DeleteTextOperation
  | ReplaceTextOperation
  | SetTextAttributesOperation

/**
 * Non-serialized metadata attached at batch level only.
 * Omit when persisting or syncing operation batches over the wire.
 */
export interface OperationBatchOrigin {
  nativeEvent?: Event
  command?: EditableCommand
}

/**
 * Atomic text mutations for a single block host.
 * The host element is passed separately in events and API calls — not embedded here.
 */
export interface EditableOperationBatch {
  operations: readonly EditableOperation[]
  source: OperationSource
  inputType?: string
  selectionBefore?: SelectionSnapshot
  selectionAfter?: SelectionSnapshot
  /** Non-serialized; strip before JSON transport. */
  origin?: OperationBatchOrigin
}

/** Wire-safe batch without {@link OperationBatchOrigin}. */
export type SerializableOperationBatch = Omit<EditableOperationBatch, 'origin'>

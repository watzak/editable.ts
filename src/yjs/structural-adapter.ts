import type * as Y from 'yjs'
import type { Editable } from '../core.js'
import type {
  InsertBlockCommand,
  MergeBlockCommand,
  PasteCommand,
  SplitBlockCommand
} from '../command-types.js'
import type { SelectionSnapshot } from '../operation-types.js'
import type { BindingTransactionOrigin } from './binding-origin.js'
import type { EditableYjsBinding } from './editable-yjs-binding.js'

export type StructuralIntentStatus = 'accepted' | 'rejected' | 'defer'

export interface StructuralBlockContext {
  editable: Editable
  host: HTMLElement
  yText: Y.Text
  binding: EditableYjsBinding
  doc: Y.Doc
  transactionOrigin: BindingTransactionOrigin
}

export interface StructuralSplitIntent {
  command: SplitBlockCommand
  offset: number
  htmlBefore: string
  htmlAfter: string
  selectionBefore: SelectionSnapshot
}

export interface StructuralMergeIntent {
  command: MergeBlockCommand
  direction: 'before' | 'after'
  offset: number
  selectionBefore: SelectionSnapshot
}

export interface StructuralInsertBlockIntent {
  command: InsertBlockCommand
  direction: 'before' | 'after'
  offset: number
  selectionBefore: SelectionSnapshot
}

export interface StructuralPasteIntent {
  command: PasteCommand
  blocks: string[]
  offset: number
  selectionBefore: SelectionSnapshot
}

export interface StructuralAcceptedResult {
  status: 'accepted'
  focusHost: HTMLElement
  selection: SelectionSnapshot
  newBlockId?: string
}

export interface StructuralRejectedResult {
  status: 'rejected'
  reason?: string
}

export interface StructuralDeferResult {
  status: 'defer'
}

export type StructuralIntentResult =
  | StructuralAcceptedResult
  | StructuralRejectedResult
  | StructuralDeferResult

/**
 * Optional hooks for block-level document structure.
 *
 * The text binding does not prescribe a global block schema — adapters may use
 * Y.Array, Y.Map, nested Y.Text types, or other CRDT shapes.
 */
export interface EditableYjsStructuralAdapter {
  splitBlock?(ctx: StructuralBlockContext, intent: StructuralSplitIntent): StructuralIntentResult
  mergeBlock?(ctx: StructuralBlockContext, intent: StructuralMergeIntent): StructuralIntentResult
  insertBlock?(
    ctx: StructuralBlockContext,
    intent: StructuralInsertBlockIntent
  ): StructuralIntentResult
  pasteBlocks?(ctx: StructuralBlockContext, intent: StructuralPasteIntent): StructuralIntentResult
}

export interface StructuralAdapterOptions {
  structuralAdapter?: EditableYjsStructuralAdapter
}

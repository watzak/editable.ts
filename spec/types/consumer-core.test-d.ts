/**
 * Consumer-facing type checks for the core package entry.
 * Imports only public exports — run via `npm run typecheck:consumer` after build.
 */
import {
  Editable,
  CommandContext,
  OperationContext,
  OPERATION_LINE_BREAK,
  type ChangeDetails,
  type DispatchOperationOptions,
  type EditableCommand,
  type EditableConfig,
  type EditableOperation,
  type EditableOperationBatch,
  type JsonValue,
  type OperationSource,
  type SelectionSnapshot
} from 'editable.ts'

declare const block: HTMLElement

const config: EditableConfig = { defaultBehavior: false }
const editable = new Editable(config)

editable.add(block)

editable.on('command', (command: EditableCommand) => {
  switch (command.type) {
    case 'splitBlock':
      return command.htmlBefore.length + command.cursor.offset
    case 'insertBlock':
      return command.direction
    case 'format':
      return command.selection.text
    default:
      return command.type
  }
})

editable.on('change', (element: HTMLElement, details?: ChangeDetails) => {
  return details?.command?.type ?? element.tagName
})

editable.beforeCommand((ctx: CommandContext) => {
  if (ctx.command.type === 'mergeBlock') ctx.cancel()
})

const operationBatch: EditableOperationBatch = {
  source: 'api' satisfies OperationSource,
  selectionBefore: { anchor: 0, head: 2, direction: 'forward' } satisfies SelectionSnapshot,
  operations: [
    { type: 'insertText', index: 0, text: 'hi' },
    { type: 'deleteText', index: 2, length: 1 },
    {
      type: 'replaceText',
      index: 0,
      length: 2,
      text: `line${OPERATION_LINE_BREAK}two`,
      attributes: { bold: true satisfies JsonValue }
    },
    {
      type: 'setTextAttributes',
      index: 0,
      length: 4,
      attributes: { italic: false, mark: null }
    }
  ] satisfies readonly EditableOperation[]
}

editable.beforeOperation((host, ctx: OperationContext) => {
  if (host === block && ctx.batch.source === 'remote') ctx.cancel()
})

editable.on('operation', (host, batch) => {
  return host.tagName + batch.operations.length
})

const dispatchOptions: DispatchOperationOptions = { emitOperation: true }
void dispatchOptions
void operationBatch

editable.on('toggleBold', (selection) => selection.text())

// Convenience subscriptions remain fully typed.
editable.change((element) => element.isContentEditable)
editable.command((command) => command.source)
editable.focus((element) => element.tagName)

export type ConsumerCoreCheck = typeof editable

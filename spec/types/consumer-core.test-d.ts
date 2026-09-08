/**
 * Consumer-facing type checks for the core package entry.
 * Imports only public exports — run via `npm run typecheck:consumer` after build.
 */
import {
  Editable,
  CommandContext,
  type ChangeDetails,
  type EditableCommand,
  type EditableConfig
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

editable.on('toggleBold', (selection) => selection.text())

// Convenience subscriptions remain fully typed.
editable.change((element) => element.isContentEditable)
editable.command((command) => command.source)
editable.focus((element) => element.tagName)

export type ConsumerCoreCheck = typeof editable

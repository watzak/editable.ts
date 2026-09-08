import { CommandContext } from './command-context.js'
import type { ChangeDetails, EditableCommand } from './command-types.js'
import type { EventNotify } from './event-types.js'
import type { DispatcherEventMap } from './event-types.js'
import type { Editable } from './core.js'
import type Cursor from './cursor.js'
import type Selection from './selection.js'

export interface CommandRuntime {
  cursor?: Cursor
  selection?: Selection
}

export interface DispatchCommandOptions {
  emitChange?: boolean
}

type Notify = EventNotify<DispatcherEventMap, Editable>

/**
 * Runs the command pipeline: `beforeCommand` → `command` → legacy events → `change`.
 */
export function dispatchEditableCommand(
  notify: Notify,
  command: EditableCommand,
  runtime: CommandRuntime,
  options: DispatchCommandOptions = {}
): CommandContext {
  const context = new CommandContext(command)
  notify('beforeCommand', context)
  notify('command', command)

  if (!context.cancelled) {
    emitLegacyEvents(notify, command, runtime)
  }

  if (options.emitChange !== false && !context.cancelled) {
    const details: ChangeDetails = {
      source: command.source,
      inputType: command.inputType,
      command
    }
    notify('change', command.host, details)
  }

  return context
}

function emitLegacyEvents(notify: Notify, command: EditableCommand, runtime: CommandRuntime): void {
  switch (command.type) {
    case 'insertBlock':
      if (runtime.cursor) {
        notify('insert', command.host, command.direction, runtime.cursor)
      }
      break
    case 'splitBlock':
      if (runtime.cursor) {
        notify('split', command.host, command.htmlBefore, command.htmlAfter, runtime.cursor)
      }
      break
    case 'mergeBlock':
      if (runtime.cursor) {
        notify('merge', command.host, command.direction, runtime.cursor)
      }
      break
    case 'insertLineBreak':
      if (runtime.cursor) {
        notify('newline', command.host, runtime.cursor)
      }
      break
    case 'paste':
      if (runtime.cursor) {
        notify('paste', command.host, command.blocks, runtime.cursor)
      }
      break
    case 'format':
      if (runtime.selection) {
        if (command.format === 'bold') {
          notify('toggleBold', runtime.selection)
        } else {
          notify('toggleEmphasis', runtime.selection)
        }
      }
      break
    case 'input':
      break
  }
}

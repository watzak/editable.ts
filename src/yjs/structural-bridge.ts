import type { CommandContext } from '../command-context.js'
import { setSelectionFromSnapshot } from '../operation-selection.js'
import { captureSelectionSnapshot } from '../operation-selection.js'
import type { EditableYjsBinding } from './editable-yjs-binding.js'
import type {
  EditableYjsStructuralAdapter,
  StructuralBlockContext,
  StructuralIntentResult
} from './structural-adapter.js'

type BeforeCommandHandler = (context: CommandContext) => void

export class YjsStructuralBridge {
  private readonly binding: EditableYjsBinding
  private readonly adapter: EditableYjsStructuralAdapter
  private readonly beforeCommandHandler: BeforeCommandHandler

  constructor(binding: EditableYjsBinding, adapter: EditableYjsStructuralAdapter) {
    this.binding = binding
    this.adapter = adapter
    this.beforeCommandHandler = (context) => {
      this.handleBeforeCommand(context)
    }
    binding.editable.on('beforeCommand', this.beforeCommandHandler)
  }

  destroy(): void {
    this.binding.editable.off('beforeCommand', this.beforeCommandHandler)
  }

  private handleBeforeCommand(context: CommandContext): void {
    if (context.cancelled) return
    const command = context.command
    if (command.host !== this.binding.host) return

    const selectionBefore = captureSelectionSnapshot(
      this.binding.host,
      this.binding.editable.dispatcher.selectionWatcher.getFreshSelection()
    )
    if (!selectionBefore) return

    const ctx = this.createContext()
    let result: StructuralIntentResult | undefined

    switch (command.type) {
      case 'splitBlock':
        result = this.adapter.splitBlock?.(ctx, {
          command,
          offset: command.cursor.offset,
          htmlBefore: command.htmlBefore,
          htmlAfter: command.htmlAfter,
          selectionBefore
        })
        break
      case 'mergeBlock':
        result = this.adapter.mergeBlock?.(ctx, {
          command,
          direction: command.direction,
          offset: command.cursor.offset,
          selectionBefore
        })
        break
      case 'insertBlock':
        result = this.adapter.insertBlock?.(ctx, {
          command,
          direction: command.direction,
          offset: command.cursor.offset,
          selectionBefore
        })
        break
      case 'paste':
        if (command.blocks.length > 1) {
          result = this.adapter.pasteBlocks?.(ctx, {
            command,
            blocks: command.blocks,
            offset: command.cursor.offset,
            selectionBefore
          })
        }
        break
      default:
        return
    }

    if (!result || result.status === 'defer') return

    context.cancel()
    if (result.status === 'rejected') return

    result.focusHost.focus()
    setSelectionFromSnapshot(result.focusHost, result.selection)
    this.binding.editable.dispatcher.selectionWatcher.syncSelection()
  }

  private createContext(): StructuralBlockContext {
    const doc = this.binding.yText.doc
    if (!doc) {
      throw new Error('YjsStructuralBridge: yText must belong to a Y.Doc')
    }
    return {
      editable: this.binding.editable,
      host: this.binding.host,
      yText: this.binding.yText,
      binding: this.binding,
      doc,
      transactionOrigin: this.binding.transactionOrigin
    }
  }
}

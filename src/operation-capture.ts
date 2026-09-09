import { dispatchEditableCommand } from './command-pipeline.js'
import { buildInputChangeCommand } from './command-builder.js'
import { dispatchEditableOperations } from './operation-pipeline.js'
import { diffToOperations } from './operation-diff.js'
import { getBlockOperationText } from './operation-text-model.js'
import { captureSelectionSnapshot, collapsedOffset, selectionSpan } from './operation-selection.js'
import { predictOperationsFromBeforeInput } from './operation-input-predict.js'
import { resolveSmartQuoteOperation } from './smartQuotes.js'
import type {
  EditableOperation,
  EditableOperationBatch,
  OperationSource,
  SelectionSnapshot
} from './operation-types.js'
import type { CommandSource } from './command-types.js'
import type { DispatcherEventMap } from './event-types.js'
import type { Editable } from './core.js'
import type SelectionWatcher from './selection-watcher.js'
import type { QuotePair } from './smartQuotes.js'

type Notify = import('./event-types.js').EventNotify<DispatcherEventMap, Editable>

interface PendingTextCapture {
  textBefore: string
  selectionBefore: SelectionSnapshot
  inputType: string
  inputData?: string | null
  source: OperationSource
  nativeEvent?: Event
  predicted?: EditableOperation[]
}

interface CompositionCapture {
  textBefore: string
  selectionBefore: SelectionSnapshot
}

interface ConfirmedState {
  text: string
  selection?: SelectionSnapshot
}

export class OperationCapture {
  private pending = new WeakMap<HTMLElement, PendingTextCapture>()
  private composition = new WeakMap<HTMLElement, CompositionCapture>()
  private confirmed = new WeakMap<HTMLElement, ConfirmedState>()
  private applyingSmartQuote = new WeakSet<HTMLElement>()
  private applyingRemote = new WeakSet<HTMLElement>()

  syncConfirmedState(block: HTMLElement, selectionWatcher: SelectionWatcher): void {
    const cursorOrSelection = selectionWatcher.getFreshSelection()
    this.confirmed.set(block, {
      text: getBlockOperationText(block),
      selection: captureSelectionSnapshot(block, cursorOrSelection)
    })
  }

  beginTextMutation(
    block: HTMLElement,
    selectionWatcher: SelectionWatcher,
    inputEvent: InputEvent,
    source: OperationSource
  ): void {
    const cursorOrSelection = selectionWatcher.getFreshSelection()
    const selectionBefore = captureSelectionSnapshot(block, cursorOrSelection)
    if (!selectionBefore) return

    const textBefore = getBlockOperationText(block)
    const predicted = predictOperationsFromBeforeInput(
      block,
      inputEvent,
      textBefore,
      selectionBefore
    )

    this.pending.set(block, {
      textBefore,
      selectionBefore,
      inputType: inputEvent.inputType,
      inputData: inputEvent.data,
      source,
      nativeEvent: inputEvent,
      predicted
    })
  }

  beginComposition(block: HTMLElement, selectionWatcher: SelectionWatcher): void {
    const cursorOrSelection = selectionWatcher.getFreshSelection()
    const selectionBefore = captureSelectionSnapshot(block, cursorOrSelection)
    if (!selectionBefore) return

    this.composition.set(block, {
      textBefore: getBlockOperationText(block),
      selectionBefore
    })
    this.pending.delete(block)
  }

  clearComposition(block: HTMLElement): CompositionCapture | undefined {
    const snapshot = this.composition.get(block)
    this.composition.delete(block)
    return snapshot
  }

  hasComposition(block: HTMLElement): boolean {
    return this.composition.has(block)
  }

  hasPendingMutation(block: HTMLElement): boolean {
    return this.pending.has(block) || this.composition.has(block)
  }

  isApplyingSmartQuote(block: HTMLElement): boolean {
    return this.applyingSmartQuote.has(block)
  }

  beginRemoteApply(block: HTMLElement): void {
    this.applyingRemote.add(block)
    this.pending.delete(block)
  }

  endRemoteApply(block: HTMLElement): void {
    this.applyingRemote.delete(block)
  }

  isApplyingRemote(block: HTMLElement): boolean {
    return this.applyingRemote.has(block)
  }

  commitComposition(
    notify: Notify,
    block: HTMLElement,
    selectionWatcher: SelectionWatcher,
    nativeEvent: CompositionEvent
  ): boolean {
    const start = this.clearComposition(block)
    if (!start) return false

    const textAfter = getBlockOperationText(block)
    const selectionAfter = captureSelectionSnapshot(block, selectionWatcher.getFreshSelection())

    const operations = diffToOperations(start.textBefore, textAfter)
    if (operations.length === 0) return false

    return this.emitConfirmedBatch(notify, block, selectionWatcher, {
      operations,
      source: 'composition',
      inputType: nativeEvent.type,
      selectionBefore: start.selectionBefore,
      selectionAfter,
      nativeEvent
    })
  }

  commitTextInput(
    notify: Notify,
    block: HTMLElement,
    selectionWatcher: SelectionWatcher,
    inputEvent: InputEvent,
    smartQuotesConfig?: { quotes: QuotePair | string[]; singleQuotes: QuotePair | string[] }
  ): boolean {
    if (this.isApplyingSmartQuote(block) || this.isApplyingRemote(block)) return false

    const pending = this.pending.get(block)
    this.pending.delete(block)

    const textAfter = getBlockOperationText(block)
    const selectionAfter = captureSelectionSnapshot(block, selectionWatcher.getFreshSelection())

    const textBefore = pending?.textBefore ?? this.confirmed.get(block)?.text
    if (textBefore === undefined) {
      this.syncConfirmedState(block, selectionWatcher)
      return false
    }

    let operations =
      pending?.predicted && predictedMatchesDiff(pending.predicted, textBefore, textAfter)
        ? pending.predicted
        : diffToOperations(textBefore, textAfter)

    if (operations.length === 0) {
      this.syncConfirmedState(block, selectionWatcher)
      return false
    }

    operations = this.applySmartQuotesToOperations(
      block,
      operations,
      textBefore,
      textAfter,
      pending?.inputData ?? inputEvent.data,
      smartQuotesConfig
    )

    const emitted = this.emitConfirmedBatch(notify, block, selectionWatcher, {
      operations,
      source: pending?.source ?? 'keyboard',
      inputType: pending?.inputType ?? inputEvent.inputType,
      selectionBefore: pending?.selectionBefore ?? this.confirmed.get(block)?.selection,
      selectionAfter,
      nativeEvent: pending?.nativeEvent ?? inputEvent
    })

    return emitted
  }

  commitFormatMutation(
    notify: Notify,
    block: HTMLElement,
    selectionWatcher: SelectionWatcher,
    details: {
      operations: readonly EditableOperation[]
      selectionBefore?: SelectionSnapshot
      nativeEvent?: Event
      inputType?: string
    }
  ): boolean {
    if (this.isApplyingRemote(block)) return false
    if (details.operations.length === 0) return false

    const selectionAfter = captureSelectionSnapshot(block, selectionWatcher.getFreshSelection())

    return this.emitConfirmedBatch(notify, block, selectionWatcher, {
      operations: details.operations,
      source: 'api',
      inputType: details.inputType ?? 'formatText',
      selectionBefore: details.selectionBefore,
      selectionAfter,
      nativeEvent: details.nativeEvent
    })
  }

  buildPasteTextBatch(
    selectionBefore: SelectionSnapshot,
    pastedPlainText: string,
    nativeEvent: Event
  ): EditableOperationBatch {
    const { start, end } = selectionSpan(selectionBefore)
    const length = end - start
    const operations: EditableOperation[] =
      length > 0
        ? [{ type: 'replaceText', index: start, length, text: pastedPlainText }]
        : pastedPlainText
          ? [{ type: 'insertText', index: collapsedOffset(selectionBefore), text: pastedPlainText }]
          : []

    const cursorAfter = start + pastedPlainText.length

    return {
      operations,
      source: 'paste',
      inputType: 'insertFromPaste',
      selectionBefore,
      selectionAfter: {
        anchor: cursorAfter,
        head: cursorAfter,
        direction: 'none'
      },
      origin: { nativeEvent }
    }
  }

  private applySmartQuotesToOperations(
    block: HTMLElement,
    operations: EditableOperation[],
    textBefore: string,
    textAfter: string,
    inputData: string | null | undefined,
    smartQuotesConfig?: { quotes: QuotePair | string[]; singleQuotes: QuotePair | string[] }
  ): EditableOperation[] {
    if (!smartQuotesConfig || !inputData) return operations

    const smartOp = resolveSmartQuoteOperation(textBefore, textAfter, inputData, smartQuotesConfig)
    if (!smartOp) return operations

    this.applyingSmartQuote.add(block)
    try {
      smartOp.applyDom(block)
    } finally {
      this.applyingSmartQuote.delete(block)
    }

    return [
      ...operations,
      {
        type: 'replaceText',
        index: smartOp.index,
        length: 1,
        text: smartOp.replacement
      }
    ]
  }

  private emitConfirmedBatch(
    notify: Notify,
    block: HTMLElement,
    selectionWatcher: SelectionWatcher,
    details: {
      operations: readonly EditableOperation[]
      source: OperationSource
      inputType?: string
      selectionBefore?: SelectionSnapshot
      selectionAfter?: SelectionSnapshot
      nativeEvent?: Event
    }
  ): boolean {
    if (details.operations.length === 0) return false

    const inputCommand = buildInputChangeCommand(
      block,
      mapOperationSourceToCommandSource(details.source),
      details.nativeEvent,
      details.inputType
    )

    const batch: EditableOperationBatch = {
      operations: details.operations,
      source: details.source,
      inputType: details.inputType,
      selectionBefore: details.selectionBefore,
      selectionAfter: details.selectionAfter,
      origin: {
        nativeEvent: details.nativeEvent,
        command: inputCommand
      }
    }

    const opContext = dispatchEditableOperations(notify, block, batch)
    if (opContext.cancelled) return false

    const commandContext = dispatchEditableCommand(notify, inputCommand, {}, { emitChange: true })
    if (commandContext.cancelled) return false

    this.syncConfirmedState(block, selectionWatcher)
    return true
  }
}

function mapOperationSourceToCommandSource(source: OperationSource): CommandSource {
  if (source === 'composition') return 'keyboard'
  if (source === 'remote') return 'api'
  if (source === 'beforeinput') return 'beforeinput'
  if (source === 'paste') return 'paste'
  if (source === 'api') return 'api'
  return 'keyboard'
}

function predictedMatchesDiff(
  predicted: EditableOperation[],
  textBefore: string,
  textAfter: string
): boolean {
  const fromDiff = diffToOperations(textBefore, textAfter)
  if (fromDiff.length !== predicted.length) return false
  return JSON.stringify(fromDiff) === JSON.stringify(predicted)
}

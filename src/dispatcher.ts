import { getWindowFeatures } from './feature-detection.js'
import * as clipboard from './clipboard.js'
import * as content from './content.js'
import eventable from './eventable.js'
import SelectionWatcher from './selection-watcher.js'
import Keyboard from './keyboard.js'
import {
  addSharedDocumentListener,
  type SharedDocumentListener
} from './shared-document-listeners.js'
import { closest } from './util/dom.js'
import { replaceLast, endsWithSingleSpace } from './util/string.js'
import { shouldApplySmartQuotes } from './smartQuotes.js'
import { isBlockComposing, isEditingSuppressed, setBlockComposing } from './composition-state.js'
import { getInputCapabilities, isBeforeInputPreferred } from './input-capabilities.js'
import { InputCommandTracker } from './input-command-tracker.js'
import { mapCommandToInputType, mapInputTypeToCommand } from './input-normalizer.js'
import { isTextInputType } from './operation-input-predict.js'
import { flushQueuedOperations } from './apply-operations.js'
import { OperationCapture } from './operation-capture.js'
import { dispatchEditableOperations } from './operation-pipeline.js'
import { htmlToOperationText } from './operation-text-model.js'
import { captureSelectionSnapshot } from './operation-selection.js'
import type { TrackedInputCommand } from './input-command-tracker.js'
import type { CommandSource, EditableCommand } from './command-types.js'
import {
  buildFormatCommand,
  buildInsertBlockCommand,
  buildInsertLineBreakCommand,
  buildMergeBlockCommand,
  buildPasteCommand,
  buildPasteCommandAtOffset,
  buildSplitBlockCommand
} from './command-builder.js'
import { dispatchEditableCommand } from './command-pipeline.js'
import type { Editable } from './core.js'
import type { QuotePair } from './smartQuotes.js'
import type Cursor from './cursor.js'
import type {
  DispatcherEventMap,
  EventHandler,
  EventNotify,
  EventOff,
  EventOn
} from './event-types.js'
import type Selection from './selection.js'

/**
 * Coordinates DOM events, keyboard shortcuts and selection updates for an
 * `Editable` instance.
 */
export default class Dispatcher {
  public document: Document
  public config: Editable['config']
  public editable: Editable
  public editableSelector: string
  public selectionWatcher: SelectionWatcher
  public keyboard: Keyboard
  public inputCommandTracker: InputCommandTracker
  public operationCapture: OperationCapture
  public activeListeners: SharedDocumentListener[]
  public suspended?: boolean
  public switchContext?: {
    events: string[]
    positionX?: number
  }
  public getEditableBlockByEvent: (evt: Event) => HTMLElement | undefined
  public notify!: EventNotify<DispatcherEventMap, Editable>
  public off!: EventOff<DispatcherEventMap, Editable>
  public on!: EventOn<DispatcherEventMap, Editable, this>

  constructor(editable: Editable) {
    const win = editable.win
    eventable<Dispatcher, Editable, DispatcherEventMap>(this, editable)
    this.document = win.document
    this.config = editable.config
    this.editable = editable
    this.editableSelector = editable.editableSelector
    this.selectionWatcher = new SelectionWatcher(this, win)
    this.keyboard = new Keyboard(this.selectionWatcher)
    this.inputCommandTracker = new InputCommandTracker()
    this.operationCapture = new OperationCapture()
    this.activeListeners = []
    this.setup()
    this.getEditableBlockByEvent = (evt: Event) => {
      const target = evt.target as Node
      if (!target) return undefined
      const block = closest(target, editable.editableSelector)
      if (!block) return undefined
      return editable.ownsBlock(block) ? block : undefined
    }
  }

  setupDocumentListener(event: string, func: (evt: Event) => void, capture: boolean = false): this {
    const listener = addSharedDocumentListener(
      this.document,
      event,
      func.bind(this) as (evt: Event) => void,
      capture
    )
    this.activeListeners.push(listener)
    return this
  }

  setup() {
    this.setupKeyboardEvents()
    this.setupEventListeners()
  }

  unload() {
    this.off()
    for (const l of this.activeListeners) {
      l.remove()
    }
    this.activeListeners.length = 0
  }

  suspend() {
    if (this.suspended) return
    this.suspended = true
    for (const l of this.activeListeners) {
      l.remove()
    }
    this.activeListeners.length = 0
  }

  continue() {
    if (!this.suspended) return
    this.suspended = false
    this.setupEventListeners()
  }

  setupEventListeners() {
    this.setupElementListeners()
    this.setupCompositionListeners()
    this.setupBeforeInputListener()
    this.setupKeydownListener()

    if (getWindowFeatures(this.editable.win).selectionchange) {
      this.setupSelectionChangeListeners()
    } else {
      this.setupSelectionChangeFallbackListeners()
    }
  }

  setupCompositionListeners() {
    this.setupDocumentListener(
      'compositionstart',
      function compositionStartListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        setBlockComposing(block, true)
        this.operationCapture.beginComposition(block, this.selectionWatcher)
      },
      true
    ).setupDocumentListener(
      'compositionend',
      function compositionEndListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        setBlockComposing(block, false)
        const compositionEvent = evt as CompositionEvent
        if (
          !this.operationCapture.commitComposition(
            this.notify,
            block,
            this.selectionWatcher,
            compositionEvent
          )
        ) {
          this.operationCapture.syncConfirmedState(block, this.selectionWatcher)
        }
        flushQueuedOperations(this.editable, block)
      },
      true
    )
  }

  setupBeforeInputListener() {
    const capabilities = getInputCapabilities(this.editable.win)
    if (!capabilities.beforeInput) return

    this.setupDocumentListener(
      'beforeinput',
      function beforeInputListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return

        const inputEvent = evt as InputEvent
        if (isEditingSuppressed(block, inputEvent)) return

        if (isTextInputType(inputEvent.inputType)) {
          this.operationCapture.beginTextMutation(
            block,
            this.selectionWatcher,
            inputEvent,
            'beforeinput'
          )
          return
        }

        const command = mapInputTypeToCommand(inputEvent.inputType)
        if (!command) return

        if (command === 'paste') {
          this.inputCommandTracker.markPastePending(block)
          return
        }

        if (!isBeforeInputPreferred(capabilities, mapCommandToInputType(command))) return

        if (this.executeEditingCommand(block, command, inputEvent, 'beforeinput')) {
          inputEvent.preventDefault()
          inputEvent.stopPropagation()
          this.inputCommandTracker.markBeforeInputHandled(block, command)
          this.inputCommandTracker.markStructuralChange(block)
        }
      },
      true
    )
  }

  executeEditingCommand(
    block: HTMLElement,
    command: TrackedInputCommand,
    event: Event,
    source: CommandSource
  ): boolean {
    switch (command) {
      case 'enter':
        return this.handleEnter(block, event, source)
      case 'shiftEnter':
        return this.handleShiftEnter(block, event, source)
      case 'backspace':
        return this.handleBackspace(block, event, source)
      case 'delete':
        return this.handleDelete(block, event, source)
      case 'bold':
        return this.handleBold(block, event, source)
      case 'italic':
        return this.handleItalic(block, event, source)
      default:
        return false
    }
  }

  private commandInputType(
    source: CommandSource,
    command: TrackedInputCommand,
    event: Event
  ): string | undefined {
    if (source === 'beforeinput' && 'inputType' in event) {
      return (event as InputEvent).inputType
    }
    return mapCommandToInputType(command)
  }

  private dispatchCommand(
    command: EditableCommand,
    runtime: { cursor?: Cursor; selection?: Selection }
  ): void {
    dispatchEditableCommand(this.notify, command, runtime)
  }

  handleBackspace(block: HTMLElement, event: Event, source: CommandSource): boolean {
    const rangeContainer = this.selectionWatcher.getFreshRange()
    if (!rangeContainer.isCursor) return false

    const cursor = rangeContainer.getCursor()
    if (!cursor || !cursor.isAtBeginning()) return false

    event.preventDefault()
    event.stopPropagation()
    this.dispatchCommand(
      buildMergeBlockCommand(
        block,
        'before',
        cursor,
        source,
        event,
        this.commandInputType(source, 'backspace', event)
      ),
      { cursor }
    )
    return true
  }

  handleDelete(block: HTMLElement, event: Event, source: CommandSource): boolean {
    const rangeContainer = this.selectionWatcher.getFreshRange()
    if (!rangeContainer.isCursor) return false

    const cursor = rangeContainer.getCursor()
    if (!cursor || !cursor.isAtTextEnd()) return false

    event.preventDefault()
    event.stopPropagation()
    this.dispatchCommand(
      buildMergeBlockCommand(
        block,
        'after',
        cursor,
        source,
        event,
        this.commandInputType(source, 'delete', event)
      ),
      { cursor }
    )
    return true
  }

  handleEnter(block: HTMLElement, event: Event, source: CommandSource): boolean {
    event.preventDefault()
    event.stopPropagation()
    const rangeContainer = this.selectionWatcher.getFreshRange()
    const cursor = rangeContainer.forceCursor()
    if (!cursor) return false

    const inputType = this.commandInputType(source, 'enter', event)

    if (cursor.isAtTextEnd()) {
      this.dispatchCommand(
        buildInsertBlockCommand(block, 'after', cursor, source, event, inputType),
        { cursor }
      )
    } else if (cursor.isAtBeginning()) {
      this.dispatchCommand(
        buildInsertBlockCommand(block, 'before', cursor, source, event, inputType),
        { cursor }
      )
    } else {
      const beforeFragment = cursor.before()
      const afterFragment = cursor.after()
      this.dispatchCommand(
        buildSplitBlockCommand(
          block,
          content.getInnerHtmlOfFragment(beforeFragment),
          content.getInnerHtmlOfFragment(afterFragment),
          cursor,
          source,
          event,
          inputType
        ),
        { cursor }
      )
    }
    return true
  }

  handleShiftEnter(block: HTMLElement, event: Event, source: CommandSource): boolean {
    event.preventDefault()
    event.stopPropagation()
    const cursor = this.selectionWatcher.forceCursor()
    if (!cursor) return false
    this.dispatchCommand(
      buildInsertLineBreakCommand(
        block,
        cursor,
        source,
        event,
        this.commandInputType(source, 'shiftEnter', event)
      ),
      { cursor }
    )
    return true
  }

  handleBold(block: HTMLElement, event: Event, source: CommandSource): boolean {
    const selection = this.selectionWatcher.getFreshSelection()
    if (!selection || !selection.isSelection) return false
    event.preventDefault()
    event.stopPropagation()
    this.dispatchCommand(
      buildFormatCommand(
        block,
        'bold',
        selection as Selection,
        source,
        event,
        this.commandInputType(source, 'bold', event)
      ),
      { selection: selection as Selection }
    )
    return true
  }

  handleItalic(block: HTMLElement, event: Event, source: CommandSource): boolean {
    const selection = this.selectionWatcher.getFreshSelection()
    if (!selection || !selection.isSelection) return false
    event.preventDefault()
    event.stopPropagation()
    this.dispatchCommand(
      buildFormatCommand(
        block,
        'italic',
        selection as Selection,
        source,
        event,
        this.commandInputType(source, 'italic', event)
      ),
      { selection: selection as Selection }
    )
    return true
  }

  setupElementListeners() {
    this.setupDocumentListener(
      'focus',
      function focusListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const target = evt.target as HTMLElement
        if (target && target.getAttribute(this.editable.globalSettings.pastingAttribute)) return
        this.selectionWatcher.syncSelection()
        this.operationCapture.syncConfirmedState(block, this.selectionWatcher)
        this.notify('focus', block)
      },
      true
    )
      .setupDocumentListener(
        'blur',
        function blurListener(this: Dispatcher, evt: Event) {
          const block = this.getEditableBlockByEvent(evt)
          if (!block) return
          if (block.getAttribute(this.editable.globalSettings.pastingAttribute)) return
          this.notify('blur', block)
        },
        true
      )
      .setupDocumentListener('copy', function copyListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const selection = this.selectionWatcher.getFreshSelection()
        if (selection && selection.isSelection) {
          this.notify('clipboard', block, 'copy', selection as Selection)
        }
      })
      .setupDocumentListener('cut', function cutListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const selection = this.selectionWatcher.getFreshSelection()
        if (selection && selection.isSelection) {
          this.notify('clipboard', block, 'cut', selection as Selection)
        }
      })
      .setupDocumentListener('paste', function pasteListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return

        const clipEvent = evt as ClipboardEvent
        clipEvent.preventDefault()
        this.inputCommandTracker.clearPastePending(block)
        const selection = this.selectionWatcher.getFreshSelection()
        if (!selection || !clipEvent.clipboardData) return
        const clipboardContent =
          clipEvent.clipboardData.getData('text/html') ||
          clipEvent.clipboardData.getData('text/plain')

        const prepared = clipboard.preparePaste(
          block,
          selection,
          clipboardContent,
          this.editable.pasteRules
        )

        const selectionBefore = captureSelectionSnapshot(block, selection)
        const pastedPlainText = prepared.blocks[0]
          ? htmlToOperationText(prepared.blocks[0], block.ownerDocument!)
          : ''

        if (selectionBefore && prepared.blocks.length > 0) {
          const pasteBatch = this.operationCapture.buildPasteTextBatch(
            selectionBefore,
            pastedPlainText,
            clipEvent
          )
          dispatchEditableOperations(this.notify, block, pasteBatch)
        }

        let cursor: Cursor | Selection = selection
        let pasteCommand = buildPasteCommandAtOffset(
          block,
          prepared.blocks,
          prepared.cursorOffset,
          'paste',
          clipEvent,
          'insertFromPaste'
        )

        if (this.editable.config.defaultBehavior && prepared.blocks.length > 0) {
          const applied = clipboard.applyPaste(block, selection, prepared, this.editable.pasteRules)
          cursor = applied.cursor

          const target = clipEvent.target as HTMLElement
          if (target && endsWithSingleSpace(target.innerText)) {
            cursor.retainVisibleSelection(() => {
              block.innerHTML = replaceLast(block.innerHTML, '&nbsp;', ' ')
            })
          }
          pasteCommand = buildPasteCommand(
            block,
            prepared.blocks,
            cursor as Cursor,
            'paste',
            clipEvent,
            'insertFromPaste'
          )
        }

        if (prepared.blocks.length) {
          this.dispatchCommand(pasteCommand, { cursor: cursor as Cursor })
          this.inputCommandTracker.markStructuralChange(block)
          this.operationCapture.syncConfirmedState(block, this.selectionWatcher)
        } else {
          cursor.setVisibleSelection()
        }
      })
      .setupDocumentListener('input', function inputListener(this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const inputEvent = evt as InputEvent
        if (isBlockComposing(block, inputEvent)) return
        if (this.inputCommandTracker.shouldSuppressChange(block)) return

        const target = evt.target as HTMLElement
        const quotesConfig = shouldApplySmartQuotes(this.config, target)
          ? {
              quotes: this.config.quotes as QuotePair | string[],
              singleQuotes: this.config.singleQuotes as QuotePair | string[]
            }
          : undefined

        if (
          this.operationCapture.commitTextInput(
            this.notify,
            block,
            this.selectionWatcher,
            inputEvent,
            quotesConfig
          )
        ) {
          return
        }

        this.notify('change', block, {
          source: 'keyboard',
          inputType: inputEvent.inputType
        })
      })
      .setupDocumentListener(
        'formatEditable',
        function formatEditableListener(this: Dispatcher, evt: Event) {
          const block = this.getEditableBlockByEvent(evt)
          if (!block) return
          this.notify('change', block, { source: 'keyboard' })
        }
      )
  }

  dispatchSwitchEvent(event: KeyboardEvent, element: HTMLElement, direction: 'up' | 'down'): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const cursor = this.selectionWatcher.getFreshSelection()
    if (!cursor || cursor.isSelection) return

    if (!this.switchContext) {
      this.switchContext = {
        positionX: cursor.getBoundingClientRect().left,
        events: ['cursor']
      }
    } else {
      this.switchContext.events = ['cursor']
    }

    if (direction === 'up' && cursor.isAtFirstLine()) {
      event.preventDefault()
      event.stopPropagation()
      this.switchContext.events = ['switch', 'blur', 'focus', 'cursor']
      this.notify('switch', element, direction, cursor)
    }

    if (direction === 'down' && cursor.isAtLastLine()) {
      event.preventDefault()
      event.stopPropagation()
      this.switchContext.events = ['switch', 'blur', 'focus', 'cursor']
      this.notify('switch', element, direction, cursor)
    }
  }

  setupKeydownListener() {
    this.setupDocumentListener(
      'keydown',
      function (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const keyEvent = evt as KeyboardEvent

        this.keyboard.dispatchKeyEvent(keyEvent, block, false, {
          skipEditing: isEditingSuppressed(block, keyEvent),
          shouldSuppressKeydown: (command) =>
            this.inputCommandTracker.shouldSuppressKeydown(block, command)
        })
      },
      true
    )
  }

  private keyboardHandler(
    fn: (block: HTMLElement, event: KeyboardEvent) => void
  ): EventHandler<HTMLElement, [KeyboardEvent]> {
    return function (this: HTMLElement, event: KeyboardEvent) {
      fn(this, event)
    }
  }

  private keyboardBlockHandler(fn: (block: HTMLElement) => void): EventHandler<HTMLElement, []> {
    return function (this: HTMLElement) {
      fn(this)
    }
  }

  setupKeyboardEvents() {
    this.keyboard
      .on(
        'up',
        this.keyboardHandler((block, event) => {
          this.dispatchSwitchEvent(event, block, 'up')
        })
      )
      .on(
        'down',
        this.keyboardHandler((block, event) => {
          this.dispatchSwitchEvent(event, block, 'down')
        })
      )
      .on(
        'backspace',
        this.keyboardHandler((block, event) => {
          this.handleBackspace(block, event, 'keyboard')
        })
      )
      .on(
        'delete',
        this.keyboardHandler((block, event) => {
          this.handleDelete(block, event, 'keyboard')
        })
      )
      .on(
        'enter',
        this.keyboardHandler((block, event) => {
          this.handleEnter(block, event, 'keyboard')
        })
      )
      .on(
        'shiftEnter',
        this.keyboardHandler((block, event) => {
          this.handleShiftEnter(block, event, 'keyboard')
        })
      )
      .on(
        'bold',
        this.keyboardHandler((block, event) => {
          this.handleBold(block, event, 'keyboard')
        })
      )
      .on(
        'italic',
        this.keyboardHandler((block, event) => {
          this.handleItalic(block, event, 'keyboard')
        })
      )
      .on(
        'character',
        this.keyboardBlockHandler(() => {})
      )
  }

  notifySelectionBoundary(cursor: Cursor | Selection | undefined, evt: Event): void {
    if (!cursor?.isSelection) return

    if (cursor.isAtBeginning() && cursor.isAtEnd()) {
      this.notify('selectToBoundary', cursor.host, evt, 'both')
    } else if (cursor.isAtBeginning()) {
      this.notify('selectToBoundary', cursor.host, evt, 'start')
    } else if (cursor.isAtEnd()) {
      this.notify('selectToBoundary', cursor.host, evt, 'end')
    }
  }

  setupSelectionChangeListeners() {
    let selectionDirty = false
    let suppressSelectionChanges = false
    const selectionWatcher = this.selectionWatcher

    const processSelectionChange = (evt: Event) => {
      const rangeContainer = selectionWatcher.getFreshRange()
      if (!rangeContainer.host && !selectionWatcher.currentRange?.host) return

      const cursor = selectionWatcher.getSelectionFromRangeContainer(rangeContainer)
      this.notifySelectionBoundary(cursor, evt)

      if (suppressSelectionChanges) {
        selectionDirty = true
      } else {
        selectionWatcher.selectionChanged(rangeContainer)
      }
    }

    let selectionChangeQueued = false
    let queuedSelectionEvent: Event | undefined
    const queueSelectionChange = (evt: Event) => {
      queuedSelectionEvent = evt
      if (selectionChangeQueued) return

      selectionChangeQueued = true
      const flushSelectionChange = () => {
        selectionChangeQueued = false
        const queuedEvent = queuedSelectionEvent || evt
        queuedSelectionEvent = undefined
        processSelectionChange(queuedEvent)
      }

      const queueMicrotask = this.document.defaultView?.queueMicrotask || globalThis.queueMicrotask
      if (queueMicrotask) {
        queueMicrotask.call(this.document.defaultView || globalThis, flushSelectionChange)
      } else {
        Promise.resolve().then(flushSelectionChange)
      }
    }

    const updateSelectionAfterMouseDown = () => {
      const rangeContainer = selectionWatcher.getFreshRange()
      if (!rangeContainer.host && !selectionWatcher.currentRange?.host) return
      selectionWatcher.selectionChanged(rangeContainer)
    }

    this.setupDocumentListener('selectionchange', queueSelectionChange)

    this.setupDocumentListener('mousedown', function (this: Dispatcher, evt: Event) {
      if (!this.getEditableBlockByEvent(evt)) return
      if (this.config.mouseMoveSelectionChanges === false) {
        suppressSelectionChanges = true
        setTimeout(updateSelectionAfterMouseDown, 0)
      }

      this.document.addEventListener(
        'mouseup',
        () => {
          suppressSelectionChanges = false

          if (selectionDirty) {
            selectionDirty = false
            selectionWatcher.selectionChanged()
          }
        },
        {
          capture: true,
          once: true
        } as AddEventListenerOptions
      )
    })
  }

  setupSelectionChangeFallbackListeners() {
    this.setupDocumentListener('mouseup', (evt: Event) => {
      setTimeout(() => {
        const cursor = this.selectionWatcher.selectionChanged()
        this.notifySelectionBoundary(cursor, evt)
      }, 0)
    })

    this.setupDocumentListener('keyup', (evt: Event) => {
      if (!this.getEditableBlockByEvent(evt)) return
      const cursor = this.selectionWatcher.selectionChanged()
      this.notifySelectionBoundary(cursor, evt)
    })
  }
}

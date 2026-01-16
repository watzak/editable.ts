import {selectionchange} from './feature-detection.js'
import * as clipboard from './clipboard.js'
import * as content from './content.js'
import eventable from './eventable.js'
import SelectionWatcher from './selection-watcher.js'
import config from './config.js'
import Keyboard from './keyboard.js'
import {closest} from './util/dom.js'
import {replaceLast, endsWithSingleSpace} from './util/string.js'
import {applySmartQuotes, shouldApplySmartQuotes} from './smartQuotes.js'
import type {Editable} from './core.js'

/**
 * The Dispatcher module is responsible for dealing with events and their handlers.
 *
 * @module core
 * @submodule dispatcher
 */
export default class Dispatcher {
  public document: Document
  public config: any
  public editable: Editable
  public editableSelector: string
  public selectionWatcher: SelectionWatcher
  public keyboard: Keyboard
  public activeListeners: Array<{event: string, listener: EventListener, capture: boolean}>
  public suspended?: boolean
  public switchContext?: {
    events: string[]
    positionX?: number
  }
  public getEditableBlockByEvent: (evt: Event) => HTMLElement | undefined
  public notify!: (event: string, ...args: any[]) => void
  public off!: (...args: any[]) => void
  public on!: (event: string, handler: (...args: any[]) => any) => this | ((events: Record<string, (...args: any[]) => any>) => this)

  constructor (editable: Editable) {
    const win = editable.win
    eventable(this, editable)
    this.document = win.document
    this.config = editable.config
    this.editable = editable
    this.editableSelector = editable.editableSelector
    this.selectionWatcher = new SelectionWatcher(this, win)
    this.keyboard = new Keyboard(this.selectionWatcher)
    this.activeListeners = []
    this.setup()
    this.getEditableBlockByEvent = (evt: Event) => {
      const target = evt.target as Node
      return target ? closest(target, editable.editableSelector) : undefined
    }
  }

  setupDocumentListener (event: string, func: (evt: Event) => void, capture: boolean = false): this {
    const listener = {event, listener: func.bind(this) as EventListener, capture}
    this.activeListeners.push(listener)

    this.document.addEventListener(event, listener.listener, capture)
    return this
  }

  /**
  * Sets up all events that Editable.JS is catching.
  *
  * @method setup
  */
  setup () {
    // setup all events listeners and keyboard handlers
    this.setupKeyboardEvents()
    this.setupEventListeners()
  }

  unload () {
    this.off()
    for (const l of this.activeListeners) {
      this.document.removeEventListener(l.event, l.listener, l.capture)
    }
    this.activeListeners.length = 0
  }

  suspend () {
    if (this.suspended) return
    this.suspended = true
    for (const l of this.activeListeners) {
      this.document.removeEventListener(l.event, l.listener, l.capture)
    }
    this.activeListeners.length = 0
  }

  continue () {
    if (!this.suspended) return
    this.suspended = false
    this.setupEventListeners()
  }

  setupEventListeners () {
    this.setupElementListeners()
    this.setupKeydownListener()

    if (selectionchange) {
      this.setupSelectionChangeListeners()
    } else {
      this.setupSelectionChangeFallbackListeners()
    }
  }

  /**
  * Sets up events that are triggered on modifying an element.
  *
  * @method setupElementListeners
  */
  setupElementListeners () {
    const currentInput: {offset?: number} = {offset: undefined}
    this
      .setupDocumentListener('focus', function focusListener (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const target = evt.target as HTMLElement
        if (target && target.getAttribute(config.pastingAttribute)) return
        this.selectionWatcher.syncSelection()
        this.notify('focus', block)
      }, true)
      .setupDocumentListener('blur', function blurListener (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        if (block.getAttribute(config.pastingAttribute)) return
        this.notify('blur', block)
      }, true)
      .setupDocumentListener('copy', function copyListener (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const selection = this.selectionWatcher.getFreshSelection()
        if (selection && selection.isSelection) {
          this.notify('clipboard', block, 'copy', selection)
        }
      })
      .setupDocumentListener('cut', function cutListener (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        const selection = this.selectionWatcher.getFreshSelection()
        if (selection && selection.isSelection) {
          this.notify('clipboard', block, 'cut', selection)
        }
      })
      .setupDocumentListener('paste', function pasteListener (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return

        const clipEvent = evt as ClipboardEvent
        clipEvent.preventDefault()
        const selection = this.selectionWatcher.getFreshSelection()
        if (!selection || !clipEvent.clipboardData) return
        const clipboardContent = clipEvent.clipboardData.getData('text/html') || clipEvent.clipboardData.getData('text/plain')

        const {blocks, cursor} = clipboard.paste(block, selection, clipboardContent)
        if (blocks.length) {
          const target = clipEvent.target as HTMLElement
          if (target && endsWithSingleSpace(target.innerText)) {
            cursor.retainVisibleSelection(() => {
              block.innerHTML = replaceLast(block.innerHTML, '&nbsp;', ' ')
            })
          }
          this.notify('paste', block, blocks, cursor)
          // The input event does not fire when we process the content manually
          // and insert it via script
          this.notify('change', block)
        } else {
          cursor.setVisibleSelection()
        }
      })
      .setupDocumentListener('input', function inputListener (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return

        const target = evt.target as HTMLElement
        if (target && shouldApplySmartQuotes(this.config, target)) {
          const selection = this.selectionWatcher.getFreshSelection()
          if (!selection || !selection.range) return
          // Save offset of new input, to reset cursor correctly after timeout delay
          currentInput.offset = selection.range.startOffset
          const inputEvent = evt as InputEvent
          const quotesConfig = this.config.quotes || {quotes: [], singleQuotes: []}
          setTimeout(() => {
            if (inputEvent.data) {
              applySmartQuotes(selection.range!, quotesConfig, inputEvent.data, target, currentInput.offset)
            }
          }, 300
          )
        }

        this.notify('change', block)
      })

      .setupDocumentListener('formatEditable', function formatEditableListener (this: Dispatcher, evt: Event) {
        const block = this.getEditableBlockByEvent(evt)
        if (!block) return
        this.notify('change', block)
      })
  }

  dispatchSwitchEvent (event: KeyboardEvent, element: HTMLElement, direction: 'up' | 'down'): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const cursor = this.selectionWatcher.getFreshSelection()
    if (!cursor || cursor.isSelection) return

    // store position
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

  /**
  * Sets up listener for keydown event which forwards events to
  * the Keyboard instance.
  *
  * @method setupKeydownListener
  */
  setupKeydownListener () {
    this.setupDocumentListener('keydown', function (this: Dispatcher, evt: Event) {
      const block = this.getEditableBlockByEvent(evt)
      if (!block) return
      const keyEvent = evt as KeyboardEvent
      this.keyboard.dispatchKeyEvent(keyEvent, block, false)
    }, true)
  }

  /**
  * Sets up handlers for the keyboard events.
  * Keyboard definitions are in {{#crossLink "Keyboard"}}{{/crossLink}}.
  *
  * @method setupKeyboardEvents
  */
  setupKeyboardEvents () {
    const self = this

    this.keyboard
      .on('up', function (this: HTMLElement, event: KeyboardEvent) {
        self.dispatchSwitchEvent(event, this, 'up')
      })

      .on('down', function (this: HTMLElement, event: KeyboardEvent) {
        self.dispatchSwitchEvent(event, this, 'down')
      })

      .on('backspace', function (this: HTMLElement, event: KeyboardEvent) {
        const editableBlock = this as HTMLElement
        const rangeContainer = self.selectionWatcher.getFreshRange()
        if (!rangeContainer.isCursor) return

        const cursor = rangeContainer.getCursor()
        if (!cursor || !cursor.isAtBeginning()) return

        event.preventDefault()
        event.stopPropagation()
        self.notify('merge', editableBlock, 'before', cursor)
      })

      .on('delete', function (this: HTMLElement, event: KeyboardEvent) {
        const editableBlock = this as HTMLElement
        const rangeContainer = self.selectionWatcher.getFreshRange()
        if (!rangeContainer.isCursor) return

        const cursor = rangeContainer.getCursor()
        if (!cursor || !cursor.isAtTextEnd()) return

        event.preventDefault()
        event.stopPropagation()
        self.notify('merge', editableBlock, 'after', cursor)
      })

      .on('enter', function (this: HTMLElement, event: KeyboardEvent) {
        const editableBlock = this as HTMLElement
        event.preventDefault()
        event.stopPropagation()
        const rangeContainer = self.selectionWatcher.getFreshRange()
        const cursor = rangeContainer.forceCursor()

        if (!cursor) return

        if (cursor.isAtTextEnd()) {
          self.notify('insert', editableBlock, 'after', cursor)
        } else if (cursor.isAtBeginning()) {
          self.notify('insert', editableBlock, 'before', cursor)
        } else {
          const beforeFragment = cursor.before()
          const afterFragment = cursor.after()
          self.notify('split', editableBlock, content.getInnerHtmlOfFragment(beforeFragment), content.getInnerHtmlOfFragment(afterFragment), cursor)
        }
      })

      .on('shiftEnter', function (this: HTMLElement, event: KeyboardEvent) {
        const editableBlock = this as HTMLElement
        event.preventDefault()
        event.stopPropagation()
        const cursor = self.selectionWatcher.forceCursor()
        if (cursor) {
          self.notify('newline', editableBlock, cursor)
        }
      })

      .on('bold', function (this: HTMLElement, event: KeyboardEvent) {
        event.preventDefault()
        event.stopPropagation()
        const selection = self.selectionWatcher.getFreshSelection()
        if (selection && selection.isSelection) {
          self.notify('toggleBold', selection)
        }
      })

      .on('italic', function (this: HTMLElement, event: KeyboardEvent) {
        event.preventDefault()
        event.stopPropagation()
        const selection = self.selectionWatcher.getFreshSelection()
        if (selection && selection.isSelection) {
          self.notify('toggleEmphasis', selection)
        }
      })

      .on('character', function (this: HTMLElement, event: KeyboardEvent) {
        const editableBlock = this as HTMLElement
        self.notify('change', editableBlock)
      })
  }

  /**
  * Sets up events that are triggered on a selection change.
  *
  * @method setupSelectionChangeListeners
  */
  setupSelectionChangeListeners () {
    let selectionDirty = false
    let suppressSelectionChanges = false
    const selectionWatcher = this.selectionWatcher

    // fires on mousemove (thats probably a bit too much)
    // catches changes like 'select all' from context menu
    this.setupDocumentListener('selectionchange', (evt: Event) => {
      let didSyncSelection = false
      let cursor = this.selectionWatcher.getFreshSelection()
      if (!cursor) {
        selectionWatcher.selectionChanged()
        didSyncSelection = true
        cursor = this.selectionWatcher.getSelection()
      }

      if (cursor && cursor.isSelection && cursor.isAtBeginning() && cursor.isAtEnd()) {
        this.notify('selectToBoundary', cursor.host, evt, 'both')
      } else if (cursor && cursor.isSelection && cursor.isAtBeginning()) {
        this.notify('selectToBoundary', cursor.host, evt, 'start')
      } else if (cursor && cursor.isSelection && cursor.isAtEnd()) {
        this.notify('selectToBoundary', cursor.host, evt, 'end')
      }

      if (suppressSelectionChanges) {
        selectionDirty = true
      } else if (!didSyncSelection) {
        selectionWatcher.selectionChanged()
      }
    })

    // listen for selection changes by mouse so we can
    // suppress the selectionchange event and only fire the
    // change event on mouseup
    this.setupDocumentListener('mousedown', function (this: Dispatcher, evt: Event) {
      const mouseEvent = evt as MouseEvent
      if (!this.getEditableBlockByEvent(evt)) return
      if (this.config.mouseMoveSelectionChanges === false) {
        suppressSelectionChanges = true

        // Without this timeout the previous selection is active
        // until the mouseup event (no. not good).
        setTimeout(() => selectionWatcher.selectionChanged(), 0)
      }

      const self = this
      this.document.addEventListener('mouseup', () => {
        suppressSelectionChanges = false

        if (selectionDirty) {
          selectionDirty = false
          selectionWatcher.selectionChanged()
        }
      }, {
        capture: true,
        once: true
      } as AddEventListenerOptions)
    })
  }

  /**
  * Fallback solution to support selection change events on browsers that don't
  * support selectionChange.
  *
  * @method setupSelectionChangeFallbackListeners
  */
  setupSelectionChangeFallbackListeners () {
    const notifySelectionBoundary = (evt: Event) => {
      const cursor = this.selectionWatcher.getFreshSelection()
      if (cursor && cursor.isSelection && cursor.isAtBeginning() && cursor.isAtEnd()) {
        this.notify('selectToBoundary', cursor.host, evt, 'both')
      } else if (cursor && cursor.isSelection && cursor.isAtBeginning()) {
        this.notify('selectToBoundary', cursor.host, evt, 'start')
      } else if (cursor && cursor.isSelection && cursor.isAtEnd()) {
        this.notify('selectToBoundary', cursor.host, evt, 'end')
      }
    }

    // listen for selection changes by mouse
    this.setupDocumentListener('mouseup', (evt: Event) => {
      // In Opera when clicking outside of a block
      // it does not update the selection as it should
      // without the timeout
      setTimeout(() => {
        this.selectionWatcher.selectionChanged()
        notifySelectionBoundary(evt)
      }, 0)
    })

    // listen for selection changes by keys
    this.setupDocumentListener('keyup', (evt: Event) => {
      if (!this.getEditableBlockByEvent(evt)) return
      // when pressing Command + Shift + Left for example the keyup is only triggered
      // after at least two keys are released. Strange. The culprit seems to be the
      // Command key. Do we need a workaround?
      this.selectionWatcher.selectionChanged()
      notifySelectionBoundary(evt)
    })
  }
}

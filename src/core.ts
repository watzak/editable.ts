import config from './config.js'
import error from './util/error.js'
import * as parser from './parser.js'
import * as block from './block.js'
import * as content from './content.js'
import * as clipboard from './clipboard.js'
import Dispatcher from './dispatcher.js'
import Cursor from './cursor.js'
import highlightSupport from './highlight-support.js'
import MonitoredHighlighting from './monitored-highlighting.js'
import createDefaultEvents from './create-default-events.js'
import {textNodesUnder, getTextNodeAndRelativeOffset} from './util/element.js'
import {binaryCursorSearch, BinaryCursorSearchResult} from './util/binary_search.js'
import {domArray, createRange, nodeContainsRange} from './util/dom.js'
import type {Config} from './config.js'

export interface EditableConfig {
  window?: Window
  defaultBehavior?: boolean
  mouseMoveSelectionChanges?: boolean
  browserSpellcheck?: boolean
}

export interface EnableOptions {
  normalize?: boolean
  plainText?: boolean
}

export type CursorPosition = 'beginning' | 'end' | 'before' | 'after'

export interface HighlightOptions {
  editableHost: HTMLElement
  text: string
  highlightId: string
  textRange?: {
    start: number
    end: number
  }
  raiseEvents?: boolean
  type?: string
}

export interface TextRange {
  start: number
  end: number
  text?: string
}

export type EditableEvent = 
  | 'focus' 
  | 'blur' 
  | 'flow' 
  | 'selection' 
  | 'cursor' 
  | 'newline'
  | 'insert' 
  | 'split' 
  | 'merge' 
  | 'empty' 
  | 'change' 
  | 'switch'
  | 'move' 
  | 'clipboard' 
  | 'paste' 
  | 'spellcheckUpdated' 
  | 'selectToBoundary'
  | 'init'

export class Editable {
  public config: Required<EditableConfig>
  public win: Window
  public editableSelector: string
  public dispatcher: Dispatcher
  public highlighting?: MonitoredHighlighting
  public spellcheck?: {
    checkSpelling: (elem: HTMLElement) => void
  }
  static parser: typeof parser
  static content: typeof content

  constructor(instanceConfig?: EditableConfig) {
    const defaultInstanceConfig: Required<EditableConfig> = {
      window: window,
      defaultBehavior: true,
      mouseMoveSelectionChanges: false,
      browserSpellcheck: true
    }

    this.config = Object.assign(defaultInstanceConfig, instanceConfig)
    this.win = this.config.window
    this.editableSelector = `.${config.editableClass}`

    this.dispatcher = new Dispatcher(this)
    if (this.config.defaultBehavior === true) {
      (this.dispatcher.on as any)(createDefaultEvents(this))
    }
  }

  static getGlobalConfig(): Config {
    return config
  }

  static globalConfig(globalConfig: Partial<Config>): void {
    Object.assign(config, globalConfig)
    clipboard.updateConfig(config)
  }

  add(target: HTMLElement | HTMLElement[] | string, options?: EnableOptions | boolean): this {
    this.enable(target, options)
    return this
  }

  remove(target: HTMLElement | HTMLElement[] | string): this {
    const targets = domArray(target, this.win.document)

    this.disable(targets)

    for (const element of targets) {
      element.classList.remove(config.editableDisabledClass)
    }

    return this
  }

  disable(target?: HTMLElement | HTMLElement[] | string): this {
    const targets = domArray(target || `.${config.editableClass}`, this.win.document)

    for (const element of targets) {
      block.disable(element)
    }

    return this
  }

  enable(target?: HTMLElement | HTMLElement[] | string, options?: EnableOptions | boolean): this {
    const opts = typeof options === 'boolean' ? {normalize: options} : (options ?? {})
    const {
      normalize = false,
      plainText = false
    } = opts
    const shouldSpellcheck = this.config.browserSpellcheck
    const targets = domArray(target || `.${config.editableDisabledClass}`, this.win.document)

    for (const element of targets) {
      block.init(element, {normalize, plainText, shouldSpellcheck})
      this.dispatcher.notify('init', element)
    }

    return this
  }

  suspend(target?: HTMLElement | HTMLElement[] | string): this {
    const targets = domArray(target || `.${config.editableClass}`, this.win.document)

    for (const element of targets) {
      element.removeAttribute('contenteditable')
    }

    this.dispatcher.suspend()
    return this
  }

  continue(target?: HTMLElement | HTMLElement[] | string): this {
    const targets = domArray(target || `.${config.editableClass}`, this.win.document)

    for (const element of targets) {
      element.setAttribute('contenteditable', 'true')
    }

    this.dispatcher.continue()
    return this
  }

  createCursor(element: HTMLElement, position: CursorPosition = 'beginning'): Cursor | undefined {
    const host = Cursor.findHost(element, this.editableSelector)
    if (!host) return undefined

    const range = createRange(this.win)

    if (position === 'beginning' || position === 'end') {
      range.selectNodeContents(element)
      range.collapse(position === 'beginning')
    } else if (element !== host) {
      if (position === 'before') {
        range.setStartBefore(element)
        range.setEndBefore(element)
      } else if (position === 'after') {
        range.setStartAfter(element)
        range.setEndAfter(element)
      }
    } else {
      error('EditableJS: cannot create cursor outside of an editable block.')
    }

    return new Cursor(host, range)
  }

  createCursorAtCharacterOffset({element, offset}: {element: HTMLElement, offset: number}): Cursor {
    const textNodes = textNodesUnder(element)
    const {node, relativeOffset} = getTextNodeAndRelativeOffset({textNodes, absOffset: offset})
    if (!node) throw new Error('Could not find text node for offset')
    const newRange = createRange(this.win)
    newRange.setStart(node, relativeOffset)
    newRange.collapse(true)

    const host = Cursor.findHost(element, this.editableSelector)
    if (!host) throw new Error('No editable host found')
    const nextCursor = new Cursor(host, newRange)

    nextCursor.setVisibleSelection()
    return nextCursor
  }

  createCursorAtBeginning(element: HTMLElement): Cursor | undefined {
    return this.createCursor(element, 'beginning')
  }

  createCursorAtEnd(element: HTMLElement): Cursor | undefined {
    return this.createCursor(element, 'end')
  }

  createCursorBefore(element: HTMLElement): Cursor | undefined {
    return this.createCursor(element, 'before')
  }

  createCursorAfter(element: HTMLElement): Cursor | undefined {
    return this.createCursor(element, 'after')
  }

  getContent(element: HTMLElement | DocumentFragment): string {
    return content.extractContent(element)
  }

  appendTo(inputElement: HTMLElement | string, contentToAppend: string | DocumentFragment): Cursor {
    const element = content.adoptElement(inputElement, this.win.document)

    const cursor = this.createCursor(element, 'end')
    if (!cursor) throw new Error('Could not create cursor')
    cursor.insertAfter(typeof contentToAppend === 'string'
      ? content.createFragmentFromString(contentToAppend)
      : contentToAppend
    )
    return cursor
  }

  prependTo(inputElement: HTMLElement | string, contentToPrepend: string | DocumentFragment): Cursor {
    const element = content.adoptElement(inputElement, this.win.document)

    const cursor = this.createCursor(element, 'beginning')
    if (!cursor) throw new Error('Could not create cursor')
    cursor.insertBefore(typeof contentToPrepend === 'string'
      ? content.createFragmentFromString(contentToPrepend)
      : contentToPrepend
    )
    return cursor
  }

  getSelection(editableHost?: HTMLElement): Cursor | any | undefined {
    const selection = this.dispatcher.selectionWatcher.getFreshSelection()
    if (!editableHost || !selection) return selection

    const range = selection.range

    if (editableHost?.isConnected && nodeContainsRange(editableHost, range)) {
      return selection
    }
    return undefined
  }

  setupHighlighting(hightlightingConfig: any): this {
    this.highlighting = new MonitoredHighlighting(this, hightlightingConfig, undefined)
    return this
  }

  setupSpellcheck(conf: any): this {
    let marker: string | undefined

    if (conf.markerNode) {
      marker = conf.markerNode.outerHTML
    }

    this.setupHighlighting({
      throttle: conf.throttle,
      spellcheck: {
        marker: marker,
        spellcheckService: conf.spellcheckService
      }
    })

    this.spellcheck = {
      checkSpelling: (elem: HTMLElement) => {
        this.highlighting?.highlight(elem)
      }
    }
    return this
  }

  highlight({editableHost, text, highlightId, textRange, raiseEvents, type = 'comment'}: HighlightOptions): number {
    if (!textRange) {
      const result = highlightSupport.highlightText(editableHost, text, highlightId, type, raiseEvents ? this.dispatcher : undefined, this.win)
      return result || -1
    }
    if (typeof textRange.start !== 'number' || typeof textRange.end !== 'number') {
      error(
        'Error in Editable.highlight: You passed a textRange object with invalid keys. Expected shape: { start: Number, end: Number }'
      )
      return -1
    }
    if (textRange.start === textRange.end) {
      error(
        'Error in Editable.highlight: You passed a textRange object with equal start and end offsets, which is considered a cursor and therefore unfit to create a highlight.'
      )
      return -1
    }
    return highlightSupport.highlightRange(editableHost, text, highlightId, textRange.start, textRange.end, raiseEvents ? this.dispatcher : undefined, this.win, type)
  }

  getHighlightPositions({editableHost, type}: {editableHost: HTMLElement, type?: string}): Record<string, TextRange> {
    const result = highlightSupport.extractHighlightedRanges(
      editableHost,
      type
    )
    if (!result) return {}
    // Convert the result to TextRange format (without nativeRange)
    const textRanges: Record<string, TextRange> = {}
    for (const highlightId in result) {
      const {start, end, text} = result[highlightId]
      textRanges[highlightId] = {start, end, text}
    }
    return textRanges
  }

  removeHighlight({editableHost, highlightId, raiseEvents}: {editableHost: HTMLElement, highlightId: string, raiseEvents?: boolean}): void {
    highlightSupport.removeHighlight(editableHost, highlightId, raiseEvents ? this.dispatcher : undefined)
  }

  decorateHighlight({editableHost, highlightId, addCssClass, removeCssClass}: {editableHost: HTMLElement, highlightId: string, addCssClass?: string, removeCssClass?: string}): void {
    highlightSupport.updateHighlight(editableHost, highlightId, addCssClass, removeCssClass)
  }

  on(event: EditableEvent, handler: (...args: any[]) => any): this {
    this.dispatcher.on(event, handler)
    return this
  }

  off(...args: any[]): this {
    this.dispatcher.off.apply(this.dispatcher, args)
    return this
  }

  unload(): this {
    this.dispatcher.unload()
    return this
  }

  findClosestCursorOffset({
    element,
    origCoordinates,
    requiredOnFirstLine = false,
    requiredOnLastLine = false
  }: {
    element: HTMLElement
    origCoordinates: DOMRect
    requiredOnFirstLine?: boolean
    requiredOnLastLine?: boolean
  }): BinaryCursorSearchResult {
    const positionX: number = this.dispatcher.switchContext && this.dispatcher.switchContext.positionX !== undefined
      ? this.dispatcher.switchContext.positionX
      : origCoordinates.left

    return binaryCursorSearch({
      host: element,
      requiredOnFirstLine,
      requiredOnLastLine,
      positionX
    })
  }
}

// Expose modules and editable
Editable.parser = parser
Editable.content = content

// Set up callback functions for several events.
const eventNames: EditableEvent[] = ['focus', 'blur', 'flow', 'selection', 'cursor', 'newline',
  'insert', 'split', 'merge', 'empty', 'change', 'switch',
  'move', 'clipboard', 'paste', 'spellcheckUpdated', 'selectToBoundary']

eventNames.forEach((name) => {
  // Generate a callback function to subscribe to an event.
  (Editable.prototype as any)[name] = function (handler: (...args: any[]) => any) {
    return this.on(name, handler)
  }
})


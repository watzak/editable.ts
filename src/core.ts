import config from './config.js'
import type { Config, PastedHtmlRules } from './config.js'
import error from './util/error.js'
import * as parser from './parser.js'
import * as block from './block.js'
import * as content from './content.js'
import * as clipboard from './clipboard.js'
import Dispatcher from './dispatcher.js'
import Cursor from './cursor.js'
import createDefaultEvents from './create-default-events.js'
import { applyOperationsForEditable, getOperationRemoteQueue } from './apply-operations.js'
import { createOperationRange } from './operation-offset.js'
import type { ApplyOperationsOptions } from './operation-apply.js'
import type { ApplyOperationsResult } from './operation-apply.js'
import { binaryCursorSearch, BinaryCursorSearchResult } from './util/binary_search.js'
import { domArray, createRange, nodeContainsRange } from './util/dom.js'
import { cloneDeep } from './util/clone-deep.js'
import { deepMerge } from './util/merge.js'
import { requireBrowserWindow } from './util/browser-globals.js'
import { claimBlock, releaseBlock, isBlockOwnedBy } from './instance-registry.js'
import { compilePasteRules, type PasteRules } from './paste-rules.js'
import type { SmartQuotesConfig } from './smartQuotes.js'
import type {
  EditableEvent,
  EditableEventHandler,
  EditableEventMap,
  EventOff
} from './event-types.js'
export type {
  HighlightOptions,
  MonitoredHighlightingConfig,
  SpellcheckSetupConfig,
  TextDiffOptions,
  TextRange
} from './plugin-types.js'
export type {
  CharacterOffsetRange,
  ChangeDetails,
  CommandCursorPayload,
  CommandSelectionPayload,
  CommandSource,
  EditableCommand,
  FormatCommand,
  InsertBlockCommand,
  InsertLineBreakCommand,
  InputChangeCommand,
  MergeBlockCommand,
  PasteCommand,
  SplitBlockCommand,
  StructuralCommand
} from './command-types.js'
export type {
  DeleteTextOperation,
  EditableOperation,
  EditableOperationBatch,
  InsertTextOperation,
  JsonValue,
  OperationBatchOrigin,
  OperationSource,
  ReplaceTextOperation,
  SelectionDirection,
  SelectionSnapshot,
  SerializableOperationBatch,
  SetTextAttributesOperation,
  TextAttributes
} from './operation-types.js'
export { OPERATION_LINE_BREAK } from './operation-types.js'
export { CommandContext } from './command-context.js'
export { OperationContext } from './operation-context.js'
export {
  getHostTextOffset,
  buildCommandCursor,
  buildCommandSelection,
  buildInputChangeCommand
} from './command-builder.js'
export { dispatchEditableOperations } from './operation-pipeline.js'
export type { DispatchOperationOptions } from './operation-pipeline.js'
export { OperationValidationError } from './apply-operations.js'
export type { ApplyOperationsOptions, ApplyOperationsResult } from './operation-apply.js'

export interface EditableConfig {
  window?: Window
  defaultBehavior?: boolean
  mouseMoveSelectionChanges?: boolean
  browserSpellcheck?: boolean
  smartQuotes?: boolean
  quotes?: SmartQuotesConfig['quotes']
  singleQuotes?: SmartQuotesConfig['singleQuotes']
  pastedHtmlRules?: Partial<PastedHtmlRules>
}

export interface EnableOptions {
  normalize?: boolean
  plainText?: boolean
}

export type CursorPosition = 'beginning' | 'end' | 'before' | 'after'

function adoptBlockElement(element: HTMLElement, doc: Document): HTMLElement {
  if (element.ownerDocument === doc) return element
  return doc.adoptNode(element) as HTMLElement
}

export class Editable {
  public config: Required<Omit<EditableConfig, 'pastedHtmlRules'>>
  public globalSettings: Config
  public pasteRules: PasteRules
  public win: Window
  public editableSelector: string
  public dispatcher: Dispatcher
  private registeredBlocks = new Set<HTMLElement>()
  static parser: typeof parser
  static content: typeof content

  constructor(instanceConfig?: EditableConfig) {
    const defaultInstanceConfig: Omit<
      Required<Omit<EditableConfig, 'pastedHtmlRules'>>,
      'window'
    > = {
      defaultBehavior: true,
      mouseMoveSelectionChanges: false,
      browserSpellcheck: true,
      smartQuotes: false,
      quotes: [],
      singleQuotes: []
    }

    this.config = Object.assign(defaultInstanceConfig, instanceConfig) as Required<
      Omit<EditableConfig, 'pastedHtmlRules'>
    >
    this.win = instanceConfig?.window ?? requireBrowserWindow()
    this.config.window = this.win
    this.globalSettings = cloneDeep(config)
    if (instanceConfig?.pastedHtmlRules) {
      this.globalSettings.pastedHtmlRules = deepMerge(
        this.globalSettings.pastedHtmlRules,
        instanceConfig.pastedHtmlRules
      )
    }
    this.pasteRules = compilePasteRules(this.globalSettings)
    this.editableSelector = `.${this.globalSettings.editableClass}`

    this.dispatcher = new Dispatcher(this)
    if (this.config.defaultBehavior === true) {
      this.dispatcher.on(createDefaultEvents(this))
    }
  }

  static getGlobalConfig(): Config {
    return cloneDeep(config)
  }

  static globalConfig(globalConfig: Partial<Config>): void {
    const merged = deepMerge(cloneDeep(config), globalConfig)
    Object.assign(config, merged)
    clipboard.updateConfig(config)
  }

  ownsBlock(element: HTMLElement): boolean {
    return isBlockOwnedBy(element, this)
  }

  private claimBlock(element: HTMLElement): void {
    const previousOwner = claimBlock(element, this)
    if (previousOwner && previousOwner !== this) {
      previousOwner.releaseOwnedBlock(element)
    }
    this.registeredBlocks.add(element)
  }

  releaseOwnedBlock(element: HTMLElement): void {
    releaseBlock(element, this)
    this.registeredBlocks.delete(element)
  }

  private ownedTargets(
    target: HTMLElement | HTMLElement[] | string | undefined,
    className: string
  ): HTMLElement[] {
    if (target) {
      return domArray(target, this.win.document).filter((element) => this.ownsBlock(element))
    }

    return [...this.registeredBlocks].filter((element) => element.classList.contains(className))
  }

  add(target: HTMLElement | HTMLElement[] | string, options?: EnableOptions | boolean): this {
    this.enable(target, options)
    return this
  }

  remove(target: HTMLElement | HTMLElement[] | string): this {
    const targets = domArray(target, this.win.document).filter((element) => this.ownsBlock(element))

    this.disable(targets)

    for (const element of targets) {
      element.classList.remove(this.globalSettings.editableDisabledClass)
      this.releaseOwnedBlock(element)
    }

    return this
  }

  disable(target?: HTMLElement | HTMLElement[] | string): this {
    const targets = this.ownedTargets(target, this.globalSettings.editableClass)

    for (const element of targets) {
      block.disable(element)
    }

    return this
  }

  enable(target?: HTMLElement | HTMLElement[] | string, options?: EnableOptions | boolean): this {
    const opts = typeof options === 'boolean' ? { normalize: options } : (options ?? {})
    const { normalize = false, plainText = false } = opts
    const shouldSpellcheck = this.config.browserSpellcheck
    const targets = target
      ? domArray(target, this.win.document)
      : [...this.registeredBlocks].filter((element) =>
          element.classList.contains(this.globalSettings.editableDisabledClass)
        )

    for (const element of targets) {
      const blockElement = adoptBlockElement(element, this.win.document)
      this.claimBlock(blockElement)
      block.init(blockElement, { normalize, plainText, shouldSpellcheck })
      this.dispatcher.notify('init', blockElement)
    }

    return this
  }

  suspend(target?: HTMLElement | HTMLElement[] | string): this {
    const targets = this.ownedTargets(target, this.globalSettings.editableClass)

    for (const element of targets) {
      element.removeAttribute('contenteditable')
    }

    this.dispatcher.suspend()
    return this
  }

  continue(target?: HTMLElement | HTMLElement[] | string): this {
    const targets = this.ownedTargets(target, this.globalSettings.editableDisabledClass)

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

  createCursorAtCharacterOffset({
    element,
    offset
  }: {
    element: HTMLElement
    offset: number
  }): Cursor {
    const host = Cursor.findHost(element, this.editableSelector)
    if (!host) throw new Error('No editable host found')
    const newRange = createOperationRange(host, offset, offset)
    const nextCursor = new Cursor(host, newRange)
    nextCursor.setVisibleSelection()
    return nextCursor
  }

  /**
   * Applies an external operation batch atomically to a host block.
   * Foundation for remote/Yjs adapters — not a full collaboration layer.
   */
  applyOperations(
    host: HTMLElement,
    batch: import('./operation-types.js').EditableOperationBatch,
    options?: ApplyOperationsOptions
  ): ApplyOperationsResult {
    return applyOperationsForEditable(this, host, batch, options)
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
    cursor.insertAfter(
      typeof contentToAppend === 'string'
        ? content.createFragmentFromString(contentToAppend, this.win.document)
        : contentToAppend
    )
    return cursor
  }

  prependTo(
    inputElement: HTMLElement | string,
    contentToPrepend: string | DocumentFragment
  ): Cursor {
    const element = content.adoptElement(inputElement, this.win.document)

    const cursor = this.createCursor(element, 'beginning')
    if (!cursor) throw new Error('Could not create cursor')
    cursor.insertBefore(
      typeof contentToPrepend === 'string'
        ? content.createFragmentFromString(contentToPrepend, this.win.document)
        : contentToPrepend
    )
    return cursor
  }

  getSelection(editableHost?: HTMLElement): Cursor | import('./selection.js').default | undefined {
    const selection = this.dispatcher.selectionWatcher.getFreshSelection()
    if (!editableHost || !selection) return selection

    const range = selection.range

    if (editableHost?.isConnected && nodeContainsRange(editableHost, range)) {
      return selection
    }
    return undefined
  }

  on<TEventName extends EditableEvent>(
    event: TEventName,
    handler: EditableEventHandler<TEventName>
  ): this {
    this.dispatcher.on(event, handler)
    return this
  }

  off: EventOff<EditableEventMap, Editable> = ((
    ...args: Parameters<EventOff<EditableEventMap, Editable>>
  ) => {
    this.dispatcher.off(...args)
    return this
  }) as EventOff<EditableEventMap, Editable>

  unload(): this {
    for (const element of this.registeredBlocks) {
      getOperationRemoteQueue().clear(element)
      releaseBlock(element, this)
    }
    this.registeredBlocks.clear()
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
    const positionX: number =
      this.dispatcher.switchContext && this.dispatcher.switchContext.positionX !== undefined
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

/** Typed `editable.eventName(handler)` convenience subscriptions. */
export interface EditableEventConvenienceMethods {
  focus(handler: EditableEventHandler<'focus'>): Editable
  blur(handler: EditableEventHandler<'blur'>): Editable
  flow(handler: EditableEventHandler<'flow'>): Editable
  selection(handler: EditableEventHandler<'selection'>): Editable
  cursor(handler: EditableEventHandler<'cursor'>): Editable
  newline(handler: EditableEventHandler<'newline'>): Editable
  insert(handler: EditableEventHandler<'insert'>): Editable
  split(handler: EditableEventHandler<'split'>): Editable
  merge(handler: EditableEventHandler<'merge'>): Editable
  empty(handler: EditableEventHandler<'empty'>): Editable
  change(handler: EditableEventHandler<'change'>): Editable
  beforeCommand(handler: EditableEventHandler<'beforeCommand'>): Editable
  command(handler: EditableEventHandler<'command'>): Editable
  beforeOperation(handler: EditableEventHandler<'beforeOperation'>): Editable
  operation(handler: EditableEventHandler<'operation'>): Editable
  switch(handler: EditableEventHandler<'switch'>): Editable
  move(handler: EditableEventHandler<'move'>): Editable
  clipboard(handler: EditableEventHandler<'clipboard'>): Editable
  paste(handler: EditableEventHandler<'paste'>): Editable
  toggleBold(handler: EditableEventHandler<'toggleBold'>): Editable
  toggleEmphasis(handler: EditableEventHandler<'toggleEmphasis'>): Editable
  spellcheckUpdated(handler: EditableEventHandler<'spellcheckUpdated'>): Editable
  selectToBoundary(handler: EditableEventHandler<'selectToBoundary'>): Editable
  init(handler: EditableEventHandler<'init'>): Editable
}

export interface Editable extends EditableEventConvenienceMethods {}

// Expose modules and editable
Editable.parser = parser
Editable.content = content

// Set up callback functions for several events.
const eventNames: EditableEvent[] = [
  'focus',
  'blur',
  'flow',
  'selection',
  'cursor',
  'newline',
  'insert',
  'split',
  'merge',
  'empty',
  'change',
  'beforeCommand',
  'command',
  'beforeOperation',
  'operation',
  'switch',
  'move',
  'clipboard',
  'paste',
  'toggleBold',
  'toggleEmphasis',
  'spellcheckUpdated',
  'selectToBoundary',
  'init'
]

eventNames.forEach((name) => {
  // Generate a callback function to subscribe to an event.
  Object.defineProperty(Editable.prototype, name, {
    value: function (handler: EditableEventHandler<typeof name>) {
      return this.on(name, handler)
    }
  })
})

import { createRange, containsRange } from './util/dom.js'
import { getWindowFeatures } from './feature-detection.js'
import * as nodeType from './node-type.js'
import eventable from './eventable.js'
import {
  isImeFallbackKey,
  resolveCharacterAction,
  resolveEditingAction,
  resolveNavigationAction,
  type KeyAction
} from './input-normalizer.js'
import type { TrackedInputCommand } from './input-command-tracker.js'
import type SelectionWatcher from './selection-watcher.js'
import type { EventNotify, EventOff, EventOn, KeyboardEventMap } from './event-types.js'

// Legacy test access for key codes used in older specs.
export const keyboardLegacyKeyCodes = {
  left: 37,
  up: 38,
  right: 39,
  down: 40,
  tab: 9,
  esc: 27,
  backspace: 8,
  delete: 46,
  enter: 13,
  shift: 16,
  ctrl: 17,
  alt: 18,
  b: 66,
  i: 73
} as const

export interface DispatchKeyEventOptions {
  skipEditing?: boolean
  shouldSuppressKeydown?: (command: TrackedInputCommand) => boolean
}

/**
 * The Keyboard module defines an event API for key events.
 */
export default class Keyboard {
  public notify!: EventNotify<KeyboardEventMap, HTMLElement>
  public on!: EventOn<KeyboardEventMap, HTMLElement, this>
  public off!: EventOff<KeyboardEventMap, HTMLElement>
  public selectionWatcher: SelectionWatcher
  static key = keyboardLegacyKeyCodes

  constructor(selectionWatcher: SelectionWatcher) {
    eventable<Keyboard, HTMLElement, KeyboardEventMap>(this)
    this.selectionWatcher = selectionWatcher
  }

  dispatchKeyEvent(
    event: KeyboardEvent,
    target: HTMLElement,
    notifyCharacterEvent: boolean = false,
    options: DispatchKeyEventOptions = {}
  ): void {
    const navigationAction = resolveNavigationAction(event)
    if (navigationAction) {
      return this.notify(target, navigationAction, event)
    }

    const editingAction = resolveEditingAction(event)
    if (editingAction) {
      if (options.skipEditing || event.isComposing || isImeFallbackKey(event)) return
      if (options.shouldSuppressKeydown?.(editingAction)) return

      this.preventContenteditableBug(target, event, editingAction)
      return this.notify(target, editingAction, event)
    }

    if (notifyCharacterEvent) {
      const characterAction = resolveCharacterAction(event)
      if (characterAction) {
        this.preventContenteditableBug(target, event)
        return this.notify(target, characterAction, event)
      }
    }
  }

  preventContenteditableBug(
    target: HTMLElement,
    event: KeyboardEvent,
    editingAction?: TrackedInputCommand | KeyAction
  ): void {
    if (editingAction === 'bold' || editingAction === 'italic') return

    const win = this.selectionWatcher.win ?? target.ownerDocument?.defaultView
    if (!win) return
    if (!getWindowFeatures(win).contenteditableSpanBug) return
    if (event.ctrlKey || event.metaKey) return

    const rangeContainer = this.selectionWatcher.getFreshRange()
    if (!rangeContainer.isSelection || !rangeContainer.range) return

    const nodeToRemove = Keyboard.getNodeToRemove(rangeContainer.range, target)
    if (nodeToRemove) nodeToRemove.remove()
  }

  static getNodeToRemove(selectionRange: Range, target: HTMLElement): Element | undefined {
    if (selectionRange.startOffset !== 0) return undefined

    let startNodeElement: Element = selectionRange.startContainer as Element

    if (startNodeElement.nodeType === nodeType.textNode) {
      const parent = startNodeElement.parentNode
      if (!parent || parent.nodeType !== nodeType.elementNode) return undefined
      startNodeElement = parent as Element
    }

    if (startNodeElement === target) return undefined

    const firstChild = startNodeElement.firstChild
    const lastChild = startNodeElement.lastChild
    if (!firstChild || !lastChild) return undefined

    const startNodeRange = createRange()
    startNodeRange.setStartBefore(firstChild)
    startNodeRange.setEndAfter(lastChild)
    if (containsRange(startNodeRange, selectionRange)) return undefined

    if (selectionRange.startContainer.nodeType === nodeType.textNode) {
      const contentNodeTypes = [nodeType.textNode, nodeType.elementNode]
      let firstContentNode: Node | null = startNodeElement.firstChild

      do {
        if (firstContentNode && contentNodeTypes.indexOf(firstContentNode.nodeType) !== -1) break
        firstContentNode = firstContentNode ? firstContentNode.nextSibling : null
      } while (firstContentNode)

      if (firstContentNode !== selectionRange.startContainer) return undefined
    }

    const rangeStartingBeforeCurrentElement = selectionRange.cloneRange()
    rangeStartingBeforeCurrentElement.setStartBefore(startNodeElement)

    const parentResult = Keyboard.getNodeToRemove(rangeStartingBeforeCurrentElement, target)
    return parentResult || startNodeElement
  }
}

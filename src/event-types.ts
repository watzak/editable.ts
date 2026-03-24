import type Cursor from './cursor.js'
import type Selection from './selection.js'
import type {Editable} from './core.js'

export type EventMap = Record<string, unknown[]>

export type EventKey<TEventMap extends EventMap> = Extract<keyof TEventMap, string>

export type EventHandler<TContext, TArgs extends unknown[]> = (this: TContext, ...args: TArgs) => unknown

export type EventHandlerMap<TEventMap extends EventMap, TContext> = {
  [TEventName in EventKey<TEventMap>]?: EventHandler<TContext, TEventMap[TEventName]>
}

export type GenericEventHandlerMap<TContext> = Record<string, EventHandler<TContext, unknown[]> | undefined>

export interface EventOn<TEventMap extends EventMap, TContext, TSelf> {
  <TEventName extends EventKey<TEventMap>>(
    event: TEventName,
    handler: EventHandler<TContext, TEventMap[TEventName]>
  ): TSelf
  (events: EventHandlerMap<TEventMap, TContext> | GenericEventHandlerMap<TContext>): TSelf
}

export interface EventNotify<TEventMap extends EventMap, TContext> {
  <TEventName extends EventKey<TEventMap>>(
    context: TContext,
    event: TEventName,
    ...args: TEventMap[TEventName]
  ): void
  <TEventName extends EventKey<TEventMap>>(
    event: TEventName,
    ...args: TEventMap[TEventName]
  ): void
}

export interface EventOff<TEventMap extends EventMap, TContext> {
  <TEventName extends EventKey<TEventMap>>(
    event: TEventName,
    listener?: EventHandler<TContext, TEventMap[TEventName]>
  ): void
  (): void
}

export interface EventableObject<TEventMap extends EventMap, TContext, TSelf> {
  on: EventOn<TEventMap, TContext, TSelf>
  off: EventOff<TEventMap, TContext>
  notify: EventNotify<TEventMap, TContext>
  switchContext?: {
    events: string[]
    positionX?: number
  }
}

export type BlockDirection = 'before' | 'after'
export type SwitchDirection = 'up' | 'down'
export type ClipboardAction = 'copy' | 'cut'
export type SelectionBoundary = 'both' | 'start' | 'end'

export interface EditableEventMap extends EventMap {
  focus: [HTMLElement]
  blur: [HTMLElement]
  flow: unknown[]
  selection: [HTMLElement, Selection?]
  cursor: [HTMLElement, Cursor?]
  newline: [HTMLElement, Cursor]
  insert: [HTMLElement, BlockDirection, Cursor]
  split: [HTMLElement, string, string, Cursor]
  merge: [HTMLElement, BlockDirection, Cursor]
  empty: [HTMLElement]
  change: [HTMLElement]
  switch: [HTMLElement, SwitchDirection, Cursor]
  move: [HTMLElement, Selection, BlockDirection]
  clipboard: [HTMLElement, ClipboardAction, Selection]
  paste: [HTMLElement, string[], Cursor]
  spellcheckUpdated: [HTMLElement]
  selectToBoundary: [HTMLElement, Event, SelectionBoundary]
  init: [HTMLElement]
}

export interface DispatcherEventMap extends EditableEventMap {
  toggleBold: [Selection]
  toggleEmphasis: [Selection]
}

export interface KeyboardEventMap extends EventMap {
  left: [KeyboardEvent]
  right: [KeyboardEvent]
  up: [KeyboardEvent]
  down: [KeyboardEvent]
  tab: [KeyboardEvent]
  shiftTab: [KeyboardEvent]
  esc: [KeyboardEvent]
  backspace: [KeyboardEvent]
  delete: [KeyboardEvent]
  enter: [KeyboardEvent]
  shiftEnter: [KeyboardEvent]
  bold: [KeyboardEvent]
  italic: [KeyboardEvent]
  character: [KeyboardEvent]
}

export type EditableEvent = EventKey<EditableEventMap>

export type EditableEventHandler<TEventName extends EditableEvent> = EventHandler<Editable, EditableEventMap[TEventName]>

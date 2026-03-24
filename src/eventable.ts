// Eventable Mixin.
//
// Simple mixin to add event emitter methods to an object (Publish/Subscribe).
//
// Add on, off and notify methods to an object:
// eventable(obj)
//
// publish an event:
// obj.notify(context, 'action', param1, param2)
//
// Optionally pass a context that will be applied to every event:
// eventable(obj, context)
//
// With this publishing can omit the context argument:
// obj.notify('action', param1, param2)
//
// Subscribe to a 'channel'
// obj.on('action', funtion(param1, param2){ ... })
//
// Unsubscribe an individual listener:
// obj.off('action', method)
//
// Unsubscribe all listeners of a channel:
// obj.off('action')
//
// Unsubscribe all listeners of all channels:
// obj.off()

import type {
  EventableObject,
  EventHandler,
  EventHandlerMap,
  EventKey,
  EventMap
} from './event-types.js'

export default function eventable<
  TObject extends object,
  TContext = unknown,
  TEventMap extends EventMap = Record<string, unknown[]>
>(obj: TObject, notifyContext?: TContext): void {
  const events = getEventableModule<TContext, TEventMap>(notifyContext)
  const target = obj as TObject & EventableObject<TEventMap, TContext, TObject>
  target.on = events.on as EventableObject<TEventMap, TContext, TObject>['on']
  target.off = events.off as EventableObject<TEventMap, TContext, TObject>['off']
  target.notify = events.notify as EventableObject<TEventMap, TContext, TObject>['notify']
}

function getEventableModule<
  TContext,
  TEventMap extends EventMap = Record<string, unknown[]>
>(notifyContext?: TContext): EventModule<TContext, TEventMap> {
  const listeners: Record<string, Array<EventHandler<TContext, unknown[]>>> = {}

  function addListener(events: string, listener: EventHandler<TContext, unknown[]>): void {
    events.split(' ').forEach(event => {
      listeners[event] = listeners[event] || []
      listeners[event].unshift(listener)
    })
  }

  function removeListener(event: string, listener?: EventHandler<TContext, unknown[]>): void {
    if (!listener) return
    const eventListeners = listeners[event]
    if (!eventListeners) return

    const index = eventListeners.indexOf(listener)
    if (index < 0) return

    eventListeners.splice(index, 1)
  }

  // Public Methods
  const result: EventModule<TContext, TEventMap> = {
    on<TEventName extends EventKey<TEventMap>>(
      eventOrEvents: TEventName | EventHandlerMap<TEventMap, TContext>,
      listener?: EventHandler<TContext, TEventMap[TEventName]>
    ) {
      if (arguments.length === 2 && typeof eventOrEvents === 'string') {
        addListener(eventOrEvents, listener as EventHandler<TContext, unknown[]>)
      } else if (arguments.length === 1 && typeof eventOrEvents === 'object') {
        for (const eventType in eventOrEvents) {
          const eventListener = eventOrEvents[eventType]
          if (eventListener) addListener(eventType, eventListener as EventHandler<TContext, unknown[]>)
        }
      }
      return result
    },

    off<TEventName extends EventKey<TEventMap>>(
      event?: TEventName,
      listener?: EventHandler<TContext, TEventMap[TEventName]>
    ): void {
      if (arguments.length === 2) {
        removeListener(event!, listener as EventHandler<TContext, unknown[]> | undefined)
      } else if (arguments.length === 1) {
        listeners[event!] = []
      } else {
        Object.keys(listeners).forEach(key => delete listeners[key])
      }
    },

    notify<TEventName extends EventKey<TEventMap>>(
      context: TContext | TEventName,
      event?: TEventName,
      ...args: TEventMap[TEventName]
    ): void {
      const allArgs = Array.from(arguments)

      let actualContext: TContext | undefined
      let actualEvent: string
      let actualArgs: unknown[]

      if (notifyContext) {
        actualEvent = context as string
        actualContext = notifyContext
        actualArgs = allArgs.slice(1)
      } else {
        actualContext = context as TContext
        actualEvent = event as string
        actualArgs = allArgs.slice(2)
      }

      if (result.switchContext) {
        const nextEvent = result.switchContext.events.shift()
        if (actualEvent !== nextEvent) result.switchContext = undefined
      }

      const eventListeners = listeners[actualEvent]
      if (!eventListeners) return

      // Execute the newest listeners first.
      // Stop if a listener returns false.
      eventListeners.every((listener) => listener.apply(actualContext, actualArgs) !== false)
    }
  }

  return result
}

type EventModule<TContext, TEventMap extends EventMap> = EventableObject<
  TEventMap,
  TContext,
  EventModule<TContext, TEventMap>
>

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

interface EventableObject {
  on(event: string, listener: (...args: any[]) => any): this
  on(events: Record<string, (...args: any[]) => any>): this
  off(event?: string, listener?: (...args: any[]) => any): void
  notify(context: any, event: string, ...args: any[]): void
  notify(event: string, ...args: any[]): void
  switchContext?: {
    events: string[]
    positionX?: number
  }
}

export default function eventable(obj: any, notifyContext?: any): void {
  const events = getEventableModule(notifyContext)
  obj.on = events.on
  obj.off = events.off
  obj.notify = events.notify
}

function getEventableModule(notifyContext?: any) {
  const listeners: Record<string, Array<(...args: any[]) => any>> = {}

  function addListener(events: string, listener: (...args: any[]) => any): void {
    events.split(' ').forEach(event => {
      listeners[event] = listeners[event] || []
      listeners[event].unshift(listener)
    })
  }

  function removeListener(event: string, listener: (...args: any[]) => any): void {
    const eventListeners = listeners[event]
    if (!eventListeners) return

    const index = eventListeners.indexOf(listener)
    if (index < 0) return

    eventListeners.splice(index, 1)
  }

  // Public Methods
  const result: any = {
    on(eventOrEvents: string | Record<string, (...args: any[]) => any>, listener?: (...args: any[]) => any): any {
      if (arguments.length === 2 && typeof eventOrEvents === 'string') {
        addListener(eventOrEvents, listener!)
      } else if (arguments.length === 1 && typeof eventOrEvents === 'object') {
        for (const eventType in eventOrEvents) addListener(eventType, eventOrEvents[eventType])
      }
      return result
    },

    off(event?: string, listener?: (...args: any[]) => any): void {
      if (arguments.length === 2) {
        removeListener(event!, listener!)
      } else if (arguments.length === 1) {
        listeners[event!] = []
      } else {
        Object.keys(listeners).forEach(key => delete listeners[key])
      }
    },

    notify(context: any, event: string, ...args: any[]): void {
      const allArgs = Array.from(arguments)

      let actualContext: any
      let actualEvent: string
      let actualArgs: any[]

      if (notifyContext) {
        actualEvent = context
        actualContext = notifyContext
        actualArgs = allArgs.slice(1)
      } else {
        actualContext = context
        actualEvent = event
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


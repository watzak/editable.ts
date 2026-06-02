type SharedEventHandler = (evt: Event) => void

interface SharedListenerBucket {
  event: string
  capture: boolean
  listener: EventListener
  handlers: Set<SharedEventHandler>
}

export interface SharedDocumentListener {
  event: string
  listener: SharedEventHandler
  capture: boolean
  remove: () => void
}

const listenersByDocument = new WeakMap<Document, Map<string, SharedListenerBucket>>()

const getListenerKey = (event: string, capture: boolean): string =>
  `${event}:${capture ? '1' : '0'}`

export function addSharedDocumentListener(
  document: Document,
  event: string,
  listener: SharedEventHandler,
  capture: boolean = false
): SharedDocumentListener {
  let listenersByKey = listenersByDocument.get(document)
  if (!listenersByKey) {
    listenersByKey = new Map()
    listenersByDocument.set(document, listenersByKey)
  }

  const key = getListenerKey(event, capture)
  let bucket = listenersByKey.get(key)
  if (!bucket) {
    bucket = {
      event,
      capture,
      handlers: new Set(),
      listener: (evt: Event) => {
        const handlers = Array.from(bucket!.handlers)
        for (const handler of handlers) handler(evt)
      }
    }
    listenersByKey.set(key, bucket)
    document.addEventListener(event, bucket.listener, capture)
  }

  bucket.handlers.add(listener)

  let removed = false
  return {
    event,
    listener,
    capture,
    remove: () => {
      if (removed) return
      removed = true

      bucket!.handlers.delete(listener)
      if (bucket!.handlers.size > 0) return

      document.removeEventListener(event, bucket!.listener, capture)
      listenersByKey.delete(key)
      if (listenersByKey.size === 0) listenersByDocument.delete(document)
    }
  }
}

import { createOperationRange } from '../operation-offset.js'

export interface RemotePresenceView {
  clientId: number
  anchor: number
  head: number
  name: string
  color: string
  focused: boolean
}

export interface PresenceRendererContext {
  host: HTMLElement
  layer: HTMLElement
  presences: readonly RemotePresenceView[]
  reducedMotion: boolean
}

export interface PresenceRenderer {
  render(context: PresenceRendererContext): void
  destroy?(layer: HTMLElement): void
}

const layerRegistry = new WeakMap<HTMLElement, HTMLElement>()

export function getOrCreatePresenceLayer(host: HTMLElement): HTMLElement {
  const existing = layerRegistry.get(host)
  if (existing?.isConnected) return existing

  const doc = host.ownerDocument
  const layer = doc.createElement('div')
  layer.className = 'editable-yjs-presence-layer'
  layer.setAttribute('aria-hidden', 'true')
  layer.dataset.editablePresence = 'overlay'
  Object.assign(layer.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: '9999',
    overflow: 'visible'
  })
  doc.body.appendChild(layer)
  layerRegistry.set(host, layer)
  return layer
}

export function removePresenceLayer(host: HTMLElement): void {
  const layer = layerRegistry.get(host)
  if (layer) {
    layer.remove()
    layerRegistry.delete(host)
  }
}

export function defaultPresenceRenderer(context: PresenceRendererContext): void {
  const { host, layer, presences, reducedMotion } = context
  layer.replaceChildren()

  const hostDoc = host.ownerDocument
  const win = hostDoc.defaultView
  if (!win) return

  if (!host.isConnected) return

  for (const presence of presences) {
    if (!presence.focused) continue

    const start = Math.min(presence.anchor, presence.head)
    const end = Math.max(presence.anchor, presence.head)
    const collapsed = start === end

    try {
      if (collapsed) {
        renderCaret(hostDoc, layer, host, start, presence, reducedMotion)
      } else {
        renderSelection(hostDoc, layer, host, start, end, presence)
        renderCaret(hostDoc, layer, host, presence.head, presence, reducedMotion)
      }
    } catch {
      // Invalid range after concurrent edits — skip this presence view.
    }
  }
}

function renderCaret(
  doc: Document,
  layer: HTMLElement,
  host: HTMLElement,
  offset: number,
  presence: RemotePresenceView,
  reducedMotion: boolean
): void {
  const range = createOperationRange(host, offset, offset)
  const rect = primaryRect(range)
  if (!rect) return

  const caret = doc.createElement('div')
  caret.className = 'editable-yjs-presence-caret'
  caret.style.backgroundColor = presence.color
  Object.assign(caret.style, {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: '2px',
    height: `${Math.max(rect.height, 16)}px`,
    pointerEvents: 'none'
  })

  if (!reducedMotion) {
    caret.style.animation = 'editable-yjs-presence-blink 1.1s step-end infinite'
  }

  layer.appendChild(caret)

  const label = doc.createElement('div')
  label.className = 'editable-yjs-presence-label'
  label.textContent = presence.name
  Object.assign(label.style, {
    position: 'fixed',
    top: `${Math.max(0, rect.top - 18)}px`,
    left: `${rect.left}px`,
    background: presence.color,
    color: '#fff',
    font: '11px/1.2 system-ui,sans-serif',
    padding: '1px 4px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  })
  layer.appendChild(label)
}

function renderSelection(
  doc: Document,
  layer: HTMLElement,
  host: HTMLElement,
  start: number,
  end: number,
  presence: RemotePresenceView
): void {
  const range = createOperationRange(host, start, end)
  const rects = Array.from(range.getClientRects())

  for (const rect of rects) {
    if (rect.width === 0 && rect.height === 0) continue
    const highlight = doc.createElement('div')
    highlight.className = 'editable-yjs-presence-selection'
    Object.assign(highlight.style, {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      backgroundColor: presence.color,
      opacity: '0.25',
      pointerEvents: 'none'
    })
    layer.appendChild(highlight)
  }
}

function primaryRect(range: Range): DOMRect | null {
  const rects = range.getClientRects()
  if (rects.length === 0) {
    const bounding = range.getBoundingClientRect()
    return bounding.width === 0 && bounding.height === 0 ? null : bounding
  }
  return rects[0] ?? null
}

export function ensurePresenceStyles(doc: Document): void {
  if (doc.getElementById('editable-yjs-presence-styles')) return
  const style = doc.createElement('style')
  style.id = 'editable-yjs-presence-styles'
  style.textContent = `@keyframes editable-yjs-presence-blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.editable-yjs-presence-caret{animation:none!important}}`
  doc.head.appendChild(style)
}

import { createOperationRange } from '../operation-offset.js'
import type { ResolvedAnnotationRange } from './annotation-types.js'

export interface AnnotationRendererContext {
  host: HTMLElement
  layer: HTMLElement
  annotations: readonly ResolvedAnnotationRange[]
  reducedMotion: boolean
}

export interface AnnotationRenderer {
  render(context: AnnotationRendererContext): void
  destroy?(layer: HTMLElement): void
}

const layerRegistry = new WeakMap<HTMLElement, HTMLElement>()

export function getOrCreateAnnotationLayer(host: HTMLElement): HTMLElement {
  const existing = layerRegistry.get(host)
  if (existing?.isConnected) return existing

  const doc = host.ownerDocument
  const layer = doc.createElement('div')
  layer.className = 'editable-yjs-annotation-layer'
  layer.dataset.editableAnnotation = 'overlay'
  Object.assign(layer.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: '9998',
    overflow: 'visible'
  })
  doc.body.appendChild(layer)
  layerRegistry.set(host, layer)
  return layer
}

export function removeAnnotationLayer(host: HTMLElement): void {
  const layer = layerRegistry.get(host)
  if (layer) {
    layer.remove()
    layerRegistry.delete(host)
  }
}

const TYPE_COLORS: Record<ResolvedAnnotationRange['type'], string> = {
  comment: '#fbbf24',
  issue: '#f87171',
  suggestion: '#60a5fa'
}

export function defaultAnnotationRenderer(context: AnnotationRendererContext): void {
  const { host, layer, annotations } = context
  layer.replaceChildren()

  const hostDoc = host.ownerDocument
  if (!host.isConnected) return

  const list = hostDoc.createElement('ul')
  list.className = 'editable-yjs-annotation-list'
  list.setAttribute('role', 'list')
  list.setAttribute('aria-label', 'Document annotations')
  Object.assign(list.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    maxWidth: '220px',
    margin: '0',
    padding: '0',
    listStyle: 'none',
    pointerEvents: 'auto',
    font: '12px/1.35 system-ui,sans-serif',
    zIndex: '10000'
  })

  for (const annotation of annotations) {
    if (annotation.resolved) continue

    if (annotation.orphaned) {
      list.appendChild(createOrphanListItem(hostDoc, annotation))
      continue
    }

    try {
      renderRangeHighlights(hostDoc, layer, host, annotation)
      list.appendChild(createActiveListItem(hostDoc, annotation))
    } catch {
      list.appendChild(createOrphanListItem(hostDoc, annotation))
    }
  }

  if (list.childElementCount > 0) {
    layer.appendChild(list)
  }
}

function renderRangeHighlights(
  doc: Document,
  layer: HTMLElement,
  host: HTMLElement,
  annotation: ResolvedAnnotationRange
): void {
  const color = TYPE_COLORS[annotation.type]
  const label = buildAccessibleLabel(annotation)

  if (annotation.collapsed) {
    appendMarker(doc, layer, host, annotation.anchor, color, label, annotation.id)
    return
  }

  const range = createOperationRange(host, annotation.anchor, annotation.head)
  const rects = Array.from(range.getClientRects())
  rects.forEach((rect, index) => {
    if (rect.width === 0 && rect.height === 0) return
    const highlight = doc.createElement('div')
    highlight.className = 'editable-yjs-annotation-highlight'
    highlight.dataset.annotationId = annotation.id
    highlight.setAttribute('role', 'mark')
    highlight.setAttribute('aria-label', label)
    Object.assign(highlight.style, {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      backgroundColor: color,
      opacity: '0.28',
      pointerEvents: 'none',
      outline: index === 0 ? `1px solid ${color}` : 'none'
    })
    layer.appendChild(highlight)
  })

  appendMarker(doc, layer, host, annotation.head, color, label, `${annotation.id}-head`)
}

function appendMarker(
  doc: Document,
  layer: HTMLElement,
  host: HTMLElement,
  offset: number,
  color: string,
  label: string,
  id: string
): void {
  const range = createOperationRange(host, offset, offset)
  const rect = primaryRect(range)
  if (!rect) return

  const marker = doc.createElement('div')
  marker.className = 'editable-yjs-annotation-marker'
  marker.dataset.annotationId = id
  marker.setAttribute('role', 'img')
  marker.setAttribute('aria-label', label)
  Object.assign(marker.style, {
    position: 'fixed',
    top: `${Math.max(0, rect.top - 2)}px`,
    left: `${Math.max(0, rect.left - 4)}px`,
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    border: '1px solid #fff',
    pointerEvents: 'none'
  })
  layer.appendChild(marker)
}

function createActiveListItem(doc: Document, annotation: ResolvedAnnotationRange): HTMLLIElement {
  const item = doc.createElement('li')
  item.setAttribute('role', 'listitem')
  item.tabIndex = 0
  item.dataset.annotationId = annotation.id

  const title = doc.createElement('strong')
  title.textContent = `${annotation.type} by ${annotation.authorId}`
  item.appendChild(title)

  const preview = doc.createElement('span')
  preview.textContent = annotation.data?.body ? `: ${annotation.data.body}` : ''
  preview.style.display = 'block'
  preview.style.color = '#444'
  item.appendChild(preview)

  item.setAttribute('aria-label', buildAccessibleLabel(annotation))
  Object.assign(item.style, {
    background: '#fff',
    border: `1px solid ${TYPE_COLORS[annotation.type]}`,
    borderRadius: '4px',
    padding: '4px 6px',
    marginBottom: '4px'
  })
  return item
}

function createOrphanListItem(doc: Document, annotation: ResolvedAnnotationRange): HTMLLIElement {
  const item = doc.createElement('li')
  item.setAttribute('role', 'listitem')
  item.tabIndex = 0
  item.dataset.annotationId = annotation.id
  item.setAttribute('aria-label', `Orphaned ${annotation.type}`)
  item.textContent = `Orphaned ${annotation.type} (${annotation.id.slice(0, 8)})`
  Object.assign(item.style, {
    background: '#f3f4f6',
    border: '1px dashed #9ca3af',
    borderRadius: '4px',
    padding: '4px 6px',
    marginBottom: '4px',
    color: '#6b7280'
  })
  return item
}

function buildAccessibleLabel(annotation: ResolvedAnnotationRange): string {
  const preview = annotation.data?.body ? `: ${annotation.data.body}` : ''
  const state = annotation.orphaned ? ' orphaned' : ''
  return `${annotation.type}${state} by ${annotation.authorId}${preview}`
}

function primaryRect(range: Range): DOMRect | null {
  const rects = range.getClientRects()
  if (rects.length === 0) {
    const bounding = range.getBoundingClientRect()
    return bounding.width === 0 && bounding.height === 0 ? null : bounding
  }
  return rects[0] ?? null
}

export function ensureAnnotationStyles(doc: Document): void {
  if (doc.getElementById('editable-yjs-annotation-styles')) return
  const style = doc.createElement('style')
  style.id = 'editable-yjs-annotation-styles'
  style.textContent = `.editable-yjs-annotation-list li:focus{outline:2px solid #2563eb;outline-offset:1px}`
  doc.head.appendChild(style)
}

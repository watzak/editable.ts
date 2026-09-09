import * as Y from 'yjs'
import type { CollaborativeAnnotationRecord, ResolvedAnnotationRange } from './annotation-types.js'
import { resolvePresenceSelection } from './relative-position.js'

export interface ResolveAnnotationOptions {
  doc: Y.Doc
  yText: Y.Text
  componentId?: string
  directiveId?: string
}

/** Resolves stored relative positions to UTF-16 offsets for rendering. */
export function resolveAnnotationRange(
  record: CollaborativeAnnotationRecord,
  options: ResolveAnnotationOptions
): ResolvedAnnotationRange | null {
  if (record.status === 'orphaned' || options.yText.length === 0) {
    return orphanedView(record)
  }

  if (options.componentId && record.componentId && record.componentId !== options.componentId) {
    return null
  }
  if (options.directiveId && record.directiveId && record.directiveId !== options.directiveId) {
    return null
  }

  const resolved = resolvePresenceSelection(options.doc, options.yText, record.anchor, record.head)

  if (!resolved) {
    return orphanedView(record)
  }

  const start = Math.min(resolved.anchor, resolved.head)
  const end = Math.max(resolved.anchor, resolved.head)

  return {
    id: record.id,
    type: record.type,
    anchor: start,
    head: end,
    collapsed: start === end,
    authorId: record.authorId,
    createdAt: record.createdAt,
    resolved: Boolean(record.resolvedAt),
    orphaned: false,
    componentId: record.componentId,
    directiveId: record.directiveId,
    data: record.data
  }
}

export function resolveAnnotationsForHost(
  records: CollaborativeAnnotationRecord[],
  options: ResolveAnnotationOptions
): ResolvedAnnotationRange[] {
  const views: ResolvedAnnotationRange[] = []
  for (const record of records) {
    const view = resolveAnnotationRange(record, options)
    if (view) views.push(view)
  }
  return views
}

function orphanedView(record: CollaborativeAnnotationRecord): ResolvedAnnotationRange {
  return {
    id: record.id,
    type: record.type,
    anchor: 0,
    head: 0,
    collapsed: true,
    authorId: record.authorId,
    createdAt: record.createdAt,
    resolved: Boolean(record.resolvedAt),
    orphaned: true,
    componentId: record.componentId,
    directiveId: record.directiveId,
    data: record.data
  }
}

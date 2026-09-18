import * as Y from 'yjs'
import type { JsonValue } from '../operation-types.js'
import {
  ANNOTATION_PAYLOAD_VERSION,
  ANNOTATION_STORAGE_VERSION_V2,
  type AnnotationReply,
  type AnnotationType,
  type CollaborativeAnnotationRecord,
  type SanitizedAnnotationData
} from './annotation-types.js'
import {
  sanitizeAnnotationAuthorId,
  sanitizeAnnotationBody,
  sanitizeAnnotationData,
  sanitizeAnnotationId,
  sanitizeIsoTimestamp
} from './annotation-payload.js'
import { isRelativePositionJson } from './relative-position.js'

export function isV2AnnotationMap(value: unknown): value is Y.Map<unknown> {
  return value instanceof Y.Map && value.get('v') === ANNOTATION_STORAGE_VERSION_V2
}

export function getOrCreateRepliesMap(meta: Y.Map<unknown>): Y.Map<unknown> {
  const existing = meta.get('replies')
  if (existing instanceof Y.Map) return existing
  const replies = new Y.Map<unknown>()
  meta.set('replies', replies)
  return replies
}

export function createV2AnnotationMap(input: {
  id: string
  type: AnnotationType
  componentId?: string
  directiveId?: string
  anchor: JsonValue | null
  head: JsonValue | null
  authorId: string
  createdAt: string
  status?: CollaborativeAnnotationRecord['status']
  data?: SanitizedAnnotationData
}): Y.Map<unknown> {
  const meta = new Y.Map<unknown>()
  meta.set('v', ANNOTATION_STORAGE_VERSION_V2)
  meta.set('id', input.id)
  meta.set('type', input.type)
  if (input.componentId) meta.set('componentId', input.componentId)
  if (input.directiveId) meta.set('directiveId', input.directiveId)
  meta.set('anchor', input.anchor)
  meta.set('head', input.head)
  meta.set('authorId', sanitizeAnnotationAuthorId(input.authorId))
  meta.set('createdAt', sanitizeIsoTimestamp(input.createdAt) ?? new Date().toISOString())
  meta.set('status', input.status ?? 'active')
  if (input.data?.body) meta.set('body', input.data.body)
  meta.set('replies', new Y.Map())
  return meta
}

function sanitizeAnnotationType(value: unknown): AnnotationType | null {
  if (value === 'comment' || value === 'issue' || value === 'suggestion') return value
  return null
}

function readRepliesFromMap(repliesMap: Y.Map<unknown>): AnnotationReply[] {
  const thread: AnnotationReply[] = []
  repliesMap.forEach((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
    const candidate = raw as Record<string, unknown>
    const id = sanitizeAnnotationId(candidate.id)
    const authorId = sanitizeAnnotationAuthorId(candidate.authorId)
    const createdAt = sanitizeIsoTimestamp(candidate.createdAt)
    const body = sanitizeAnnotationBody(candidate.body)
    if (!id || !createdAt || !body) return
    thread.push({ id, authorId, createdAt, body })
  })
  thread.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return thread
}

/** Reads a v2 {@link Y.Map} annotation entry into the wire record shape (for UI and tests). */
export function parseAnnotationRecordFromV2Map(
  meta: Y.Map<unknown>
): CollaborativeAnnotationRecord | null {
  if (meta.get('v') !== ANNOTATION_STORAGE_VERSION_V2) return null

  const id = sanitizeAnnotationId(meta.get('id'))
  const type = sanitizeAnnotationType(meta.get('type'))
  const authorId = sanitizeAnnotationAuthorId(meta.get('authorId'))
  const createdAt = sanitizeIsoTimestamp(meta.get('createdAt'))
  if (!id || !type || !createdAt) return null

  const anchor = meta.get('anchor')
  const head = meta.get('head')
  if (anchor !== null && anchor !== undefined && !isRelativePositionJson(anchor)) return null
  if (head !== null && head !== undefined && !isRelativePositionJson(head)) return null

  const resolvedAtRaw = meta.get('resolvedAt')
  const resolvedAt =
    resolvedAtRaw != null ? (sanitizeIsoTimestamp(resolvedAtRaw) ?? undefined) : undefined
  const resolvedByRaw = meta.get('resolvedBy')
  const resolvedBy = resolvedByRaw != null ? sanitizeAnnotationAuthorId(resolvedByRaw) : undefined

  const data: SanitizedAnnotationData = {}
  const body = sanitizeAnnotationBody(meta.get('body'))
  if (body) data.body = body

  const repliesEntry = meta.get('replies')
  if (repliesEntry instanceof Y.Map) {
    const thread = readRepliesFromMap(repliesEntry)
    if (thread.length > 0) data.thread = thread
  }

  const status = meta.get('status') === 'orphaned' ? 'orphaned' : 'active'

  return {
    v: ANNOTATION_PAYLOAD_VERSION,
    id,
    type,
    componentId:
      typeof meta.get('componentId') === 'string'
        ? (meta.get('componentId') as string)
        : undefined,
    directiveId:
      typeof meta.get('directiveId') === 'string'
        ? (meta.get('directiveId') as string)
        : undefined,
    anchor: (anchor ?? null) as JsonValue | null,
    head: (head ?? null) as JsonValue | null,
    authorId,
    createdAt,
    resolvedAt,
    resolvedBy: resolvedBy !== 'unknown' ? resolvedBy : undefined,
    status,
    data: Object.keys(data).length > 0 ? data : undefined
  }
}

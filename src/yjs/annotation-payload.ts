import type { JsonValue } from '../operation-types.js'
import {
  ANNOTATION_PAYLOAD_VERSION,
  type AnnotationLifecycleStatus,
  type AnnotationReply,
  type AnnotationType,
  type CollaborativeAnnotationRecord,
  type SanitizedAnnotationData
} from './annotation-types.js'
import { isRelativePositionJson } from './relative-position.js'
import { stripAsciiControlCharacters } from './sanitize.js'
const MAX_ID_LENGTH = 128
const MAX_AUTHOR_LENGTH = 128
const MAX_BODY_LENGTH = 4096
const MAX_THREAD_LENGTH = 64
const MAX_DATA_DEPTH = 4
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

const ANNOTATION_TYPES = new Set<AnnotationType>(['comment', 'issue', 'suggestion'])

export function sanitizeAnnotationId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const stripped = stripAsciiControlCharacters(value).trim()
  if (!stripped || stripped.length > MAX_ID_LENGTH) return null
  return stripped
}

export function sanitizeAnnotationAuthorId(value: unknown): string {
  if (typeof value !== 'string') return 'unknown'
  const stripped = stripAsciiControlCharacters(value)
    .replace(/[<>"'`]/g, '')
    .trim()
  if (!stripped) return 'unknown'
  return stripped.slice(0, MAX_AUTHOR_LENGTH)
}

export function sanitizeAnnotationBody(value: unknown): string {
  if (typeof value !== 'string') return ''
  return stripAsciiControlCharacters(value)
    .replace(/[<>"'`]/g, '')
    .trim()
    .slice(0, MAX_BODY_LENGTH)
}

export function sanitizeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!ISO_DATE.test(trimmed)) return null
  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

function sanitizeAnnotationType(value: unknown): AnnotationType | null {
  if (typeof value !== 'string' || !ANNOTATION_TYPES.has(value as AnnotationType)) return null
  return value as AnnotationType
}

function sanitizeLifecycleStatus(value: unknown): AnnotationLifecycleStatus {
  return value === 'orphaned' ? 'orphaned' : 'active'
}

function sanitizeOptionalKey(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const stripped = stripAsciiControlCharacters(value).trim()
  if (!stripped) return undefined
  return stripped.slice(0, maxLength)
}

function sanitizeReply(raw: unknown): AnnotationReply | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Record<string, unknown>
  const id = sanitizeAnnotationId(candidate.id)
  const authorId = sanitizeAnnotationAuthorId(candidate.authorId)
  const createdAt = sanitizeIsoTimestamp(candidate.createdAt)
  const body = sanitizeAnnotationBody(candidate.body)
  if (!id || !createdAt || !body) return null
  return { id, authorId, createdAt, body }
}

export function sanitizeAnnotationData(
  value: unknown,
  depth = 0
): SanitizedAnnotationData | undefined {
  if (depth > MAX_DATA_DEPTH) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const candidate = value as Record<string, unknown>
  const result: SanitizedAnnotationData = {}

  if (candidate.body != null) {
    const body = sanitizeAnnotationBody(candidate.body)
    if (body) result.body = body
  }

  if (Array.isArray(candidate.thread)) {
    const thread: AnnotationReply[] = []
    for (const entry of candidate.thread.slice(0, MAX_THREAD_LENGTH)) {
      const reply = sanitizeReply(entry)
      if (reply) thread.push(reply)
    }
    if (thread.length > 0) result.thread = thread
  }

  return Object.keys(result).length > 0 ? result : undefined
}

export function buildAnnotationRecord(input: {
  id: string
  type: AnnotationType
  componentId?: string
  directiveId?: string
  anchor: JsonValue | null
  head: JsonValue | null
  authorId: string
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
  status?: AnnotationLifecycleStatus
  data?: SanitizedAnnotationData
}): CollaborativeAnnotationRecord {
  return {
    v: ANNOTATION_PAYLOAD_VERSION,
    id: sanitizeAnnotationId(input.id) ?? crypto.randomUUID(),
    type: input.type,
    componentId: sanitizeOptionalKey(input.componentId, MAX_ID_LENGTH),
    directiveId: sanitizeOptionalKey(input.directiveId, MAX_ID_LENGTH),
    anchor: input.anchor,
    head: input.head,
    authorId: sanitizeAnnotationAuthorId(input.authorId),
    createdAt: sanitizeIsoTimestamp(input.createdAt) ?? new Date().toISOString(),
    resolvedAt: input.resolvedAt
      ? (sanitizeIsoTimestamp(input.resolvedAt) ?? undefined)
      : undefined,
    resolvedBy: input.resolvedBy ? sanitizeAnnotationAuthorId(input.resolvedBy) : undefined,
    status: sanitizeLifecycleStatus(input.status),
    data: input.data ? sanitizeAnnotationData(input.data) : undefined
  }
}

export function parseAnnotationRecord(raw: unknown): CollaborativeAnnotationRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Record<string, unknown>
  if (candidate.v !== ANNOTATION_PAYLOAD_VERSION) return null

  const id = sanitizeAnnotationId(candidate.id)
  const type = sanitizeAnnotationType(candidate.type)
  const authorId = sanitizeAnnotationAuthorId(candidate.authorId)
  const createdAt = sanitizeIsoTimestamp(candidate.createdAt)
  if (!id || !type || !createdAt) return null

  const anchor = candidate.anchor
  const head = candidate.head
  if (anchor !== null && !isRelativePositionJson(anchor)) return null
  if (head !== null && !isRelativePositionJson(head)) return null

  const resolvedAt = candidate.resolvedAt ? sanitizeIsoTimestamp(candidate.resolvedAt) : undefined
  const resolvedBy = candidate.resolvedBy
    ? sanitizeAnnotationAuthorId(candidate.resolvedBy)
    : undefined

  return {
    v: ANNOTATION_PAYLOAD_VERSION,
    id,
    type,
    componentId: sanitizeOptionalKey(candidate.componentId, MAX_ID_LENGTH),
    directiveId: sanitizeOptionalKey(candidate.directiveId, MAX_ID_LENGTH),
    anchor: anchor as JsonValue | null,
    head: head as JsonValue | null,
    authorId,
    createdAt,
    resolvedAt: resolvedAt ?? undefined,
    resolvedBy: resolvedBy !== 'unknown' ? resolvedBy : undefined,
    status: sanitizeLifecycleStatus(candidate.status),
    data: sanitizeAnnotationData(candidate.data)
  }
}

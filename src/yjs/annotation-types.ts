import type { JsonValue } from '../operation-types.js'

export const ANNOTATIONS_ROOT_KEY = 'editable.ts:annotations:v1'
/** Wire/API record version (JSON and v2 map entries expose this in {@link CollaborativeAnnotationRecord.v}). */
export const ANNOTATION_PAYLOAD_VERSION = 1 as const
/** CRDT storage version when the map value is a nested {@link Y.Map} (see docs/adr/001-annotation-v2-crdt-storage.md). */
export const ANNOTATION_STORAGE_VERSION_V2 = 2 as const

export type AnnotationType = 'comment' | 'issue' | 'suggestion'

export type AnnotationLifecycleStatus = 'active' | 'orphaned'

/** Sanitized reply stored in annotation `data.thread`. */
export interface AnnotationReply {
  id: string
  authorId: string
  createdAt: string
  body: string
}

/** Sanitized annotation payload stored in CRDT `data` field. */
export interface SanitizedAnnotationData {
  body?: string
  thread?: AnnotationReply[]
}

/**
 * Wire format stored in {@link Y.Map} — never in Y.Text attributes.
 * Anchor/head are JSON-serialized {@link Y.RelativePosition} values.
 */
export interface CollaborativeAnnotationRecord {
  v: typeof ANNOTATION_PAYLOAD_VERSION
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
  status: AnnotationLifecycleStatus
  data?: SanitizedAnnotationData
}

export interface ResolvedAnnotationRange {
  id: string
  type: AnnotationType
  anchor: number
  head: number
  collapsed: boolean
  authorId: string
  createdAt: string
  resolved: boolean
  orphaned: boolean
  componentId?: string
  directiveId?: string
  data?: SanitizedAnnotationData
}

export type ComponentDeleteAnnotationPolicy = 'orphan' | 'remove'

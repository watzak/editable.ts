import * as Y from 'yjs'
import type { JsonValue } from '../operation-types.js'
import {
  ANNOTATIONS_ROOT_KEY,
  type AnnotationType,
  type CollaborativeAnnotationRecord
} from './annotation-types.js'
import {
  buildAnnotationRecord,
  parseAnnotationRecord,
  sanitizeAnnotationBody,
  sanitizeAnnotationData,
  sanitizeAnnotationId,
  sanitizeIsoTimestamp
} from './annotation-payload.js'

export function getOrCreateAnnotationsMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(ANNOTATIONS_ROOT_KEY)
}

export class AnnotationStore {
  private readonly map: Y.Map<unknown>
  private readonly origin: unknown

  constructor(map: Y.Map<unknown>, origin: unknown = null) {
    this.map = map
    this.origin = origin
  }

  list(): CollaborativeAnnotationRecord[] {
    const records: CollaborativeAnnotationRecord[] = []
    this.map.forEach((value) => {
      const parsed = parseAnnotationRecord(value)
      if (parsed) records.push(parsed)
    })
    return records
  }

  get(id: string): CollaborativeAnnotationRecord | null {
    const parsed = parseAnnotationRecord(this.map.get(id))
    return parsed
  }

  create(input: {
    id?: string
    type: AnnotationType
    componentId?: string
    directiveId?: string
    anchor: JsonValue | null
    head: JsonValue | null
    authorId: string
    createdAt?: string
    data?: CollaborativeAnnotationRecord['data']
  }): string | null {
    const id = sanitizeAnnotationId(input.id) ?? crypto.randomUUID()
    const record = buildAnnotationRecord({
      ...input,
      id,
      createdAt: input.createdAt ?? new Date().toISOString(),
      status: 'active'
    })
    this.transact(() => {
      this.map.set(record.id, record)
    })
    return record.id
  }

  updateData(id: string, data: CollaborativeAnnotationRecord['data']): boolean {
    const existing = this.get(id)
    if (!existing || existing.status === 'orphaned') return false
    const sanitized = sanitizeAnnotationData(data)
    this.transact(() => {
      this.map.set(
        id,
        buildAnnotationRecord({
          ...existing,
          data: sanitized
        })
      )
    })
    return true
  }

  addReply(
    id: string,
    reply: { id?: string; authorId: string; createdAt?: string; body: string }
  ): boolean {
    const existing = this.get(id)
    if (!existing || existing.status === 'orphaned') return false
    const body = sanitizeAnnotationBody(reply.body)
    if (!body) return false

    const thread = [...(existing.data?.thread ?? [])]
    thread.push({
      id: sanitizeAnnotationId(reply.id) ?? crypto.randomUUID(),
      authorId: reply.authorId,
      createdAt: sanitizeIsoTimestamp(reply.createdAt) ?? new Date().toISOString(),
      body
    })

    return this.updateData(id, { ...existing.data, thread })
  }

  resolve(id: string, resolvedBy: string): boolean {
    const existing = this.get(id)
    if (!existing || existing.status === 'orphaned') return false
    if (existing.resolvedAt) return false

    this.transact(() => {
      this.map.set(
        id,
        buildAnnotationRecord({
          ...existing,
          resolvedAt: new Date().toISOString(),
          resolvedBy
        })
      )
    })
    return true
  }

  reopen(id: string): boolean {
    const existing = this.get(id)
    if (!existing || existing.status === 'orphaned') return false
    if (!existing.resolvedAt) return false

    this.transact(() => {
      this.map.set(
        id,
        buildAnnotationRecord({
          ...existing,
          resolvedAt: undefined,
          resolvedBy: undefined
        })
      )
    })
    return true
  }

  markOrphaned(id: string): boolean {
    const existing = this.get(id)
    if (!existing || existing.status === 'orphaned') return false
    this.transact(() => {
      this.map.set(id, buildAnnotationRecord({ ...existing, status: 'orphaned' }))
    })
    return true
  }

  markOrphanedByComponent(componentId: string): number {
    let count = 0
    this.transact(() => {
      for (const record of this.list()) {
        if (record.componentId !== componentId || record.status === 'orphaned') continue
        this.map.set(record.id, buildAnnotationRecord({ ...record, status: 'orphaned' }))
        count += 1
      }
    })
    return count
  }

  removeByComponent(componentId: string): number {
    let count = 0
    this.transact(() => {
      for (const record of this.list()) {
        if (record.componentId !== componentId) continue
        this.map.delete(record.id)
        count += 1
      }
    })
    return count
  }

  replaceRecord(id: string, record: CollaborativeAnnotationRecord): boolean {
    const parsed = parseAnnotationRecord(record)
    if (!parsed || parsed.id !== id) return false
    this.transact(() => {
      this.map.set(id, parsed)
    })
    return true
  }

  observe(handler: () => void): () => void {
    this.map.observe(handler)
    return () => this.map.unobserve(handler)
  }

  private transact(fn: () => void): void {
    const doc = this.map.doc
    if (doc) doc.transact(fn, this.origin)
    else fn()
  }
}

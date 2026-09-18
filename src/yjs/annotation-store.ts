import * as Y from 'yjs'
import type { JsonValue } from '../operation-types.js'
import {
  ANNOTATIONS_ROOT_KEY,
  type AnnotationType,
  type CollaborativeAnnotationRecord
} from './annotation-types.js'
import { createV2AnnotationMap, getOrCreateRepliesMap } from './annotation-crdt.js'
import {
  buildAnnotationRecord,
  sanitizeAnnotationBody,
  sanitizeAnnotationData,
  sanitizeAnnotationId,
  sanitizeIsoTimestamp
} from './annotation-payload.js'
import { getV2Meta, parseAnnotationStorageValue } from './annotation-storage-parse.js'

export function getOrCreateAnnotationsMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(ANNOTATIONS_ROOT_KEY)
}

export interface AnnotationStoreOptions {
  /**
   * Storage version for new records (default `2`).
   * v1 JSON values remain readable; concurrent replies on v1 still last-write-wins until
   * {@link coordinatedMigrateAnnotationsV1ToV2}.
   */
  writeVersion?: 1 | 2
}

export class AnnotationStore {
  private readonly map: Y.Map<unknown>
  private readonly origin: unknown
  private readonly writeVersion: 1 | 2

  constructor(map: Y.Map<unknown>, origin: unknown = null, options?: AnnotationStoreOptions) {
    this.map = map
    this.origin = origin
    this.writeVersion = options?.writeVersion ?? 2
  }

  list(): CollaborativeAnnotationRecord[] {
    const records: CollaborativeAnnotationRecord[] = []
    this.map.forEach((value) => {
      const parsed = parseAnnotationStorageValue(value)
      if (parsed) records.push(parsed)
    })
    return records
  }

  get(id: string): CollaborativeAnnotationRecord | null {
    return parseAnnotationStorageValue(this.map.get(id))
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
    const createdAt = input.createdAt ?? new Date().toISOString()

    if (this.writeVersion === 2) {
      this.transact(() => {
        const meta = createV2AnnotationMap({
          id,
          type: input.type,
          componentId: input.componentId,
          directiveId: input.directiveId,
          anchor: input.anchor,
          head: input.head,
          authorId: input.authorId,
          createdAt,
          status: 'active',
          data: input.data ? sanitizeAnnotationData(input.data) : undefined
        })
        this.map.set(id, meta)
      })
      return id
    }

    const record = buildAnnotationRecord({
      ...input,
      id,
      createdAt,
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

    const meta = getV2Meta(this.map, id)
    if (meta) {
      this.transact(() => {
        if (sanitized?.body) meta.set('body', sanitized.body)
        else meta.delete('body')
      })
      return true
    }

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

    const replyId = sanitizeAnnotationId(reply.id) ?? crypto.randomUUID()
    const replyRecord = {
      id: replyId,
      authorId: reply.authorId,
      createdAt: sanitizeIsoTimestamp(reply.createdAt) ?? new Date().toISOString(),
      body
    }

    const meta = getV2Meta(this.map, id)
    if (meta) {
      this.transact(() => {
        getOrCreateRepliesMap(meta).set(replyId, replyRecord)
      })
      return true
    }

    const thread = [...(existing.data?.thread ?? [])]
    thread.push(replyRecord)
    return this.updateData(id, { ...existing.data, thread })
  }

  resolve(id: string, resolvedBy: string): boolean {
    const existing = this.get(id)
    if (!existing || existing.status === 'orphaned') return false
    if (existing.resolvedAt) return false

    const meta = getV2Meta(this.map, id)
    if (meta) {
      this.transact(() => {
        meta.set('resolvedAt', new Date().toISOString())
        meta.set('resolvedBy', resolvedBy)
      })
      return true
    }

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

    const meta = getV2Meta(this.map, id)
    if (meta) {
      this.transact(() => {
        meta.delete('resolvedAt')
        meta.delete('resolvedBy')
      })
      return true
    }

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

    const meta = getV2Meta(this.map, id)
    if (meta) {
      this.transact(() => meta.set('status', 'orphaned'))
      return true
    }

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
        const meta = getV2Meta(this.map, record.id)
        if (meta) meta.set('status', 'orphaned')
        else {
          this.map.set(record.id, buildAnnotationRecord({ ...record, status: 'orphaned' }))
        }
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
    const parsed = parseAnnotationStorageValue(record)
    if (!parsed || parsed.id !== id) return false

    const meta = getV2Meta(this.map, id)
    if (meta) {
      this.transact(() => {
        meta.set('anchor', parsed.anchor)
        meta.set('head', parsed.head)
        if (parsed.componentId) meta.set('componentId', parsed.componentId)
        else meta.delete('componentId')
        if (parsed.directiveId) meta.set('directiveId', parsed.directiveId)
        else meta.delete('directiveId')
        meta.set('status', parsed.status)
        if (parsed.resolvedAt) meta.set('resolvedAt', parsed.resolvedAt)
        else {
          meta.delete('resolvedAt')
          meta.delete('resolvedBy')
        }
        if (parsed.resolvedBy) meta.set('resolvedBy', parsed.resolvedBy)
      })
      return true
    }

    this.transact(() => {
      this.map.set(id, buildAnnotationRecord(parsed))
    })
    return true
  }

  observe(handler: () => void): () => void {
    this.map.observeDeep(handler)
    return () => this.map.unobserveDeep(handler)
  }

  private transact(fn: () => void): void {
    const doc = this.map.doc
    if (doc) doc.transact(fn, this.origin)
    else fn()
  }
}

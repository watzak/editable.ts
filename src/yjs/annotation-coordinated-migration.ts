import * as Y from 'yjs'
import {
  createV2AnnotationMap,
  getOrCreateRepliesMap,
  isV2AnnotationMap
} from './annotation-crdt.js'
import { parseAnnotationRecord } from './annotation-payload.js'
import { ANNOTATIONS_ROOT_KEY, type CollaborativeAnnotationRecord } from './annotation-types.js'

function getOrCreateAnnotationsMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(ANNOTATIONS_ROOT_KEY)
}

export interface CoordinatedAnnotationMigrationOptions {
  /** Shared Y.Doc — run only when all peers have quiesced structural/annotation writes. */
  doc: Y.Doc
  /** Optional map; defaults to {@link getOrCreateAnnotationsMap}. */
  annotations?: Y.Map<unknown>
  /** Passed to {@link Y.Doc.transact} — use the same origin as {@link AnnotationStore}. */
  transactionOrigin?: unknown
  /** When true, removes v1 JSON entries after a successful v2 map is written (default true). */
  removeV1AfterMigrate?: boolean
}

/**
 * One-shot v1 JSON → v2 nested {@link Y.Map} migration.
 *
 * Call from a single coordinator (maintenance window or schema version handshake).
 * Do not run concurrently with v1 writers — that would create two write masters.
 */
export function coordinatedMigrateAnnotationsV1ToV2(
  options: CoordinatedAnnotationMigrationOptions
): { migrated: number; skipped: number } {
  const map = options.annotations ?? getOrCreateAnnotationsMap(options.doc)
  const toMigrate: CollaborativeAnnotationRecord[] = []

  map.forEach((value) => {
    if (isV2AnnotationMap(value)) return
    const parsed = parseAnnotationRecord(value)
    if (parsed) toMigrate.push(parsed)
  })

  let migrated = 0
  let skipped = 0

  const run = (): void => {
    for (const record of toMigrate) {
      if (isV2AnnotationMap(map.get(record.id))) {
        skipped += 1
        continue
      }

      const meta = createV2AnnotationMap({
        id: record.id,
        type: record.type,
        componentId: record.componentId,
        directiveId: record.directiveId,
        anchor: record.anchor,
        head: record.head,
        authorId: record.authorId,
        createdAt: record.createdAt,
        status: record.status,
        data: record.data
      })
      if (record.resolvedAt) meta.set('resolvedAt', record.resolvedAt)
      if (record.resolvedBy) meta.set('resolvedBy', record.resolvedBy)

      const replies = getOrCreateRepliesMap(meta)
      for (const reply of record.data?.thread ?? []) {
        replies.set(reply.id, reply)
      }

      map.set(record.id, meta)
      migrated += 1
    }
  }

  if (options.transactionOrigin !== undefined) {
    options.doc.transact(run, options.transactionOrigin)
  } else {
    options.doc.transact(run)
  }

  return { migrated, skipped }
}

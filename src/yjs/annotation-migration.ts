import * as Y from 'yjs'
import type { JsonValue } from '../operation-types.js'
import type { CollaborativeAnnotationRecord } from './annotation-types.js'
import { buildAnnotationRecord } from './annotation-payload.js'
import type { AnnotationStore } from './annotation-store.js'
import { offsetsToRelativePositionJson, resolvePresenceSelection } from './relative-position.js'

export interface AnnotationSplitMigrationContext {
  store: AnnotationStore
  splitOffset: number
  sourceYText: Y.Text
  targetYText: Y.Text
  sourceComponentId?: string
  sourceDirectiveId?: string
  targetComponentId?: string
  targetDirectiveId?: string
}

/**
 * After a block split, annotations whose anchor lies at/after `splitOffset`
 * migrate to the new directive's Y.Text. Spanning ranges follow the anchor side.
 */
export function migrateAnnotationsOnSplit(ctx: AnnotationSplitMigrationContext): number {
  const doc = ctx.sourceYText.doc
  if (!doc || ctx.sourceYText.doc !== doc || ctx.targetYText.doc !== doc) return 0

  let migrated = 0
  for (const record of ctx.store.list()) {
    if (!matchesDirective(record, ctx.sourceComponentId, ctx.sourceDirectiveId)) continue
    if (record.status === 'orphaned') continue

    const resolved = resolvePresenceSelection(doc, ctx.sourceYText, record.anchor, record.head)
    if (!resolved) continue

    const anchor = resolved.anchor
    const head = resolved.head
    if (anchor < ctx.splitOffset) continue

    const targetLength = ctx.targetYText.length
    const nextAnchor = anchor - ctx.splitOffset
    const nextHead = head - ctx.splitOffset
    const positions = offsetsToRelativePositionJson(
      ctx.targetYText,
      nextAnchor,
      nextHead,
      targetLength
    )

    ctx.store.replaceRecord(
      record.id,
      buildAnnotationRecord({
        ...record,
        componentId: ctx.targetComponentId ?? record.componentId,
        directiveId: ctx.targetDirectiveId ?? record.directiveId,
        anchor: positions.anchor,
        head: positions.head
      })
    )
    migrated += 1
  }

  return migrated
}

export interface AnnotationMergeMigrationContext {
  store: AnnotationStore
  mergeOffset: number
  targetYText: Y.Text
  sourceYText: Y.Text
  targetComponentId?: string
  targetDirectiveId?: string
  sourceComponentId?: string
  sourceDirectiveId?: string
}

/** Moves annotations from the merged-away block onto the surviving Y.Text. */
export function migrateAnnotationsOnMerge(ctx: AnnotationMergeMigrationContext): number {
  const doc = ctx.targetYText.doc
  if (!doc || ctx.sourceYText.doc !== doc || ctx.targetYText.doc !== doc) return 0

  let migrated = 0
  for (const record of ctx.store.list()) {
    if (!matchesDirective(record, ctx.sourceComponentId, ctx.sourceDirectiveId)) continue
    if (record.status === 'orphaned') continue

    const resolved = resolvePresenceSelection(doc, ctx.sourceYText, record.anchor, record.head)
    if (!resolved) {
      ctx.store.markOrphaned(record.id)
      continue
    }

    const targetLength = ctx.targetYText.length + ctx.sourceYText.length
    const nextAnchor = resolved.anchor + ctx.mergeOffset
    const nextHead = resolved.head + ctx.mergeOffset
    const positions = offsetsToRelativePositionJson(
      ctx.targetYText,
      nextAnchor,
      nextHead,
      targetLength
    )

    ctx.store.replaceRecord(
      record.id,
      buildAnnotationRecord({
        ...record,
        componentId: ctx.targetComponentId ?? record.componentId,
        directiveId: ctx.targetDirectiveId ?? record.directiveId,
        anchor: positions.anchor,
        head: positions.head
      })
    )
    migrated += 1
  }

  return migrated
}

export function reencodeAnnotationPositions(
  doc: Y.Doc,
  yText: Y.Text,
  record: CollaborativeAnnotationRecord
): { anchor: JsonValue | null; head: JsonValue | null } | null {
  const resolved = resolvePresenceSelection(doc, yText, record.anchor, record.head)
  if (!resolved) return null
  return offsetsToRelativePositionJson(yText, resolved.anchor, resolved.head, yText.length)
}

function matchesDirective(
  record: CollaborativeAnnotationRecord,
  componentId: string | undefined,
  directiveId: string | undefined
): boolean {
  if (componentId && record.componentId !== componentId) return false
  if (directiveId && record.directiveId !== directiveId) return false
  if (!componentId && !directiveId) return !record.componentId && !record.directiveId
  return true
}

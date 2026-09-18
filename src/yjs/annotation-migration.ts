import * as Y from 'yjs'
import type { JsonValue } from '../operation-types.js'
import type { CollaborativeAnnotationRecord } from './annotation-types.js'
import { buildAnnotationRecord } from './annotation-payload.js'
import type { AnnotationStore } from './annotation-store.js'
import {
  DEFAULT_ANNOTATION_SPLIT_POLICY,
  normalizeAnnotationSpan,
  shouldMigrateAnnotationToSplitTarget,
  sourceSpanAfterSplit,
  targetSpanAfterSplit,
  type AnnotationSplitMigrationPolicy
} from './annotation-split-policy.js'
import { offsetsToRelativePositionJson, resolvePresenceSelection } from './relative-position.js'

export interface AnnotationSplitSnapshot {
  record: CollaborativeAnnotationRecord
  anchor: number
  head: number
}

export interface AnnotationSplitMigrationContext {
  store: AnnotationStore
  splitOffset: number
  sourceYText: Y.Text
  targetYText: Y.Text
  sourceComponentId?: string
  sourceDirectiveId?: string
  targetComponentId?: string
  targetDirectiveId?: string
  /** Pre-captured offsets — required when {@link sourceYText} may already be truncated. */
  snapshots?: AnnotationSplitSnapshot[]
  policy?: AnnotationSplitMigrationPolicy
}

/**
 * Captures UTF-16 anchor/head **before** structural {@link Y.Text} mutation (split/merge).
 */
export function captureAnnotationSnapshotsBeforeSplit(
  ctx: Omit<AnnotationSplitMigrationContext, 'snapshots'>
): AnnotationSplitSnapshot[] {
  const doc = ctx.sourceYText.doc
  if (!doc) return []

  const snapshots: AnnotationSplitSnapshot[] = []
  for (const record of ctx.store.list()) {
    if (!matchesDirective(record, ctx.sourceComponentId, ctx.sourceDirectiveId)) continue
    if (record.status === 'orphaned') continue

    const resolved = resolvePresenceSelection(doc, ctx.sourceYText, record.anchor, record.head)
    if (!resolved) continue
    snapshots.push({ record, anchor: resolved.anchor, head: resolved.head })
  }
  return snapshots
}

/**
 * After a block split, annotations migrate per {@link DEFAULT_ANNOTATION_SPLIT_POLICY}.
 * Spanning ranges clip on the source block unless the anchor lies in the tail segment.
 */
export function migrateAnnotationsOnSplit(ctx: AnnotationSplitMigrationContext): number {
  const doc = ctx.sourceYText.doc
  if (!doc || ctx.sourceYText.doc !== doc || ctx.targetYText.doc !== doc) return 0

  const policy = ctx.policy ?? DEFAULT_ANNOTATION_SPLIT_POLICY
  const snapshots = ctx.snapshots ?? captureAnnotationSnapshotsBeforeSplit(ctx)

  let migrated = 0
  for (const snap of snapshots) {
    const span = normalizeAnnotationSpan(snap.anchor, snap.head, ctx.splitOffset)
    const migrate = shouldMigrateAnnotationToSplitTarget(span, ctx.splitOffset, policy)

    if (migrate) {
      const targetOffsets = targetSpanAfterSplit(span, ctx.splitOffset, policy)
      if (!targetOffsets) continue
      const targetLength = ctx.targetYText.length
      const positions = offsetsToRelativePositionJson(
        ctx.targetYText,
        targetOffsets.anchor,
        targetOffsets.head,
        targetLength
      )
      ctx.store.replaceRecord(
        snap.record.id,
        buildAnnotationRecord({
          ...snap.record,
          componentId: ctx.targetComponentId ?? snap.record.componentId,
          directiveId: ctx.targetDirectiveId ?? snap.record.directiveId,
          anchor: positions.anchor,
          head: positions.head
        })
      )
      migrated += 1
      continue
    }

    const sourceOffsets = sourceSpanAfterSplit(span, ctx.splitOffset, policy)
    if (!sourceOffsets) continue

    const sourceLength = ctx.sourceYText.length
    const positions = offsetsToRelativePositionJson(
      ctx.sourceYText,
      sourceOffsets.anchor,
      sourceOffsets.head,
      sourceLength
    )
    ctx.store.replaceRecord(
      snap.record.id,
      buildAnnotationRecord({
        ...snap.record,
        anchor: positions.anchor,
        head: positions.head
      })
    )
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

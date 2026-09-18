/**
 * Policy for remapping annotations when a directive {@link Y.Text} is split.
 * See docs/adr/002-structural-edit-concurrency.md.
 */

/** How a range that crosses the split offset is handled. */
export type CrossingRangeSplitPolicy = 'clip-to-source' | 'follow-anchor-side'

/**
 * Backward (right-to-left) selections use raw anchor/head for side decisions;
 * rendered span still uses min/max (see {@link resolveAnnotationRange}).
 */
export type BackwardSelectionSplitPolicy = 'anchor-decides-block'

export interface AnnotationSplitMigrationPolicy {
  crossingRange: CrossingRangeSplitPolicy
  backwardSelection: BackwardSelectionSplitPolicy
}

export const DEFAULT_ANNOTATION_SPLIT_POLICY: AnnotationSplitMigrationPolicy = {
  crossingRange: 'clip-to-source',
  backwardSelection: 'anchor-decides-block'
}

export interface NormalizedAnnotationSpan {
  anchor: number
  head: number
  start: number
  end: number
  /** Block side used when {@link CrossingRangeSplitPolicy} is `follow-anchor-side`. */
  anchorSide: 'before-split' | 'at-or-after-split'
}

export function normalizeAnnotationSpan(
  anchor: number,
  head: number,
  splitOffset: number
): NormalizedAnnotationSpan {
  const start = Math.min(anchor, head)
  const end = Math.max(anchor, head)
  return {
    anchor,
    head,
    start,
    end,
    anchorSide: anchor >= splitOffset ? 'at-or-after-split' : 'before-split'
  }
}

/** Returns true when the annotation should migrate to the post-split target block. */
export function shouldMigrateAnnotationToSplitTarget(
  span: NormalizedAnnotationSpan,
  splitOffset: number,
  policy: AnnotationSplitMigrationPolicy = DEFAULT_ANNOTATION_SPLIT_POLICY
): boolean {
  if (span.start >= splitOffset) return true
  if (span.end <= splitOffset) return false

  switch (policy.crossingRange) {
    case 'follow-anchor-side':
      return span.anchorSide === 'at-or-after-split'
    case 'clip-to-source':
    default:
      return false
  }
}

/** Offsets to persist on the source block after split (crossing ranges may clip). */
export function sourceSpanAfterSplit(
  span: NormalizedAnnotationSpan,
  splitOffset: number,
  policy: AnnotationSplitMigrationPolicy = DEFAULT_ANNOTATION_SPLIT_POLICY
): { anchor: number; head: number } | null {
  if (shouldMigrateAnnotationToSplitTarget(span, splitOffset, policy)) return null
  if (span.end <= splitOffset) {
    return { anchor: span.anchor, head: span.head }
  }
  if (policy.crossingRange === 'clip-to-source') {
    const clipHead = Math.min(span.head, splitOffset)
    const clipAnchor = Math.min(span.anchor, splitOffset)
    return { anchor: clipAnchor, head: clipHead }
  }
  return { anchor: span.anchor, head: span.head }
}

/** Offsets on the target block (UTF-16 indices in the tail segment). */
export function targetSpanAfterSplit(
  span: NormalizedAnnotationSpan,
  splitOffset: number,
  policy: AnnotationSplitMigrationPolicy = DEFAULT_ANNOTATION_SPLIT_POLICY
): { anchor: number; head: number } | null {
  if (!shouldMigrateAnnotationToSplitTarget(span, splitOffset, policy)) {
    if (
      span.start < splitOffset &&
      span.end > splitOffset &&
      policy.crossingRange === 'clip-to-source'
    ) {
      return null
    }
    return null
  }
  return {
    anchor: span.anchor - splitOffset,
    head: span.head - splitOffset
  }
}

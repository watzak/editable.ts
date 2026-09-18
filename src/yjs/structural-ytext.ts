import * as Y from 'yjs'
import type { JsonValue } from '../operation-types.js'

export interface YTextDeltaSegment {
  insert: string
  attributes?: Record<string, JsonValue>
}

/** Splits a {@link Y.Text} string index into attributed delta segments (rich-text safe). */
export function splitYTextDeltaAt(
  yText: Y.Text,
  offset: number
): { before: YTextDeltaSegment[]; after: YTextDeltaSegment[] } {
  const clamped = Math.max(0, Math.min(offset, yText.length))
  const delta = yText.toDelta() as Array<{
    insert?: unknown
    attributes?: Record<string, JsonValue>
  }>
  const before: YTextDeltaSegment[] = []
  const after: YTextDeltaSegment[] = []
  let index = 0
  let splitDone = false

  for (const op of delta) {
    if (typeof op.insert !== 'string' || op.insert.length === 0) continue
    const text = op.insert
    const attrs = op.attributes

    if (!splitDone) {
      if (index + text.length <= clamped) {
        before.push({ insert: text, ...(attrs ? { attributes: attrs } : {}) })
        index += text.length
        continue
      }

      const local = clamped - index
      if (local > 0) {
        before.push({ insert: text.slice(0, local), ...(attrs ? { attributes: attrs } : {}) })
      }
      const rest = text.slice(local)
      if (rest.length > 0) {
        after.push({ insert: rest, ...(attrs ? { attributes: attrs } : {}) })
      }
      splitDone = true
      continue
    }

    after.push({ insert: text, ...(attrs ? { attributes: attrs } : {}) })
  }

  return { before, after }
}

export function applyDeltaSegments(target: Y.Text, segments: YTextDeltaSegment[]): void {
  if (target.length > 0) target.delete(0, target.length)
  let index = 0
  for (const segment of segments) {
    if (!segment.insert) continue
    target.insert(index, segment.insert, segment.attributes ?? undefined)
    index += segment.insert.length
  }
}

/** Moves the tail segment to `target` without deleting/reinserting the unchanged source prefix. */
export function moveYTextTailToTarget(source: Y.Text, offset: number, target: Y.Text): void {
  const clamped = Math.max(0, Math.min(offset, source.length))
  const { after } = splitYTextDeltaAt(source, clamped)
  const tailLength = source.length - clamped
  if (tailLength > 0) {
    source.delete(clamped, tailLength)
  }
  let index = target.length
  for (const segment of after) {
    if (!segment.insert) continue
    target.insert(index, segment.insert, segment.attributes ?? undefined)
    index += segment.insert.length
  }
}

export function mergeYTextIntoTarget(target: Y.Text, source: Y.Text): void {
  const tailStart = target.length
  const delta = source.toDelta() as Array<{
    insert?: unknown
    attributes?: Record<string, JsonValue>
  }>
  let index = tailStart
  for (const op of delta) {
    if (typeof op.insert !== 'string' || op.insert.length === 0) continue
    target.insert(index, op.insert, op.attributes ?? undefined)
    index += op.insert.length
  }
  if (source.length > 0) source.delete(0, source.length)
}

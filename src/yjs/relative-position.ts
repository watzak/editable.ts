import * as Y from 'yjs'
import type { JsonValue } from '../operation-types.js'

export interface ResolvedPresenceSelection {
  anchor: number
  head: number
}

/** Converts UTF-16 offsets within `yText` to JSON-serializable relative positions. */
export function offsetsToRelativePositionJson(
  yText: Y.Text,
  anchor: number,
  head: number,
  textLength: number
): { anchor: JsonValue | null; head: JsonValue | null } {
  const safeAnchor = clampOffset(anchor, textLength)
  const safeHead = clampOffset(head, textLength)
  const forward = safeHead >= safeAnchor

  return {
    anchor: relativePositionJsonFromIndex(yText, safeAnchor, forward ? -1 : 1),
    head: relativePositionJsonFromIndex(yText, safeHead, forward ? 1 : -1)
  }
}

function relativePositionJsonFromIndex(
  yText: Y.Text,
  index: number,
  assoc: number
): JsonValue | null {
  if (!Number.isInteger(index) || index < 0) return null
  try {
    const relPos = Y.createRelativePositionFromTypeIndex(yText, index, assoc)
    return Y.relativePositionToJSON(relPos) as JsonValue
  } catch {
    return null
  }
}

/** Resolves relative positions against `doc`, accepting only positions on `expectedText`. */
export function resolvePresenceSelection(
  doc: Y.Doc,
  expectedText: Y.Text,
  anchorJson: JsonValue | null,
  headJson: JsonValue | null
): ResolvedPresenceSelection | null {
  const textLength = expectedText.length
  const anchor = resolveRelativeIndex(doc, expectedText, anchorJson, textLength)
  const head = resolveRelativeIndex(doc, expectedText, headJson, textLength)

  if (anchor === null || head === null) return null
  return { anchor, head }
}

/** Validates JSON emitted by {@link Y.relativePositionToJSON}. */
export function isRelativePositionJson(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  if (obj.type != null && typeof obj.type !== 'object') return false
  if (obj.tname != null && typeof obj.tname !== 'string') return false
  if (obj.item != null && typeof obj.item !== 'object') return false
  if (obj.assoc != null && typeof obj.assoc !== 'number') return false
  return obj.type != null || obj.tname != null || obj.item != null
}

function resolveRelativeIndex(
  doc: Y.Doc,
  expectedText: Y.Text,
  relJson: JsonValue | null,
  textLength: number
): number | null {
  if (relJson === null) return textLength === 0 ? 0 : null
  if (!relJson || typeof relJson !== 'object' || Array.isArray(relJson)) return null

  try {
    const relPos = Y.createRelativePositionFromJSON(relJson)
    const absolute = Y.createAbsolutePositionFromRelativePosition(relPos, doc)
    if (!absolute || absolute.type !== expectedText) return null
    if (!Number.isInteger(absolute.index) || absolute.index < 0 || absolute.index > textLength) {
      return null
    }
    return absolute.index
  } catch {
    return null
  }
}

function clampOffset(offset: number, textLength: number): number {
  if (!Number.isFinite(offset)) return 0
  return Math.max(0, Math.min(Math.trunc(offset), textLength))
}

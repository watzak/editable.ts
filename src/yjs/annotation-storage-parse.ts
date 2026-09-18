import * as Y from 'yjs'
import { parseAnnotationRecordFromV2Map, isV2AnnotationMap } from './annotation-crdt.js'
import { parseAnnotationRecord } from './annotation-payload.js'
import type { CollaborativeAnnotationRecord } from './annotation-types.js'

/** Parses either v1 JSON map values or v2 nested {@link Y.Map} entries. */
export function parseAnnotationStorageValue(value: unknown): CollaborativeAnnotationRecord | null {
  if (isV2AnnotationMap(value)) return parseAnnotationRecordFromV2Map(value)
  return parseAnnotationRecord(value)
}

export function getV2Meta(map: Y.Map<unknown>, id: string): Y.Map<unknown> | null {
  const entry = map.get(id)
  return isV2AnnotationMap(entry) ? entry : null
}

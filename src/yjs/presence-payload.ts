import type { JsonValue } from '../operation-types.js'

/** Awareness state field for editable.ts presence payloads. */
export const PRESENCE_STATE_KEY = 'editable.ts:presence:v1'

export const PRESENCE_PAYLOAD_VERSION = 1 as const

/** Wire format stored in {@link Awareness} — never persisted in Y.Text. */
export interface PresencePayloadV1 {
  v: typeof PRESENCE_PAYLOAD_VERSION
  /** JSON-serialized {@link Y.RelativePosition} for selection anchor. */
  anchor: JsonValue | null
  /** JSON-serialized {@link Y.RelativePosition} for selection head. */
  head: JsonValue | null
  name: string
  color: string
  focused: boolean
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const MAX_NAME_LENGTH = 64
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const RGB_COLOR = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/
const HSL_COLOR = /^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+\s*)?\)$/

export function sanitizePresenceName(value: unknown): string {
  if (typeof value !== 'string') return 'Anonymous'
  const stripped = value
    .replace(CONTROL_CHARS, '')
    .replace(/[<>"'`]/g, '')
    .trim()
  if (!stripped) return 'Anonymous'
  return stripped.slice(0, MAX_NAME_LENGTH)
}

export function sanitizePresenceColor(value: unknown): string {
  if (typeof value !== 'string') return '#6366f1'
  const trimmed = value.trim()
  if (HEX_COLOR.test(trimmed) || RGB_COLOR.test(trimmed) || HSL_COLOR.test(trimmed)) {
    return trimmed.slice(0, 64)
  }
  return '#6366f1'
}

export function buildPresencePayload(input: {
  anchor: JsonValue | null
  head: JsonValue | null
  name: string
  color: string
  focused: boolean
}): PresencePayloadV1 {
  return {
    v: PRESENCE_PAYLOAD_VERSION,
    anchor: input.anchor,
    head: input.head,
    name: sanitizePresenceName(input.name),
    color: sanitizePresenceColor(input.color),
    focused: input.focused === true
  }
}

export function parsePresencePayload(raw: unknown): PresencePayloadV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Record<string, unknown>
  if (candidate.v !== PRESENCE_PAYLOAD_VERSION) return null

  const anchor = candidate.anchor
  const head = candidate.head
  if (anchor !== null && !isRelativePositionJson(anchor)) return null
  if (head !== null && !isRelativePositionJson(head)) return null

  return {
    v: PRESENCE_PAYLOAD_VERSION,
    anchor: anchor as JsonValue | null,
    head: head as JsonValue | null,
    name: sanitizePresenceName(candidate.name),
    color: sanitizePresenceColor(candidate.color),
    focused: candidate.focused === true
  }
}

function isRelativePositionJson(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  if (obj.type != null && typeof obj.type !== 'object') return false
  if (obj.tname != null && typeof obj.tname !== 'string') return false
  if (obj.item != null && typeof obj.item !== 'object') return false
  if (obj.assoc != null && typeof obj.assoc !== 'number') return false
  return obj.type != null || obj.tname != null || obj.item != null
}

/** Confirms awareness payload keys are presence-only and not document content. */
export function isPresenceOnlyAwarenessState(state: Record<string, unknown> | null): boolean {
  if (!state) return true
  const keys = Object.keys(state)
  return keys.every((key) => key === PRESENCE_STATE_KEY || key.startsWith('editable.ts:'))
}

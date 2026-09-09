import {
  buildPresencePayload,
  isPresenceOnlyAwarenessState,
  parsePresencePayload,
  sanitizePresenceColor,
  sanitizePresenceName
} from '../../src/yjs/presence-payload.js'

describe('presence payload', function () {
  it('sanitizes XSS in names and colors', function () {
    expect(sanitizePresenceName('<img onerror=alert(1)>')).toBe('img onerror=alert(1)')
    expect(sanitizePresenceColor('javascript:alert(1)')).toBe('#6366f1')
    expect(sanitizePresenceColor('#ff00aa')).toBe('#ff00aa')
    expect(sanitizePresenceColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
  })

  it('validates versioned payload shape', function () {
    const payload = buildPresencePayload({
      anchor: { type: { client: 1, clock: 0 }, tname: null, item: null, assoc: 0 },
      head: { type: { client: 1, clock: 0 }, tname: null, item: null, assoc: 0 },
      name: 'Ada',
      color: '#336699',
      focused: true
    })

    expect(parsePresencePayload(payload)?.name).toBe('Ada')
    expect(parsePresencePayload({ ...payload, v: 2 })).toBeNull()
    expect(parsePresencePayload({ ...payload, anchor: 'bad' })).toBeNull()
  })

  it('flags non-presence awareness keys', function () {
    expect(isPresenceOnlyAwarenessState({ 'editable.ts:presence:v1': {} })).toBe(true)
    expect(isPresenceOnlyAwarenessState({ content: 'secret' })).toBe(false)
  })
})

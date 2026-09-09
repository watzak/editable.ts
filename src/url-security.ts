/** Shared URL validation for paste sanitization and rich-text link codecs. */

export const ALLOWED_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
export const BLOCKED_URL_PROTOCOLS = new Set(['javascript', 'data', 'vbscript', 'file'])

// oxlint-disable-next-line eslint/no-control-regex -- strip control chars from URLs
const LEADING_URL_WHITESPACE = /^[\s\u0000-\u001f\u007f]+/
// oxlint-disable-next-line eslint/no-control-regex -- strip control chars from URLs
const URL_CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const URL_PROTOCOL_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

export function decodeUrlAttributeValue(value: string, doc: Document): string {
  const textarea = doc.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value.replace(URL_CONTROL_CHARS, '').replace(LEADING_URL_WHITESPACE, '').trim()
}

export function normalizeUrlForSecurityCheck(value: string, doc: Document): string {
  const strippedInput = value.replace(URL_CONTROL_CHARS, '').replace(/\uFFFD/g, '')
  return decodeUrlAttributeValue(strippedInput, doc)
    .replace(URL_CONTROL_CHARS, '')
    .replace(/\uFFFD/g, '')
}

export function extractUrlProtocol(url: string): string | null {
  const match = url.match(URL_PROTOCOL_PATTERN)
  return match ? match[1].toLowerCase() : null
}

export function isAllowedUrl(value: string, doc: Document): boolean {
  const normalized = normalizeUrlForSecurityCheck(value, doc)
  if (!normalized) return false

  if (normalized.startsWith('#') || normalized.startsWith('?')) return true
  if (normalized.startsWith('//')) return true

  const protocol = extractUrlProtocol(normalized)
  if (!protocol) return true
  if (BLOCKED_URL_PROTOCOLS.has(protocol)) return false

  return ALLOWED_URL_PROTOCOLS.has(protocol)
}

export function sanitizeUrlAttribute(value: string, doc: Document): string | null {
  const normalized = normalizeUrlForSecurityCheck(value, doc)
  if (!isAllowedUrl(normalized, doc)) return null
  return normalized
}

export function normalizeRelForBlankTarget(rel: string | undefined): string {
  const tokens = new Set((rel || '').split(/\s+/).filter(Boolean))
  tokens.add('noopener')
  tokens.add('noreferrer')
  return Array.from(tokens).join(' ')
}

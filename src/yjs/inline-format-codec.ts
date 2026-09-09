import { isAllowedUrl, normalizeRelForBlankTarget, sanitizeUrlAttribute } from '../url-security.js'
import type { JsonValue, TextAttributes } from '../operation-types.js'

/** Canonical Y.Text attribute key for a registered inline format. */
export type FormatYjsKey = 'bold' | 'italic' | 'underline' | 'link'

export interface LinkAttributeValue {
  href: string
  rel?: string
  target?: string
}

export interface InlineFormatCodec {
  readonly yjsKey: FormatYjsKey
  readonly domTags: readonly string[]
  /** Returns the Yjs value when `element` carries this format, otherwise undefined. */
  readDomElement(element: Element, doc: Document): JsonValue | undefined
  /** Builds a safe wrapper element for `value`, or null when rejected. */
  createDomWrapper(doc: Document, value: JsonValue): HTMLElement | null
  /** Sanitizes a remote Yjs value; returns null to strip the attribute. */
  sanitizeYjsValue(value: JsonValue, doc: Document): JsonValue | null
}

const BOLD_TAGS = ['strong', 'b'] as const
const ITALIC_TAGS = ['em', 'i'] as const
const UNDERLINE_TAGS = ['u'] as const
const LINK_TAGS = ['a'] as const

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBooleanFormat(element: Element, tags: readonly string[]): true | undefined {
  const name = element.nodeName.toLowerCase()
  return tags.includes(name as (typeof tags)[number]) ? true : undefined
}

const boldCodec: InlineFormatCodec = {
  yjsKey: 'bold',
  domTags: BOLD_TAGS,
  readDomElement(element) {
    return readBooleanFormat(element, BOLD_TAGS)
  },
  createDomWrapper(doc) {
    return doc.createElement('strong')
  },
  sanitizeYjsValue(value) {
    return value === true ? true : null
  }
}

const italicCodec: InlineFormatCodec = {
  yjsKey: 'italic',
  domTags: ITALIC_TAGS,
  readDomElement(element) {
    return readBooleanFormat(element, ITALIC_TAGS)
  },
  createDomWrapper(doc) {
    return doc.createElement('em')
  },
  sanitizeYjsValue(value) {
    return value === true ? true : null
  }
}

const underlineCodec: InlineFormatCodec = {
  yjsKey: 'underline',
  domTags: UNDERLINE_TAGS,
  readDomElement(element) {
    return readBooleanFormat(element, UNDERLINE_TAGS)
  },
  createDomWrapper(doc) {
    return doc.createElement('u')
  },
  sanitizeYjsValue(value) {
    return value === true ? true : null
  }
}

const linkCodec: InlineFormatCodec = {
  yjsKey: 'link',
  domTags: LINK_TAGS,
  readDomElement(element, doc) {
    if (element.nodeName !== 'A') return undefined
    const href = element.getAttribute('href')
    if (!href) return undefined
    const sanitizedHref = sanitizeUrlAttribute(href, doc)
    if (!sanitizedHref) return undefined

    const link: LinkAttributeValue = { href: sanitizedHref }
    const target = element.getAttribute('target')
    if (target === '_blank') {
      link.target = '_blank'
      link.rel = normalizeRelForBlankTarget(element.getAttribute('rel') ?? undefined)
    } else if (target) {
      return undefined
    }

    const rel = element.getAttribute('rel')
    if (rel && !link.rel) link.rel = rel

    if (element.attributes.length > 0) {
      for (let i = 0; i < element.attributes.length; i += 1) {
        const attr = element.attributes.item(i)
        if (!attr) continue
        const key = attr.name.toLowerCase()
        if (key === 'href' || key === 'rel' || key === 'target') continue
        return undefined
      }
    }

    return link as unknown as JsonValue
  },
  createDomWrapper(doc, value) {
    if (!isJsonObject(value) || typeof value.href !== 'string') return null
    const href = sanitizeUrlAttribute(value.href, doc)
    if (!href) return null

    const anchor = doc.createElement('a')
    anchor.setAttribute('href', href)

    const target = value.target
    if (target === '_blank') {
      anchor.setAttribute('target', '_blank')
      const rel =
        typeof value.rel === 'string'
          ? normalizeRelForBlankTarget(value.rel)
          : normalizeRelForBlankTarget(undefined)
      anchor.setAttribute('rel', rel)
    } else if (target !== undefined && target !== null) {
      return null
    } else if (typeof value.rel === 'string' && value.rel) {
      anchor.setAttribute('rel', value.rel)
    }

    return anchor
  },
  sanitizeYjsValue(value, doc) {
    if (!isJsonObject(value) || typeof value.href !== 'string') return null
    const href = sanitizeUrlAttribute(value.href, doc)
    if (!href) return null

    const sanitized: LinkAttributeValue = { href }
    if (value.target === '_blank') {
      sanitized.target = '_blank'
      sanitized.rel =
        typeof value.rel === 'string'
          ? normalizeRelForBlankTarget(value.rel)
          : normalizeRelForBlankTarget(undefined)
    } else if (value.target !== undefined && value.target !== null) {
      return null
    } else if (typeof value.rel === 'string' && value.rel) {
      sanitized.rel = value.rel
    }

    return sanitized as unknown as JsonValue
  }
}

const DEFAULT_CODECS: InlineFormatCodec[] = [boldCodec, italicCodec, underlineCodec, linkCodec]

/** Registry mapping DOM inline marks to canonical Y.Text delta attributes. */
export class InlineFormatRegistry {
  private codecs = new Map<FormatYjsKey, InlineFormatCodec>()
  private tagToCodec = new Map<string, InlineFormatCodec>()

  constructor(codecs: readonly InlineFormatCodec[] = DEFAULT_CODECS) {
    for (const codec of codecs) {
      this.register(codec)
    }
  }

  register(codec: InlineFormatCodec): void {
    this.codecs.set(codec.yjsKey, codec)
    for (const tag of codec.domTags) {
      this.tagToCodec.set(tag.toLowerCase(), codec)
    }
  }

  getCodec(key: FormatYjsKey): InlineFormatCodec | undefined {
    return this.codecs.get(key)
  }

  codecForTag(tagName: string): InlineFormatCodec | undefined {
    return this.tagToCodec.get(tagName.toLowerCase())
  }

  /** Reads active formats from an ancestor element stack (innermost last). */
  readDomStack(elements: readonly Element[], doc: Document): TextAttributes {
    const attributes: TextAttributes = {}
    for (const element of elements) {
      for (const codec of this.codecs.values()) {
        if (attributes[codec.yjsKey] !== undefined) continue
        const value = codec.readDomElement(element, doc)
        if (value !== undefined) {
          attributes[codec.yjsKey] = value
        }
      }
    }
    return attributes
  }

  /** Sanitizes remote delta attributes; unknown keys are dropped. */
  sanitizeDeltaAttributes(
    attributes: Record<string, unknown> | undefined,
    doc: Document
  ): TextAttributes | undefined {
    if (!attributes) return undefined

    const sanitized: TextAttributes = {}
    for (const [key, rawValue] of Object.entries(attributes)) {
      const codec = this.codecs.get(key as FormatYjsKey)
      if (!codec) continue
      if (rawValue === null) {
        sanitized[key] = null
        continue
      }
      const value = codec.sanitizeYjsValue(rawValue as JsonValue, doc)
      if (value !== null) sanitized[key] = value
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined
  }

  /** Converts Yjs attributes to a Y.Text format map (`null` removes keys). */
  toYTextFormatMap(attributes: TextAttributes, doc: Document): Record<string, unknown> {
    const format: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attributes)) {
      const codec = this.codecs.get(key as FormatYjsKey)
      if (!codec) continue
      if (value === null) {
        format[key] = null
        continue
      }
      const sanitized = codec.sanitizeYjsValue(value as JsonValue, doc)
      if (sanitized !== null) format[key] = sanitized
    }
    return format
  }

  /**
   * Wraps a text node with registered format wrappers in deterministic order:
   * link → bold → italic → underline (innermost).
   */
  wrapStyledText(doc: Document, text: string, attributes?: TextAttributes): Node {
    if (!text) return doc.createTextNode('')
    if (!attributes || Object.keys(attributes).length === 0) {
      return doc.createTextNode(text)
    }

    const order: FormatYjsKey[] = ['link', 'bold', 'italic', 'underline']
    let node: Node = doc.createTextNode(text)

    for (const key of order) {
      const value = attributes[key]
      if (value === undefined || value === null || value === false) continue
      const codec = this.codecs.get(key)
      if (!codec) continue
      const wrapper = codec.createDomWrapper(doc, value as JsonValue)
      if (!wrapper) continue
      wrapper.appendChild(node)
      node = wrapper
    }

    return node
  }

  /** Deterministic merge for overlapping retain attribute updates. */
  mergeAttributeUpdates(
    current: TextAttributes | undefined,
    update: TextAttributes
  ): TextAttributes {
    const merged: TextAttributes = { ...(current ?? {}) }
    for (const [key, value] of Object.entries(update)) {
      if (value === null) {
        delete merged[key]
      } else {
        merged[key] = value
      }
    }
    return merged
  }

  /** Returns true when every character in the span shares `key`. */
  spanHasUniformFormat(
    runs: readonly { text: string; attributes: TextAttributes }[],
    start: number,
    end: number,
    key: FormatYjsKey
  ): boolean {
    if (end <= start) return false
    let index = 0
    for (const run of runs) {
      const runEnd = index + run.text.length
      const overlapStart = Math.max(index, start)
      const overlapEnd = Math.min(runEnd, end)
      if (overlapStart < overlapEnd) {
        if (run.attributes[key] === undefined) return false
      }
      index = runEnd
    }
    return true
  }
}

export const defaultInlineFormatRegistry = new InlineFormatRegistry()

export { isAllowedUrl, sanitizeUrlAttribute }

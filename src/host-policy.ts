import * as block from './block.js'
import {
  defaultInlineFormatRegistry,
  type FormatKey,
  type InlineFormatRegistry
} from './inline-format-codec.js'
import type { TextAttributes } from './operation-types.js'

/** Per-host rich-text and validation policy configured via {@link EnableOptions}. */
export interface EditableHostPolicy {
  /** When true, inline formats and attributed operations are rejected. */
  plainText?: boolean
  /** Inline format registry for this host (defaults to {@link defaultInlineFormatRegistry}). */
  formatRegistry?: InlineFormatRegistry
  /**
   * Allow only these format keys (mutually exclusive with {@link deniedFormats}).
   * Omit for default registry allowlist. Pass `[]` for an **explicit empty allowlist** (no inline formats).
   */
  allowedFormats?: readonly string[]
  /** Deny these format keys (mutually exclusive with {@link allowedFormats}). */
  deniedFormats?: readonly string[]
  /** When false, line-break operations and `<br>` inserts are rejected locally. Default true. */
  allowLineBreaks?: boolean
  minLength?: number
  recommendedMinLength?: number
  recommendedMaxLength?: number
  /** Hard maximum — validates and rejects operations that would exceed it; never truncates silently. */
  maxLength?: number
  /** UI placeholder only — never stored in operation text or Y.Text. */
  placeholder?: string
}

export interface ResolvedHostPolicy {
  plainText: boolean
  formatRegistry: InlineFormatRegistry
  allowedFormats?: readonly string[]
  deniedFormats?: readonly string[]
  allowLineBreaks: boolean
  minLength?: number
  recommendedMinLength?: number
  recommendedMaxLength?: number
  maxLength?: number
  placeholder?: string
}

export type HostValidationIssueCode =
  | 'too-short'
  | 'too-long'
  | 'below-recommended-min'
  | 'above-recommended-max'

export interface HostValidationIssue {
  code: HostValidationIssueCode
  limit: number
  actual: number
}

export interface HostLengthValidation {
  valid: boolean
  length: number
  errors: HostValidationIssue[]
  warnings: HostValidationIssue[]
}

interface HostBlockState {
  hostPolicy?: ResolvedHostPolicy
}

export function resolveHostPolicy(options: EditableHostPolicy = {}): ResolvedHostPolicy {
  if (options.allowedFormats?.length && options.deniedFormats?.length) {
    throw new Error('EditableHostPolicy: allowedFormats and deniedFormats are mutually exclusive')
  }

  return {
    plainText: Boolean(options.plainText),
    formatRegistry: options.formatRegistry ?? defaultInlineFormatRegistry,
    allowedFormats: options.allowedFormats !== undefined ? [...options.allowedFormats] : undefined,
    deniedFormats: options.deniedFormats?.length ? [...options.deniedFormats] : undefined,
    allowLineBreaks: options.allowLineBreaks !== false,
    minLength: options.minLength,
    recommendedMinLength: options.recommendedMinLength,
    recommendedMaxLength: options.recommendedMaxLength,
    maxLength: options.maxLength,
    placeholder: options.placeholder
  }
}

export function installHostPolicy(host: HTMLElement, policy: ResolvedHostPolicy): void {
  const current = block.getState<HostBlockState>(host) ?? {}
  block.setState(host, { ...current, hostPolicy: policy })
  if (policy.placeholder) {
    host.setAttribute('data-editable-placeholder', policy.placeholder)
  } else {
    host.removeAttribute('data-editable-placeholder')
  }
}

export function getHostPolicy(host: HTMLElement): ResolvedHostPolicy {
  const stored = block.getState<HostBlockState>(host)?.hostPolicy
  if (stored) return stored
  return resolveHostPolicy({ plainText: block.isPlainTextBlock(host) })
}

export function getHostFormatRegistry(host: HTMLElement): InlineFormatRegistry {
  return getHostPolicy(host).formatRegistry
}

export function isFormatAllowed(host: HTMLElement, key: FormatKey): boolean {
  const policy = getHostPolicy(host)
  if (policy.plainText) return false
  if (policy.allowedFormats !== undefined) return policy.allowedFormats.includes(key)
  if (policy.deniedFormats) return !policy.deniedFormats.includes(key)
  return Boolean(policy.formatRegistry.getCodec(key))
}

export function filterAttributesForHost(
  host: HTMLElement,
  attributes: TextAttributes,
  doc: Document
): TextAttributes {
  const policy = getHostPolicy(host)
  const registry = policy.formatRegistry
  const filtered: TextAttributes = {}

  for (const [key, value] of Object.entries(attributes)) {
    if (!isFormatAllowed(host, key)) continue
    const codec = registry.getCodec(key)
    if (!codec) continue
    if (value === null) {
      filtered[key] = null
      continue
    }
    const sanitized = codec.sanitizeYjsValue(value, doc)
    if (sanitized !== null) filtered[key] = sanitized
  }

  return filtered
}

export function sanitizeRemoteAttributesForHost(
  host: HTMLElement,
  attributes: Record<string, unknown> | undefined,
  doc: Document
): TextAttributes | undefined {
  const policy = getHostPolicy(host)
  const sanitized = policy.formatRegistry.sanitizeDeltaAttributes(attributes, doc)
  if (!sanitized) return undefined

  const filtered = filterAttributesForHost(host, sanitized, doc)
  return Object.keys(filtered).length > 0 ? filtered : undefined
}

export function validateHostTextLength(
  policy: ResolvedHostPolicy,
  length: number
): HostLengthValidation {
  const errors: HostValidationIssue[] = []
  const warnings: HostValidationIssue[] = []

  if (policy.minLength !== undefined && length < policy.minLength) {
    errors.push({ code: 'too-short', limit: policy.minLength, actual: length })
  }
  if (policy.maxLength !== undefined && length > policy.maxLength) {
    errors.push({ code: 'too-long', limit: policy.maxLength, actual: length })
  }
  if (policy.recommendedMinLength !== undefined && length < policy.recommendedMinLength) {
    warnings.push({
      code: 'below-recommended-min',
      limit: policy.recommendedMinLength,
      actual: length
    })
  }
  if (policy.recommendedMaxLength !== undefined && length > policy.recommendedMaxLength) {
    warnings.push({
      code: 'above-recommended-max',
      limit: policy.recommendedMaxLength,
      actual: length
    })
  }

  return { valid: errors.length === 0, length, errors, warnings }
}

export function validateHostLength(host: HTMLElement, length?: number): HostLengthValidation {
  const policy = getHostPolicy(host)
  const resolvedLength = length ?? host.textContent?.length ?? 0
  return validateHostTextLength(policy, resolvedLength)
}

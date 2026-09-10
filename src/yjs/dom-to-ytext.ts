import type * as Y from 'yjs'
import {
  applyHostInlineMarkupToYText,
  getBlockTextRuns,
  hostDomHasFormattingMarkup,
  textRunsToPlainText,
  type TextRun
} from './dom-text-runs.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from './inline-format-codec.js'
import type { EditableOperation, TextAttributes } from '../operation-types.js'
import { textRunsEqual, textRunsFromYText } from './remote-sync-state.js'

function yTextHasInlineAttributes(yText: Y.Text): boolean {
  return (yText.toDelta() as Array<{ attributes?: Record<string, unknown> }>).some(
    (op) => op.attributes && Object.keys(op.attributes).length > 0
  )
}

/** Inserts host content into an empty {@link Y.Text} preserving inline attributes. */
export function insertHostRunsIntoYText(
  yText: Y.Text,
  host: HTMLElement,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): void {
  const runs = getBlockTextRuns(host, registry)
  let index = 0
  let activeKeys: string[] = []

  for (const run of runs) {
    const format = buildInsertFormatMap(run.attributes, activeKeys, registry, doc)
    if (Object.keys(format).length > 0) {
      yText.insert(index, run.text, format)
    } else {
      yText.insert(index, run.text)
    }
    activeKeys = Object.keys(run.attributes)
    index += run.text.length
  }
}

export function buildInsertFormatMap(
  attributes: TextAttributes,
  activeKeys: readonly string[],
  registry: InlineFormatRegistry,
  doc: Document
): Record<string, unknown> {
  const format = registry.toYTextFormatMap(attributes, doc)

  for (const key of activeKeys) {
    if (!(key in attributes)) {
      format[key] = null
    }
  }

  return format
}

/** Converts a full {@link Y.Text} snapshot into operations for host apply. */
export function yTextSnapshotToOperations(
  yText: Y.Text,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): EditableOperation[] {
  const delta = yText.toDelta() as Array<{
    insert?: string | unknown
    attributes?: Record<string, unknown>
  }>

  const operations: EditableOperation[] = []
  let index = 0

  for (const op of delta) {
    if (typeof op.insert !== 'string') continue
    const attributes = registry.sanitizeDeltaAttributes(op.attributes, doc)
    if (op.insert.length > 0) {
      operations.push({
        type: 'insertText',
        index,
        text: op.insert,
        ...(attributes ? { attributes } : {})
      })
      index += op.insert.length
    }
  }

  return operations
}

export function hostTextMatchesYText(
  host: HTMLElement,
  yText: Y.Text,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  const runs = getBlockTextRuns(host, registry)
  return textRunsToPlainText(runs) === yText.toString()
}

function attributesEqual(a: TextAttributes, b: TextAttributes): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false
  }
  return true
}

/** Builds a Y.Text format map that applies `target` over `current` (null removes keys). */
export function buildYTextFormatMapFromHostAttributes(
  target: TextAttributes,
  current: TextAttributes,
  registry: InlineFormatRegistry,
  doc: Document
): Record<string, unknown> {
  const attributes: TextAttributes = { ...target }
  for (const key of Object.keys(current)) {
    if (!(key in target)) {
      attributes[key] = null
    }
  }
  return registry.toYTextFormatMap(attributes, doc)
}

function expandRunsToCharAttributes(runs: readonly TextRun[]): TextAttributes[] {
  const chars: TextAttributes[] = []
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i += 1) {
      chars.push(run.attributes)
    }
  }
  return chars
}

function applyRunAlignedFormatPatches(
  yText: Y.Text,
  hostRuns: readonly TextRun[],
  yRuns: readonly TextRun[],
  registry: InlineFormatRegistry,
  doc: Document
): boolean {
  let applied = false
  let index = 0

  for (let i = 0; i < hostRuns.length; i += 1) {
    const len = hostRuns[i].text.length
    if (!attributesEqual(hostRuns[i].attributes, yRuns[i].attributes)) {
      const format = buildYTextFormatMapFromHostAttributes(
        hostRuns[i].attributes,
        yRuns[i].attributes,
        registry,
        doc
      )
      if (Object.keys(format).length > 0) {
        yText.format(index, len, format)
        applied = true
      }
    }
    index += len
  }

  return applied
}

function applyCharLevelFormatPatches(
  yText: Y.Text,
  hostRuns: readonly TextRun[],
  yRuns: readonly TextRun[],
  length: number,
  registry: InlineFormatRegistry,
  doc: Document
): boolean {
  const hostChars = expandRunsToCharAttributes(hostRuns)
  const yChars = expandRunsToCharAttributes(yRuns)
  let applied = false
  let index = 0

  while (index < length) {
    const hostAttr = hostChars[index] ?? {}
    const yAttr = yChars[index] ?? {}
    if (attributesEqual(hostAttr, yAttr)) {
      index += 1
      continue
    }

    const start = index
    while (
      index < length &&
      attributesEqual(hostChars[index] ?? {}, hostAttr) &&
      !attributesEqual(hostChars[index] ?? {}, yChars[index] ?? {})
    ) {
      index += 1
    }

    const format = buildYTextFormatMapFromHostAttributes(hostAttr, yAttr, registry, doc)
    if (Object.keys(format).length > 0) {
      yText.format(start, index - start, format)
      applied = true
    }
  }

  return applied
}

/**
 * Local format adoption: copies host inline attributes into {@link Y.Text} when plain
 * text already matches. Uses targeted {@link Y.Text#format} calls only — never replaces
 * the full text content.
 */
export function applyLocalDomFormatsToYText(
  yText: Y.Text,
  host: HTMLElement,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  const plain = yText.toString()
  const hostRuns = getBlockTextRuns(host, registry)
  if (textRunsToPlainText(hostRuns) !== plain) return false

  const yRuns = textRunsFromYText(yText, doc, registry)
  if (textRunsEqual(hostRuns, yRuns)) return false

  let applied = false

  if (
    hostRuns.length === yRuns.length &&
    hostRuns.every((run, index) => run.text === yRuns[index].text)
  ) {
    applied = applyRunAlignedFormatPatches(yText, hostRuns, yRuns, registry, doc)
  } else {
    applied = applyCharLevelFormatPatches(yText, hostRuns, yRuns, plain.length, registry, doc)
  }

  if (!applied && !yTextHasInlineAttributes(yText) && hostDomHasFormattingMarkup(host, registry)) {
    applied = applyHostInlineMarkupToYText(yText, host, doc, registry)
  }

  return applied
}

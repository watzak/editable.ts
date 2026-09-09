import { getBlockOperationText, stripInternalChars } from '../operation-text-model.js'
import type * as Y from 'yjs'
import { hostDomHasFormattingMarkup } from '../dom-text-runs.js'
import { defaultInlineFormatRegistry, type InlineFormatRegistry } from '../inline-format-codec.js'

export {
  buildLinkFormatAttributes,
  buildToggleFormatAttributes,
  getBlockTextRuns,
  hostDomHasFormattingMarkup,
  textRunsToPlainText,
  type TextRun
} from '../dom-text-runs.js'

/**
 * Applies inline formats from markup tags when run extraction produced plain text only.
 * Matches each formatted element's operation text within the canonical block string.
 */
export function applyHostInlineMarkupToYText(
  yText: Y.Text,
  host: HTMLElement,
  doc: Document,
  registry: InlineFormatRegistry = defaultInlineFormatRegistry
): boolean {
  if (!hostDomHasFormattingMarkup(host, registry)) return false

  const plain = getBlockOperationText(host)
  if (yText.toString() !== plain) return false

  let applied = false

  for (const codec of registry.registeredKeys().map((key) => registry.getCodec(key)!)) {
    if (codec.yjsKey === 'link') continue
    const selector = codec.domTags.join(', ')
    if (!selector) continue

    for (const element of host.querySelectorAll(selector)) {
      if (!host.contains(element)) continue
      const text = stripInternalChars(element.textContent ?? '')
      if (!text) continue

      const format = registry.toYTextFormatMap({ [codec.yjsKey]: true }, doc)
      if (Object.keys(format).length === 0) continue

      let searchFrom = 0
      while (searchFrom < plain.length) {
        const start = plain.indexOf(text, searchFrom)
        if (start < 0) break
        yText.format(start, text.length, format)
        applied = true
        searchFrom = start + text.length
      }
    }
  }

  return applied
}

/**
 * Consumer-facing type checks for the features package entry.
 */
import { Editable, type HighlightOptions, type TextRange } from 'editable.ts/features'

declare const block: HTMLElement

const editable = new Editable()

editable.setupHighlighting({ throttle: 100 })
editable.setupSpellcheck({ spellcheckService: async () => [] })
editable.setupTextDiff({ enabled: true })

const options: HighlightOptions = {
  editableHost: block,
  text: 'example',
  highlightId: 'hl-1'
}

const position: number = editable.highlight(options)
const ranges: Record<string, TextRange> = editable.getHighlightPositions({ editableHost: block })

editable.removeHighlight({ editableHost: block, highlightId: 'hl-1' })
editable.decorateHighlight({ editableHost: block, highlightId: 'hl-1', addCssClass: 'active' })

export type ConsumerFeaturesCheck = [typeof position, typeof ranges]

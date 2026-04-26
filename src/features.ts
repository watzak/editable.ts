import {Editable} from './core.js'
import error from './util/error.js'
import highlightSupport from './highlight-support.js'
import MonitoredHighlighting from './monitored-highlighting.js'
import TextDiff from './plugins/text-diff/text-diff.js'
import type {
  HighlightOptions,
  MonitoredHighlightingConfig,
  SpellcheckSetupConfig,
  TextDiffOptions,
  TextRange
} from './plugin-types.js'

declare module './core.js' {
  interface Editable {
    highlighting?: MonitoredHighlighting
    textDiff?: TextDiff
    spellcheck?: {
      checkSpelling: (elem: HTMLElement) => void
    }
    setupHighlighting(hightlightingConfig?: MonitoredHighlightingConfig): this
    setupSpellcheck(conf: SpellcheckSetupConfig): this
    setupTextDiff(config?: TextDiffOptions): this
    highlight(options: HighlightOptions): number
    getHighlightPositions(options: {editableHost: HTMLElement, type?: string}): Record<string, TextRange>
    removeHighlight(options: {editableHost: HTMLElement, highlightId: string, raiseEvents?: boolean}): void
    decorateHighlight(options: {
      editableHost: HTMLElement
      highlightId: string
      addCssClass?: string
      removeCssClass?: string
    }): void
  }
}

Object.assign(Editable.prototype, {
  setupHighlighting(this: Editable, hightlightingConfig: MonitoredHighlightingConfig = {}) {
    this.highlighting = new MonitoredHighlighting(this, hightlightingConfig)
    return this
  },

  setupSpellcheck(this: Editable, conf: SpellcheckSetupConfig) {
    let marker: string | undefined

    if (conf.markerNode) {
      marker = conf.markerNode.outerHTML
    }

    this.setupHighlighting({
      throttle: conf.throttle,
      spellcheck: {
        marker: marker,
        spellcheckService: conf.spellcheckService
      }
    })

    this.spellcheck = {
      checkSpelling: (elem: HTMLElement) => {
        this.highlighting?.highlight(elem)
      }
    }
    return this
  },

  setupTextDiff(this: Editable, config?: TextDiffOptions) {
    this.textDiff = new TextDiff(this, config || {})
    return this
  },

  highlight(this: Editable, {editableHost, text, highlightId, textRange, raiseEvents, type = 'comment'}: HighlightOptions) {
    if (!textRange) {
      const result = highlightSupport.highlightText(editableHost, text, highlightId, type, raiseEvents ? this.dispatcher : undefined, this.win)
      return result || -1
    }
    if (typeof textRange.start !== 'number' || typeof textRange.end !== 'number') {
      error(
        'Error in Editable.highlight: You passed a textRange object with invalid keys. Expected shape: { start: Number, end: Number }'
      )
      return -1
    }
    if (textRange.start === textRange.end) {
      error(
        'Error in Editable.highlight: You passed a textRange object with equal start and end offsets, which is considered a cursor and therefore unfit to create a highlight.'
      )
      return -1
    }
    return highlightSupport.highlightRange(editableHost, text, highlightId, textRange.start, textRange.end, raiseEvents ? this.dispatcher : undefined, this.win, type)
  },

  getHighlightPositions(this: Editable, {editableHost, type}: {editableHost: HTMLElement, type?: string}) {
    const result = highlightSupport.extractHighlightedRanges(
      editableHost,
      type
    )
    if (!result) return {}
    const textRanges: Record<string, TextRange> = {}
    for (const highlightId in result) {
      const {start, end, text} = result[highlightId]
      textRanges[highlightId] = {start, end, text}
    }
    return textRanges
  },

  removeHighlight(this: Editable, {editableHost, highlightId, raiseEvents}: {editableHost: HTMLElement, highlightId: string, raiseEvents?: boolean}) {
    highlightSupport.removeHighlight(editableHost, highlightId, raiseEvents ? this.dispatcher : undefined)
  },

  decorateHighlight(this: Editable, {editableHost, highlightId, addCssClass, removeCssClass}: {
    editableHost: HTMLElement
    highlightId: string
    addCssClass?: string
    removeCssClass?: string
  }) {
    highlightSupport.updateHighlight(editableHost, highlightId, addCssClass, removeCssClass)
  }
})

export {Editable}
export type {
  HighlightOptions,
  MonitoredHighlightingConfig,
  SpellcheckSetupConfig,
  TextDiffOptions,
  TextRange
}

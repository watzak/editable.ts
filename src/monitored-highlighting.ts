import * as nodeType from './node-type.js'
import {deepMerge} from './util/merge.js'
import * as content from './content.js'
import highlightText from './highlight-text.js'
import SpellcheckService from './plugins/highlighting/spellcheck-service.js'
import WhitespaceHighlighting from './plugins/highlighting/whitespace-highlighting.js'
import {searchAllWords} from './plugins/highlighting/text-search.js'
import MatchCollection from './plugins/highlighting/match-collection.js'
import highlightSupport from './highlight-support.js'
import {domArray, domSelector} from './util/dom.js'
import type {Editable} from './core.js'

// Spellcheck and Whitespace Highlighting
// --------------------------------------
//
// This instance monitors an editable block for changes and
// updates highlights accordingly. It also calls the spellcheck
// service after the content has changed.
import type {Match} from './plugins/highlighting/text-search.js'

export default class MonitoredHighlighting {
  public editable: Editable
  public win: Window
  public focusedEditableHost: HTMLElement | undefined
  public currentlyCheckedEditableHost: HTMLElement | undefined
  public timeout: Record<string, any>
  public config: any
  public spellcheckMarkerNode: HTMLElement
  public spellcheckService: SpellcheckService
  public whitespace: typeof WhitespaceHighlighting.prototype

  constructor (editable: Editable, configuration: any, spellcheckConfig: any) {
    this.editable = editable
    this.win = editable.win
    this.focusedEditableHost = undefined
    this.currentlyCheckedEditableHost = undefined
    this.timeout = {}

    const defaultConfig = {
      checkOnInit: false,
      checkOnFocus: false,
      checkOnChange: true,
      // unbounce rate in ms before calling the spellcheck service after changes
      throttle: 1000,
      // remove highlights after a change if the cursor is inside a highlight
      removeOnCorrection: true,
      spellcheck: {
        marker: '<span class="highlight-spellcheck"></span>',
        throttle: 1000,
        spellcheckService: function () {}
      },
      whitespace: {
        marker: '<span class="highlight-whitespace"></span>'
      }
    }

    this.config = deepMerge({}, defaultConfig, configuration)

    const spellcheckService = this.config.spellcheck.spellcheckService
    const spellcheckMarker = this.config.spellcheck.marker
    const whitespaceMarker = this.config.whitespace.marker
    const whitespaceMarkerNode = highlightSupport
      .createMarkerNode(whitespaceMarker, 'whitespace', this.win)
    const spellcheckMarkerNode = highlightSupport
      .createMarkerNode(spellcheckMarker, 'spellcheck', this.win)
    
    if (!whitespaceMarkerNode || !spellcheckMarkerNode) {
      throw new Error('Failed to create marker nodes')
    }

    this.spellcheckMarkerNode = spellcheckMarkerNode
    this.spellcheckService = new SpellcheckService(spellcheckService)
    this.whitespace = new WhitespaceHighlighting(whitespaceMarkerNode)

    this.setupListeners()
  }

  // Events
  // ------

  setupListeners (): void {
    if (this.config.checkOnFocus) {
      this.editable.on('focus', (editableHost: HTMLElement) => this.onFocus(editableHost))
      this.editable.on('blur', (editableHost: HTMLElement) => this.onBlur(editableHost))
    }
    if (this.config.checkOnChange || this.config.removeOnCorrection) {
      this.editable.on('change', (editableHost: HTMLElement) => this.onChange(editableHost))
    }
    if (this.config.checkOnInit) {
      this.editable.on('init', (editableHost: HTMLElement) => this.onInit(editableHost))
    }
  }

  onInit (editableHost: HTMLElement): void {
    this.highlight(editableHost)
  }

  onFocus (editableHost: HTMLElement): void {
    if (this.focusedEditableHost !== editableHost) {
      this.focusedEditableHost = editableHost
      this.editableHasChanged(editableHost, undefined)
    }
  }

  onBlur (editableHost: HTMLElement): void {
    if (this.focusedEditableHost === editableHost) {
      this.focusedEditableHost = undefined
    }
  }

  onChange (editableHost: HTMLElement): void {
    if (this.config.checkOnChange) {
      this.editableHasChanged(editableHost, this.config.throttle)
    }
    if (this.config.removeOnCorrection) {
      this.removeHighlightsAtCursor(editableHost)
    }
  }

  // Manage Highlights
  // -----------------

  editableHasChanged (editableHost: HTMLElement, throttle?: number): void {
    if (this.timeout.id && this.timeout.editableHost === editableHost) {
      clearTimeout(this.timeout.id)
    }

    const timeoutId = setTimeout(() => {
      this.highlight(editableHost)

      this.timeout = {}
    }, throttle || 0)

    this.timeout = {
      id: timeoutId,
      editableHost: editableHost
    }
  }

  highlight (editableHost: HTMLElement): void {
    const textBefore = highlightText.extractText(editableHost)

    // getSpellcheck
    this.spellcheckService.check(textBefore, (err: null, misspelledWords?: string[] | null) => {
      if (err || !editableHost.isConnected) { return } // return in case the host was removed from the dom

      // refresh the text
      const text = highlightText.extractText(editableHost)

      const matchCollection = new MatchCollection()

      if (misspelledWords && misspelledWords.length > 0) {
        const matches = searchAllWords(text, misspelledWords, this.spellcheckMarkerNode)
        matchCollection.addMatches(matches)
      }

      const whitespaceMatches = this.whitespace.findMatches(text)
      if (whitespaceMatches) {
        // Convert WhitespaceMatch[] to Match[]
        const matches: Match[] = whitespaceMatches.map(m => ({
          startIndex: m.startIndex || 0,
          endIndex: m.endIndex,
          match: m.match,
          marker: m.marker
        }))
        matchCollection.addMatches(matches)
      }

      this.safeHighlightMatches(editableHost, matchCollection.matches)
    })
  }

  // Calls highlightMatches internally but ensures
  // that the selection stays the same
  safeHighlightMatches (editableHost: HTMLElement, matches: Match[]): void {
    const selection = this.editable.getSelection(editableHost)
    if (selection) {
      selection.retainVisibleSelection(() => {
        this.highlightMatches(editableHost, matches)
      })
    } else {
      this.highlightMatches(editableHost, matches)
    }
    if (this.editable.dispatcher) {
      this.editable.dispatcher.notify('spellcheckUpdated', editableHost)
    }
  }

  highlightMatches (editableHost: HTMLElement, matches: Match[]): void {
    // Remove old highlights
    this.removeHighlights(editableHost)

    // Create new highlights
    if (matches && matches.length > 0) {
      // const span = this.createMarkerNode()
      highlightText.highlightMatches(editableHost, matches)
    }
  }

  removeHighlights (editableHost: HTMLElement | string): void {
    const host = domSelector(editableHost, this.win.document)
    if (!host) return
    for (const elem of domArray('[data-highlight="spellcheck"], [data-highlight="whitespace"]', this.win.document, host)) {
      content.unwrap(elem)
    }
  }

  removeHighlightsAtCursor (editableHost: HTMLElement | string): void {
    const host = domSelector(editableHost, this.win.document)
    if (!host) return
    editableHost = host
    const selection = this.editable.getSelection(editableHost)
    if (selection && selection.isCursor) {
      let elementAtCursor = selection.range.startContainer
      if (elementAtCursor.nodeType === nodeType.textNode) {
        elementAtCursor = elementAtCursor.parentNode
      }

      let wordId
      do {
        if (elementAtCursor === editableHost) return
        const highlightType = elementAtCursor.getAttribute('data-highlight')
        if (highlightType === 'spellcheck' || highlightType === 'whitespace') {
          wordId = elementAtCursor.getAttribute('data-word-id')
          break
        }
      } while ((elementAtCursor = elementAtCursor.parentNode))

      if (wordId) {
        selection.retainVisibleSelection(() => {
          for (const elem of domArray(`[data-word-id="${wordId}"]`, this.win.document, host)) {
            content.unwrap(elem)
          }
        })
      }
    }
  }

}

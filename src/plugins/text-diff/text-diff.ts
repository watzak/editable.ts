import highlightText from '../../highlight-text.js'
import highlightSupport from '../../highlight-support.js'
import {computeDiff, type DiffOperation} from './diff-algorithm.js'
import {domArray, domSelector} from '../../util/dom.js'
import * as content from '../../content.js'
import type {Editable} from '../../core.js'
import type {PendingEditableTimeout} from '../../plugin-types.js'
import type {TextDiffOptions} from '../../core.js'

export default class TextDiff {
  public editable: Editable
  public win: Window
  public config: Required<TextDiffOptions>
  public originalTexts: Map<HTMLElement, string>
  public timeout: PendingEditableTimeout
  public deletedMarkerNode: HTMLElement
  public insertedMarkerNode: HTMLElement
  private isApplyingDiff: boolean = false

  constructor(editable: Editable, configuration: Partial<TextDiffOptions>) {
    this.editable = editable
    this.win = editable.win
    this.originalTexts = new Map()

    const defaultConfig: Required<TextDiffOptions> = {
      enabled: true,
      checkOnInit: true,
      checkOnFocus: false,
      markerDeleted: '<span class="highlight-diff-deleted"></span>',
      markerInserted: '<span class="highlight-diff-inserted"></span>',
      throttle: 300
    }

    this.config = Object.assign({}, defaultConfig, configuration)
    this.timeout = {}

    // Create marker nodes
    const deletedMarkerNode = highlightSupport.createMarkerNode(
      this.config.markerDeleted,
      'diff-deleted',
      this.win
    )
    const insertedMarkerNode = highlightSupport.createMarkerNode(
      this.config.markerInserted,
      'diff-inserted',
      this.win
    )

    if (!deletedMarkerNode || !insertedMarkerNode) {
      throw new Error('Failed to create diff marker nodes')
    }

    this.deletedMarkerNode = deletedMarkerNode
    this.insertedMarkerNode = insertedMarkerNode

    this.setupListeners()
  }

  setupListeners(): void {
    if (this.config.checkOnInit) {
      this.editable.on('init', (editableHost: HTMLElement) => this.onInit(editableHost))
    }
    if (this.config.checkOnFocus) {
      this.editable.on('focus', (editableHost: HTMLElement) => this.onFocus(editableHost))
    }
    if (this.config.enabled) {
      this.editable.on('change', (editableHost: HTMLElement) => this.onChange(editableHost))
    }
  }

  onInit(editableHost: HTMLElement): void {
    this.captureOriginalText(editableHost)
  }

  onFocus(editableHost: HTMLElement): void {
    if (this.config.checkOnFocus) {
      this.captureOriginalText(editableHost)
    }
  }

  onChange(editableHost: HTMLElement): void {
    if (!this.config.enabled || this.isApplyingDiff) return

    if (this.timeout.id && this.timeout.editableHost === editableHost) {
      clearTimeout(this.timeout.id)
    }

    const timeoutId = setTimeout(() => {
      this.computeAndApplyDiff(editableHost)
      this.timeout = {}
    }, this.config.throttle)

    this.timeout = {
      id: timeoutId,
      editableHost
    }
  }

  captureOriginalText(editableHost: HTMLElement): void {
    const text = highlightText.extractText(editableHost)
    this.originalTexts.set(editableHost, text)
    // Clear existing diff highlights when capturing new original
    this.clearDiffHighlights(editableHost)
  }

  setOriginalText(editableHost: HTMLElement, text: string): void {
    this.originalTexts.set(editableHost, text)
    this.computeAndApplyDiff(editableHost)
  }

  getOriginalText(editableHost: HTMLElement): string | undefined {
    return this.originalTexts.get(editableHost)
  }

  clearOriginalText(editableHost: HTMLElement): void {
    this.originalTexts.delete(editableHost)
    this.clearDiffHighlights(editableHost)
  }

  computeAndApplyDiff(editableHost: HTMLElement): void {
    const originalText = this.originalTexts.get(editableHost)
    if (!originalText) return

    const currentText = highlightText.extractText(editableHost)
    if (originalText === currentText) {
      this.clearDiffHighlights(editableHost)
      return
    }

    const operations = computeDiff(originalText, currentText)
    this.applyDiff(editableHost, operations)
  }

  applyDiff(editableHost: HTMLElement, operations: DiffOperation[]): void {
    // Prevent recursive calls
    if (this.isApplyingDiff) return
    this.isApplyingDiff = true

    try {
      // Clear existing diff highlights
      this.clearDiffHighlights(editableHost)

      const selection = this.editable.getSelection(editableHost)
      const retainSelection = selection && selection.retainVisibleSelection

      if (retainSelection) {
        selection.retainVisibleSelection(() => {
          this.highlightDiffOperations(editableHost, operations)
        })
      } else {
        this.highlightDiffOperations(editableHost, operations)
      }
    } finally {
      this.isApplyingDiff = false
    }
  }

  highlightDiffOperations(editableHost: HTMLElement, operations: DiffOperation[]): void {
    const currentText = highlightText.extractText(editableHost, false)
    let highlightIdCounter = 0

    // First, handle insertions (they exist in current text)
    for (const op of operations) {
      if (op.type === 'insert') {
        const highlightId = `diff-inserted-${highlightIdCounter++}`
        const startIndex = op.newStart
        const endIndex = Math.min(op.newEnd, currentText.length)
        
        if (startIndex < currentText.length && endIndex > startIndex) {
          try {
            highlightSupport.highlightRange(
              editableHost,
              op.value,
              highlightId,
              startIndex,
              endIndex,
              undefined,
              this.win,
              'diff-inserted'
            )
          } catch (e) {
            console.warn('Failed to highlight insertion:', e)
          }
        }
      }
    }

    // Then handle deletions by inserting them as non-editable markers
    // We need to process deletions in reverse order to maintain correct positions
    const deletions = operations.filter(op => op.type === 'delete').reverse()
    
    for (const op of deletions) {
      if (currentText.length === 0) continue
      const highlightId = `diff-deleted-${highlightIdCounter++}`
      const insertPosition = this.mapOriginalToCurrentPosition(operations, op.oldStart)
      
      if (insertPosition !== null) {
        try {
          const cursor = this.createDeletionCursor(editableHost, insertPosition, currentText)
          
          if (cursor) {
            cursor.retainVisibleSelection(() => {
              // Create a span with the deleted text, marked as non-editable
              const deletedSpan = this.deletedMarkerNode.cloneNode(true) as HTMLElement
              deletedSpan.setAttribute('data-word-id', highlightId)
              deletedSpan.setAttribute('contenteditable', 'false')
              deletedSpan.setAttribute('data-editable', 'remove') // Mark for removal when extracting content
              deletedSpan.textContent = op.value
              
              // Insert the span before the cursor position
              cursor.insertBefore(deletedSpan)
            })
          }
        } catch (e) {
          console.warn('Failed to insert deletion marker:', e)
        }
      }
    }
  }

  createDeletionCursor(editableHost: HTMLElement, insertPosition: number, currentText: string) {
    return this.editable.createCursorAtCharacterOffset({
      element: editableHost,
      offset: insertPosition
    })
  }

  mapOriginalToCurrentPosition(operations: DiffOperation[], originalPosition: number): number | null {
    let currentPosition = 0

    for (const op of operations) {
      if (originalPosition < op.oldStart) {
        break
      }

      if (op.type === 'equal') {
        if (originalPosition < op.oldEnd) {
          const offsetInOp = originalPosition - op.oldStart
          return currentPosition + offsetInOp
        }
        currentPosition += op.newEnd - op.newStart
      } else if (op.type === 'delete') {
        if (originalPosition < op.oldEnd) {
          // Position is within deletion, return the position where it was deleted
          return currentPosition
        }
        // Don't advance currentPosition for deletions
      } else if (op.type === 'insert') {
        currentPosition += op.newEnd - op.newStart
      }
    }

    return currentPosition
  }

  clearDiffHighlights(editableHost: HTMLElement | string): void {
    const host = domSelector(editableHost, this.win.document)
    if (!host) return

    for (const elem of domArray('[data-highlight="diff-deleted"], [data-highlight="diff-inserted"]', this.win.document, host)) {
      content.unwrap(elem)
    }
  }

  removeDiffHighlights(editableHost: HTMLElement): void {
    this.clearDiffHighlights(editableHost)
  }
}

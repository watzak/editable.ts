import * as parser from './parser.js'
import * as content from './content.js'
import log from './util/log.js'
import * as block from './block.js'
import * as nodeType from './node-type.js'
import type {Editable} from './core.js'
import type Cursor from './cursor.js'
import type Selection from './selection.js'

/**
 * The Behavior module defines the behavior triggered in response to the Editable.JS
 * events (see {{#crossLink "Editable"}}{{/crossLink}}).
 * The behavior can be overwritten by a user with Editable.init() or on
 * Editable.add() per element.
 *
 * @module core
 * @submodule behavior
 */

export default function createDefaultBehavior (editable: Editable) {
  const document = editable.win.document
  /**
  * Factory for the default behavior.
  * Provides default behavior of the Editable.JS API.
  *
  * @static
  */

  return {
    /** @param {HTMLElement} element */
    focus (element: HTMLElement): void {
      if (!parser.isVoid(element)) return

      // Add an zero width space if the editable is empty to force it to have a height
      // E.g. Firefox does not render empty block elements
      //   and most browsers do not render empty inline elements.
      element.appendChild(document.createTextNode('\uFEFF'))
    },

    blur (element: HTMLElement): void {
      // Note: there is a special case when the tab is changed where
      // we can get a blur event even if the cursor is still in the editable.
      // This blur would cause us to loose the cursor position (cause of cleanInternals()).
      // To prevent this we check if the activeElement is still the editable.
      // (Note: document.getSelection() did not work reliably in this case.)
      if (document.activeElement === element) return

      content.cleanInternals(element)
    },

    selection (element: HTMLElement, selection: Selection): void {
      log(selection ? 'Default selection behavior' : 'Default selection empty behavior')
    },

    cursor (element: HTMLElement, cursor: Cursor): void {
      log('Default cursor behavior')
    },

    newline (element: HTMLElement, cursor: Cursor): void {
      // When the cursor is at the text end, we'll need to add an empty text node
      // after the br tag to ensure that the cursor shows up on the next line
      if (cursor.isAtTextEnd()) {
        const br = document.createElement('br')
        cursor.insertBefore(br)

        // Only append a zero width space if there's none after the br tag
        // We don't need to remove them as they get cleaned up on blur
        const nextSibling = br.nextSibling
        if (
          nextSibling?.nodeType !== nodeType.textNode ||
          (nextSibling as Text).textContent?.[0] !== '\uFEFF'
        ) {
          cursor.insertAfter(document.createTextNode('\uFEFF'))
        }
      } else {
        cursor.insertBefore(document.createElement('br'))
      }

      cursor.setVisibleSelection()
    },

    insert (element: HTMLElement, direction: string, cursor: Cursor): void {
      const newElement = element.cloneNode(false) as HTMLElement
      if (newElement.id) newElement.removeAttribute('id')

      if (direction === 'before') {
        element.parentNode?.insertBefore(newElement, element)
      } else {
        element.parentNode?.insertBefore(newElement, element.nextSibling)
      }

      editable.createCursorAtEnd(newElement)?.setVisibleSelection()
    },

    split (element: HTMLElement, before: string, after: string, cursor: Cursor): void {
      const fragment = content.createFragmentFromString(before)
      const newNode = element.cloneNode(false) as HTMLElement
      newNode.appendChild(fragment)

      const parent = element.parentNode
      if (parent) {
        parent.insertBefore(newNode, element)
      }

      element.innerHTML = after
      content.tidyHtml(newNode)
      content.tidyHtml(element)

      cursor.setVisibleSelection()
    },

    merge (element: HTMLElement, direction: string, cursor: Cursor): void {
      const target = direction === 'before'
        ? element.previousElementSibling
        : element.nextElementSibling

      if (!target) return

      const targetContent = content.extractContent(target as HTMLElement, false)
      const elementContent = content.extractContent(element, false)

      // Calculate text lengths before merging to position cursor correctly
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = targetContent
      const targetTextLength = tempDiv.textContent?.length || 0
      tempDiv.innerHTML = elementContent
      const elementTextLength = tempDiv.textContent?.length || 0

      const mergedContent = direction === 'before'
        ? targetContent + elementContent
        : elementContent + targetContent

      element.innerHTML = mergedContent
      target.remove()

      // Position cursor at the merge boundary
      const cursorOffset = direction === 'before'
        ? targetTextLength
        : elementTextLength

      editable.createCursorAtCharacterOffset({element, offset: cursorOffset})
    },

    empty (element: HTMLElement): void {
      log('Default empty behavior')
    },

    switch (element: HTMLElement, direction: string, cursor: Cursor): void {
      switch (direction) {
        case 'before':
          const prevSibling = element.previousElementSibling
          if (prevSibling) {
            const prevCursor = editable.createCursorAtEnd(prevSibling as HTMLElement)
            if (prevCursor) prevCursor.setVisibleSelection()
          }
          break
        case 'after':
          const nextSibling = element.nextElementSibling
          if (nextSibling) {
            const nextCursor = editable.createCursorAtBeginning(nextSibling as HTMLElement)
            if (nextCursor) nextCursor.setVisibleSelection()
          }
          break
      }
    },

    move (element: HTMLElement, selection: Selection, direction: string): void {
      log('Default move behavior')
    },

    paste (element: HTMLElement, blocks: string[], cursor: Cursor): void {
      cursor.insertBefore(blocks[0])

      if (blocks.length <= 1) {
        cursor.setVisibleSelection()
        return
      }

      const parent = element.parentNode
      if (!parent) return
      let currentElement = element

      blocks.slice(1).forEach((str: string) => {
        const newElement = element.cloneNode(false) as HTMLElement
        if (newElement.id) newElement.removeAttribute('id')
        const fragment = content.createFragmentFromString(str)
        newElement.appendChild(fragment)
        parent.insertBefore(newElement, currentElement.nextSibling)
        currentElement = newElement
      })

      // focus last element
      const lastCursor = editable.createCursorAtEnd(currentElement)
      if (lastCursor) lastCursor.setVisibleSelection()
    },

    clipboard (element: HTMLElement, action: string, cursor: Cursor): void {
      log('Default clipboard behavior')
    },

    toggleBold (selection: Selection): void {
      selection.toggleBold()
    },

    toggleEmphasis (selection: Selection): void {
      selection.toggleEmphasis()
    }
  }
}

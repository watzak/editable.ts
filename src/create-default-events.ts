import createDefaultBehavior from './create-default-behavior.js'
import type {Editable} from './core.js'
import type Cursor from './cursor.js'
import type Selection from './selection.js'
import type {EventHandlerMap, DispatcherEventMap} from './event-types.js'

export default function createDefaultEvents (editable: Editable) {
  const behavior = createDefaultBehavior(editable)

  return {
    /**
     * The focus event is triggered when an element gains focus.
     * The default behavior is to append a zero-width space to empty or void
     * elements so they stay visible and can keep a caret position.
     *
     * @event focus
     * @param {HTMLElement} element The element triggering the event.
     */
    focus (element: HTMLElement): void {
      behavior.focus(element)
    },

    /**
     * The blur event is triggered when an element loses focus.
     * The default behavior is to clean internal helper nodes once the element
     * actually lost focus.
     *
     * @event blur
     * @param {HTMLElement} element The element triggering the event.
     */
    blur (element: HTMLElement): void {
      behavior.blur(element)
    },

    /**
     * The selection event is triggered after the user has selected some
     * content.
     * The default behavior is to leave the DOM unchanged.
     *
     * @event selection
     * @param {HTMLElement} element The element triggering the event.
     * @param {Selection} selection The actual Selection object.
     */
    selection (element: HTMLElement, selection: Selection): void {
      behavior.selection(element, selection)
    },

    /**
     * The cursor event is triggered after cursor position has changed.
     * The default behavior is to leave the DOM unchanged.
     *
     * @event cursor
     * @param {HTMLElement} element The element triggering the event.
     * @param {Cursor} cursor The actual Cursor object.
     */
    cursor (element: HTMLElement, cursor: Cursor): void {
      behavior.cursor(element, cursor)
    },

    /**
     * The newline event is triggered when a newline should be inserted. This
     * happens when SHIFT+ENTER key is pressed.
     * The default behavior is to add a <br />
     *
     * @event newline
     * @param {HTMLElement} element The element triggering the event.
     * @param {Cursor} cursor The actual cursor object.
     */
    newline (element: HTMLElement, cursor: Cursor): void {
      behavior.newline(element, cursor)
    },

    /**
     * The split event is triggered when a block should be split into two
     * blocks. This happens when ENTER is pressed within a non-empty block.
     * The default behavior is to clone the current block, move the content
     * before the cursor into the new block, keep the remaining content in the
     * current block, tidy both blocks and restore the caret.
     *
     * @event split
     * @param {HTMLElement} element The element triggering the event.
     * @param {String} before The HTML string before the split.
     * @param {String} after The HTML string after the split.
     * @param {Cursor} cursor The actual cursor object.
     */
    split (element: HTMLElement, before: string, after: string, cursor: Cursor): void {
      behavior.split(element, before, after, cursor)
    },

    /**
     * The insert event is triggered when a new block should be inserted. This
     * happens when ENTER key is pressed at the beginning of a block (should
     * insert before) or at the end of a block (should insert after).
     * The default behavior is to clone the current block without its content,
     * insert it before or after the current block, and move the caret into the
     * new block.
     *
     * @event insert
     * @param {HTMLElement} element The element triggering the event.
     * @param {String} direction The insert direction: "before" or "after".
     * @param {Cursor} cursor The actual cursor object.
     */
    insert (element: HTMLElement, direction: string, cursor: Cursor): void {
      behavior.insert(element, direction, cursor)
    },

    /**
     * The merge event is triggered when two blocks need to be merged. This happens
     * when BACKSPACE is pressed at the beginning of a block (should merge with
     * the preceding block) or DEL is pressed at the end of a block (should
     * merge with the following block).
     * The default behavior is to merge the current block with its neighbor in
     * the requested direction, remove the merged sibling and place the caret at
     * the merge boundary.
     *
     * @event merge
     * @param {HTMLElement} element The element triggering the event.
     * @param {String} direction The merge direction: "before" or "after".
     * @param {Cursor} cursor The actual cursor object.
     */
    merge (element: HTMLElement, direction: string, cursor: Cursor): void {
      behavior.merge(element, direction, cursor)
    },

    /**
     * The empty event is triggered when a block is emptied.
     * The default behavior is to leave the DOM unchanged.
     *
     * @event empty
     * @param {HTMLElement} element The element triggering the event.
     */
    empty (element: HTMLElement): void {
      behavior.empty(element)
    },

    /**
     * The switch event is triggered when the user switches to another block.
     * This happens when an ARROW key is pressed near the boundaries of a block.
     * The default behavior is to move the caret to the previous block's end or
     * the next block's beginning.
     *
     * @event switch
     * @param {HTMLElement} element The element triggering the event.
     * @param {String} direction The switch direction: "before" or "after".
     * @param {Cursor} cursor The actual cursor object.*
     */
    switch (element: HTMLElement, direction: string, cursor: Cursor): void {
      behavior.switch(element, direction, cursor)
    },

    /**
     * The move event is triggered when the user moves a selection in a block.
     * This happens when the user selects some (or all) content in a block and
     * an ARROW key is pressed (up: drag before, down: drag after).
     * The default behavior is to leave the DOM unchanged.
     *
     * @event move
     * @param {HTMLElement} element The element triggering the event.
     * @param {Selection} selection The actual Selection object.
     * @param {String} direction The move direction: "before" or "after".
     */
    move (element: HTMLElement, selection: Selection, direction: string): void {
      behavior.move(element, selection, direction)
    },

    /**
     * The clipboard event is triggered when the user copies or cuts
     * a selection within a block.
     *
     * @event clipboard
     * @param {HTMLElement} element The element triggering the event.
     * @param {String} action The clipboard action: "copy" or "cut".
     * @param {Selection} selection A selection object around the copied content.
     */
    clipboard (element: HTMLElement, action: string, selection: Selection): void {
      behavior.clipboard(element, action, selection)
    },

    /**
     * The paste event is triggered when the user pastes text
     *
     * @event paste
     * @param {HTMLElement} The element triggering the event.
     * @param {Array of String} The pasted blocks
     * @param {Cursor} The cursor object.
     */
    paste (element: HTMLElement, blocks: string[], cursor: Cursor): void {
      behavior.paste(element, blocks, cursor)
    },

    /**
     * The toggleBold event is triggered when the bold keyboard shortcut is used
     *
     * @event toggleBold
     * @param {Selection} The selection object.
     */
    toggleBold (selection: Selection): void {
      behavior.toggleBold(selection)
    },

    /**
     * The toggleEmphasis event is triggered when the italic keyboard shortcut is used
     *
     * @event toggleEmphasis
     * @param {Selection} The selection object.
     */
    toggleEmphasis (selection: Selection): void {
      behavior.toggleEmphasis(selection)
    }
  } as EventHandlerMap<DispatcherEventMap, Editable>
}

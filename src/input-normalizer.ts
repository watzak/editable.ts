import type { TrackedInputCommand } from './input-command-tracker.js'
import type { EditingInputType } from './input-capabilities.js'

export type KeyAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'tab'
  | 'shiftTab'
  | 'esc'
  | 'backspace'
  | 'delete'
  | 'enter'
  | 'shiftEnter'
  | 'bold'
  | 'italic'
  | 'character'

export const EDITING_KEY_ACTIONS = new Set<TrackedInputCommand>([
  'enter',
  'shiftEnter',
  'backspace',
  'delete',
  'bold',
  'italic'
])

const META_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

export function isImeFallbackKey(event: KeyboardEvent): boolean {
  return event.keyCode === 229
}

export function resolveNavigationAction(event: KeyboardEvent): KeyAction | null {
  switch (event.key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'Tab':
      return event.shiftKey ? 'shiftTab' : 'tab'
    case 'Escape':
      return 'esc'
    default:
      return null
  }
}

export function resolveEditingAction(event: KeyboardEvent): TrackedInputCommand | null {
  if (event.isComposing || isImeFallbackKey(event)) return null
  if (META_KEYS.has(event.key)) return null

  switch (event.key) {
    case 'Enter':
      return event.shiftKey ? 'shiftEnter' : 'enter'
    case 'Backspace':
      return 'backspace'
    case 'Delete':
      return 'delete'
    default:
      break
  }

  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyB') return 'bold'
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyI') return 'italic'

  return null
}

export function resolveCharacterAction(event: KeyboardEvent): KeyAction | null {
  if (event.isComposing || isImeFallbackKey(event)) return null
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.key.length !== 1) return null
  if (resolveNavigationAction(event) || resolveEditingAction(event)) return null
  return 'character'
}

export function mapInputTypeToCommand(inputType: string): TrackedInputCommand | 'paste' | null {
  switch (inputType) {
    case 'insertParagraph':
      return 'enter'
    case 'insertLineBreak':
      return 'shiftEnter'
    case 'deleteContentBackward':
      return 'backspace'
    case 'deleteContentForward':
      return 'delete'
    case 'formatBold':
      return 'bold'
    case 'formatItalic':
      return 'italic'
    case 'insertFromPaste':
      return 'paste'
    default:
      return null
  }
}

export function mapCommandToInputType(command: TrackedInputCommand): EditingInputType {
  switch (command) {
    case 'enter':
      return 'insertParagraph'
    case 'shiftEnter':
      return 'insertLineBreak'
    case 'backspace':
      return 'deleteContentBackward'
    case 'delete':
      return 'deleteContentForward'
    case 'bold':
      return 'formatBold'
    case 'italic':
      return 'formatItalic'
  }
}

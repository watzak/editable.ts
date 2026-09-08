const composingBlocks = new WeakMap<HTMLElement, boolean>()

export function setBlockComposing(block: HTMLElement, composing: boolean): void {
  if (composing) {
    composingBlocks.set(block, true)
  } else {
    composingBlocks.delete(block)
  }
}

function eventIsComposing(event: KeyboardEvent | InputEvent | CompositionEvent): boolean {
  return 'isComposing' in event && event.isComposing === true
}

export function isBlockComposing(
  block: HTMLElement,
  event?: KeyboardEvent | InputEvent | CompositionEvent
): boolean {
  if (event && eventIsComposing(event)) return true
  return composingBlocks.get(block) === true
}

export function isEditingSuppressed(
  block: HTMLElement,
  event?: KeyboardEvent | InputEvent
): boolean {
  if (!event) return isBlockComposing(block)
  if (event.isComposing) return true
  if ('keyCode' in event && event.keyCode === 229) return true
  return isBlockComposing(block)
}

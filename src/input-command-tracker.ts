export type TrackedInputCommand =
  | 'enter'
  | 'shiftEnter'
  | 'backspace'
  | 'delete'
  | 'bold'
  | 'italic'

const PASTE_DEDUP_WINDOW_MS = 100

export class InputCommandTracker {
  private suppressNextKeydown = new Map<string, TrackedInputCommand>()
  private pastePendingUntil = new Map<string, number>()
  private suppressChangeUntil = new Map<string, number>()

  private blockKey(block: HTMLElement): string {
    return block.getAttribute('data-editable') || String(block)
  }

  /** Marks that `beforeinput` already handled this command; skip the paired keydown. */
  markBeforeInputHandled(block: HTMLElement, command: TrackedInputCommand): void {
    this.suppressNextKeydown.set(this.blockKey(block), command)
  }

  /** Returns true once for the keydown that follows a handled beforeinput. */
  shouldSuppressKeydown(block: HTMLElement, command: TrackedInputCommand): boolean {
    const key = this.blockKey(block)
    if (this.suppressNextKeydown.get(key) !== command) return false
    this.suppressNextKeydown.delete(key)
    return true
  }

  markPastePending(block: HTMLElement): void {
    const key = this.blockKey(block)
    const until = Date.now() + PASTE_DEDUP_WINDOW_MS
    this.pastePendingUntil.set(key, until)
    this.suppressChangeUntil.set(key, until)
  }

  clearPastePending(block: HTMLElement): void {
    const key = this.blockKey(block)
    this.pastePendingUntil.delete(key)
  }

  shouldSuppressChange(block: HTMLElement): boolean {
    const key = this.blockKey(block)
    const until = this.suppressChangeUntil.get(key)
    if (until && Date.now() <= until) return true
    if (until && Date.now() > until) this.suppressChangeUntil.delete(key)
    return (
      this.pastePendingUntil.get(key) !== undefined &&
      Date.now() <= this.pastePendingUntil.get(key)!
    )
  }

  markStructuralChange(block: HTMLElement): void {
    this.suppressChangeUntil.set(this.blockKey(block), Date.now() + PASTE_DEDUP_WINDOW_MS)
  }
}

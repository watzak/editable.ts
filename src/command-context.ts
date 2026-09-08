import type { EditableCommand } from './command-types.js'

/**
 * Passed to `beforeCommand` handlers. Call {@link cancel} to prevent default DOM
 * behavior without exposing native `preventDefault` details.
 */
export class CommandContext {
  readonly command: EditableCommand
  private _cancelled = false

  constructor(command: EditableCommand) {
    this.command = command
  }

  get cancelled(): boolean {
    return this._cancelled
  }

  /** Prevents default behavior handlers (`insert`, `split`, …) from running. */
  cancel(): void {
    this._cancelled = true
  }
}

import type { EditableOperationBatch } from './operation-types.js'

/**
 * Passed to `beforeOperation` handlers. Call {@link cancel} to prevent the
 * batch from being applied and to skip the `operation` event.
 */
export class OperationContext {
  readonly batch: EditableOperationBatch
  private _cancelled = false

  constructor(batch: EditableOperationBatch) {
    this.batch = batch
  }

  get cancelled(): boolean {
    return this._cancelled
  }

  /** Prevents the operation batch from being emitted and applied downstream. */
  cancel(): void {
    this._cancelled = true
  }
}

import { OperationContext } from './operation-context.js'
import type { EditableOperationBatch } from './operation-types.js'
import type { DispatcherEventMap } from './event-types.js'
import type { Editable } from './core.js'

export interface DispatchOperationOptions {
  /** When false, only operation events fire (no downstream side effects). Default: true. */
  emitOperation?: boolean
}

type Notify = import('./event-types.js').EventNotify<DispatcherEventMap, Editable>

/**
 * Runs the operation pipeline: `beforeOperation` → `operation`.
 *
 * Does not mutate the DOM, emit legacy command events, or fire `change`.
 * Browser capture and Yjs adapters integrate in later steps.
 */
export function dispatchEditableOperations(
  notify: Notify,
  host: HTMLElement,
  batch: EditableOperationBatch,
  options: DispatchOperationOptions = {}
): OperationContext {
  const context = new OperationContext(batch)
  notify('beforeOperation', host, context)

  const shouldEmit = options.emitOperation !== false
  if (shouldEmit && !context.cancelled) {
    notify('operation', host, batch)
  }

  return context
}

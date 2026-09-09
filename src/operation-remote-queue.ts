import type { ApplyOperationsOptions } from './operation-apply.js'
import type { EditableOperationBatch } from './operation-types.js'

export interface QueuedRemoteApply {
  batch: EditableOperationBatch
  options: ApplyOperationsOptions
  resolve: (result: import('./operation-apply.js').ApplyOperationsResult) => void
}

export class OperationRemoteQueue {
  private queues = new WeakMap<HTMLElement, QueuedRemoteApply[]>()

  enqueue(host: HTMLElement, entry: QueuedRemoteApply): void {
    const list = this.queues.get(host) ?? []
    list.push(entry)
    this.queues.set(host, list)
  }

  drain(host: HTMLElement): QueuedRemoteApply[] {
    const list = this.queues.get(host) ?? []
    this.queues.delete(host)
    return list
  }

  hasPending(host: HTMLElement): boolean {
    return (this.queues.get(host)?.length ?? 0) > 0
  }

  clear(host: HTMLElement): void {
    this.queues.delete(host)
  }
}

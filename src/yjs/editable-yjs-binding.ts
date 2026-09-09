import * as Y from 'yjs'
import type { Editable } from '../core.js'
import { getBlockOperationText } from '../operation-text-model.js'
import { getOperationTextLength } from '../operation-offset.js'
import {
  classifyInitialSync,
  InitialSyncConflictError,
  type InitialSyncPolicy
} from './initial-sync.js'

export interface EditableYjsBindingOptions {
  editable: Editable
  host: HTMLElement
  yText: Y.Text
  initialSync: InitialSyncPolicy
}

/**
 * Minimal Yjs adapter shell for a single block host and {@link Y.Text}.
 *
 * Owns the association between `host` and `yText` until {@link destroy} is called.
 * Live two-way sync is not implemented in this prompt — only safe initial alignment.
 */
export class EditableYjsBinding {
  readonly editable: Editable
  readonly host: HTMLElement
  readonly yText: Y.Text

  private destroyed = false

  constructor(options: EditableYjsBindingOptions) {
    validateBindingOptions(options)
    this.editable = options.editable
    this.host = options.host
    this.yText = options.yText
    runInitialSync(this, options.initialSync)
  }

  /** Releases ownership of the host ↔ Y.Text association. Idempotent. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  assertActive(): void {
    if (this.destroyed) {
      throw new Error('EditableYjsBinding has been destroyed')
    }
  }
}

function validateBindingOptions(options: EditableYjsBindingOptions): void {
  const { editable, host, yText, initialSync } = options
  if (!editable?.ownsBlock(host)) {
    throw new Error('EditableYjsBinding: host is not registered with the Editable instance')
  }
  if (!host.isConnected) {
    throw new Error('EditableYjsBinding: host is not connected to the document')
  }
  if (!(yText instanceof Y.Text)) {
    throw new Error('EditableYjsBinding: yText must be a Y.Text instance')
  }
  if (!initialSync || typeof initialSync !== 'object') {
    throw new Error('EditableYjsBinding: initialSync policy is required')
  }
  if (initialSync.yEmptyHostFilled !== 'copy-host-to-y') {
    throw new Error('EditableYjsBinding: yEmptyHostFilled must be "copy-host-to-y"')
  }
  if (initialSync.hostEmptyYFilled !== 'copy-y-to-host') {
    throw new Error('EditableYjsBinding: hostEmptyYFilled must be "copy-y-to-host"')
  }
  const differ = initialSync.bothFilledDiffer
  if (differ !== 'error' && (typeof differ !== 'object' || typeof differ.resolve !== 'function')) {
    throw new Error('EditableYjsBinding: bothFilledDiffer must be "error" or a conflict resolver')
  }
}

function runInitialSync(binding: EditableYjsBinding, policy: InitialSyncPolicy): void {
  const hostText = getBlockOperationText(binding.host)
  const yText = binding.yText.toString()
  const scenario = classifyInitialSync(hostText, yText)

  switch (scenario) {
    case 'both-empty':
    case 'both-identical':
      return
    case 'y-empty-host-filled':
      if (policy.yEmptyHostFilled !== 'copy-host-to-y') {
        throw new Error('Initial sync: unexpected yEmptyHostFilled policy')
      }
      copyHostToY(binding, hostText)
      return
    case 'host-empty-y-filled':
      if (policy.hostEmptyYFilled !== 'copy-y-to-host') {
        throw new Error('Initial sync: unexpected hostEmptyYFilled policy')
      }
      copyYToHost(binding, yText)
      return
    case 'both-filled-differ': {
      const resolution = resolveConflict(policy, hostText, yText)
      if (resolution === 'host') {
        copyHostToY(binding, hostText)
      } else {
        copyYToHost(binding, yText)
      }
      return
    }
    default: {
      const _exhaustive: never = scenario
      throw new Error(`Initial sync: unsupported scenario ${String(_exhaustive)}`)
    }
  }
}

function resolveConflict(policy: InitialSyncPolicy, hostText: string, yText: string): 'host' | 'y' {
  const differ = policy.bothFilledDiffer
  if (differ === 'error') {
    throw new InitialSyncConflictError(hostText, yText)
  }
  return differ.resolve({ hostText, yText })
}

function copyHostToY(binding: EditableYjsBinding, hostText: string): void {
  const yText = binding.yText
  if (yText.length > 0) {
    yText.delete(0, yText.length)
  }
  if (hostText.length > 0) {
    yText.insert(0, hostText)
  }
}

function copyYToHost(binding: EditableYjsBinding, text: string): void {
  const hostLength = getOperationTextLength(binding.host)
  const operations =
    hostLength === 0
      ? [{ type: 'insertText' as const, index: 0, text }]
      : [{ type: 'replaceText' as const, index: 0, length: hostLength, text }]

  binding.editable.applyOperations(
    binding.host,
    { source: 'remote', operations },
    { preserveSelection: false, emitChange: false }
  )
}

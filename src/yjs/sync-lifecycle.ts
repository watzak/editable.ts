import type { YjsProviderStatusSource } from './provider-status.js'
import { isProviderReadyForInitialSync } from './provider-status.js'

export type YjsSyncDiagnosticKind =
  | 'binding-deferred'
  | 'binding-activated'
  | 'initial-sync-conflict'
  | 'initial-sync-complete'
  | 'remote-reconcile'
  | 'composition-aborted'
  | 'sync-error'

export interface YjsSyncDiagnostic {
  kind: YjsSyncDiagnosticKind
  scope: 'block' | 'document'
  message: string
  detail?: Record<string, unknown>
}

export type YjsSyncDiagnosticHandler = (diagnostic: YjsSyncDiagnostic) => void

export interface ActivateAfterProviderOptions {
  providerStatus: YjsProviderStatusSource
  activate: () => void
  onDiagnostic?: YjsSyncDiagnosticHandler
}

/**
 * Calls `activate()` once when provider status reaches `synced`.
 * Safe to call multiple times — only the first `synced` event activates.
 */
export function activateBindingsAfterProviderSync(
  options: ActivateAfterProviderOptions
): () => void {
  let activated = false

  const tryActivate = (status = options.providerStatus.getStatus()) => {
    if (activated) return
    if (!isProviderReadyForInitialSync(status)) return
    activated = true
    options.activate()
    options.onDiagnostic?.({
      kind: 'binding-activated',
      scope: 'block',
      message: 'Bindings activated after provider synced'
    })
  }

  const unsubscribe = options.providerStatus.subscribe((status) => {
    if (status.status === 'error') {
      options.onDiagnostic?.({
        kind: 'sync-error',
        scope: 'block',
        message: status.message ?? 'Provider error before initial sync'
      })
      return
    }
    tryActivate(status)
  })

  tryActivate()

  return () => {
    unsubscribe()
  }
}

/**
 * Provider-neutral connection status convention.
 *
 * editable.ts does not ship a network provider. Integrators map their provider
 * events (e.g. y-websocket `status` / `synced`) onto this surface for UI wiring.
 */

export type YjsProviderConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'synced'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export interface YjsProviderStatus {
  status: YjsProviderConnectionStatus
  /** Optional human-readable detail — never rendered as HTML by editable.ts. */
  message?: string
}

export interface YjsProviderStatusSource {
  getStatus(): YjsProviderStatus
  /** Returns an unsubscribe function. */
  subscribe(listener: (status: YjsProviderStatus) => void): () => void
}

/** Minimal in-memory status bus for demos and integrator glue code. */
export function createProviderStatusSource(
  initial: YjsProviderStatus = { status: 'disconnected' }
): YjsProviderStatusSource & {
  setStatus(status: YjsProviderStatus): void
} {
  let current = sanitizeProviderStatus(initial)
  const listeners = new Set<(status: YjsProviderStatus) => void>()

  return {
    getStatus() {
      return current
    },
    setStatus(status) {
      current = sanitizeProviderStatus(status)
      for (const listener of listeners) listener(current)
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(current)
      return () => listeners.delete(listener)
    }
  }
}

export function sanitizeProviderStatus(raw: YjsProviderStatus): YjsProviderStatus {
  const allowed: YjsProviderConnectionStatus[] = [
    'connecting',
    'connected',
    'synced',
    'disconnected',
    'reconnecting',
    'error'
  ]
  const status = allowed.includes(raw.status) ? raw.status : 'disconnected'
  const message =
    typeof raw.message === 'string'
      ? raw.message.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 256)
      : undefined
  return message ? { status, message } : { status }
}

/**
 * Returns true when integrators should run {@link EditableYjsBinding.activate}.
 *
 * Convention: wait for `synced` before first activation when the doc may still
 * receive persisted or server state.
 */
export function isProviderReadyForInitialSync(status: YjsProviderStatus): boolean {
  return status.status === 'synced'
}

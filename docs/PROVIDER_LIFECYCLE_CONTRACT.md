# Provider lifecycle contract

Normative companion to [YJS_PROVIDER_INTEGRATION.md](./YJS_PROVIDER_INTEGRATION.md). Verified by `spec/yjs-sync-lifecycle.spec.ts`, `spec/yjs-provider-lifecycle-contract.spec.ts`, and `spec/yjs-document-activation.spec.ts`.

## Activation

| Rule             | Behavior                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Deferred binding | With `deferInitialSync: true`, no capture/remote apply until `activate()`.               |
| Provider gate    | `activateBindingsAfterProviderSync` calls `activate()` **once** when status is `synced`. |
| Idempotence      | Repeated `synced` events do not double-activate.                                         |
| Readiness        | `isProviderReadyForInitialSync` is true only for `synced`.                               |

## Offline start & seeding

| Scenario                   | Integrator responsibility                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB hydrate + socket | Await **both** persistence sync and provider `synced` before `activate()`.                                                                                                                    |
| Exactly-once seed          | Initial host→Y or Y→host copy runs **inside** `activate()` / initial sync, using `INITIAL_SYNC_ORIGIN` (excluded from undo). Do not manually seed the same content before and after activate. |
| Reconnect                  | Provider `reconnecting` must not re-run initial seed; binding stays activated.                                                                                                                |

## Undo ownership

| Scope              | Owner                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Single block       | `EditableYjsBinding` with optional shared or owned `Y.UndoManager`                                    |
| Document binding   | One shared `Y.UndoManager` on `Y.Doc`; each directive `yText` added to scope; binding origins tracked |
| Initial sync       | `INITIAL_SYNC_ORIGIN` not tracked                                                                     |
| Structural adapter | Call `runtime.stopUndoCapturing()` before CRDT structure mutations                                    |

Document-level `undo()` / `redo()` on `EditableYjsDocumentBinding` delegates to the shared manager and runs structure reconcile.

## Cleanup (destroy order)

Outermost first:

1. Presence / document annotations overlays
2. `EditableYjsDocumentBinding.destroy()` or per-block `EditableYjsBinding.destroy()`
3. Provider / persistence
4. `editable.unload()`

After `destroy()`, bindings ignore late operations. `activateBindingsAfterProviderSync` unsubscribe must run to avoid leaking activations.

## Diagnostics (internal)

`onSyncDiagnostic` kinds: `binding-deferred`, `binding-activated`, `initial-sync-complete`, `initial-sync-conflict`, `remote-reconcile`, `composition-aborted`, `sync-error` — see [PUBLIC_API_TIERS.md](./PUBLIC_API_TIERS.md).

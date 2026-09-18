# Operation pipeline contract

This document defines how **native capture**, **confirmed operations**, **`applyOperations()` (remote/programmatic DOM)**, and **Yjs local apply** interact. Browser editing and server-side replay share the same DTOs but not the same entrypoints.

## Layers

| Path                   | Entry                                         | DOM                                            | `operation` event                                  | `change`                | Y.Text (binding)                                       |
| ---------------------- | --------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| Native capture         | `beforeinput` / composition / paste → capture | Mutated by browser + optional default behavior | Yes (with `InputChangeCommand` pairing in capture) | Yes                     | Yes — binding listens to `operation`                   |
| Confirmed programmatic | `dispatchEditableOperations()`                | **No** (caller applies separately if needed)   | Yes (unless cancelled)                             | No                      | Only if a binding listener applies                     |
| Remote / API DOM       | `Editable#applyOperations()`                  | Yes (validated batch)                          | **No**                                             | Optional (`emitChange`) | **No** — echo suppressed via `beginRemoteApply`        |
| Yjs local apply        | `operation` → `EditableYjsBinding`            | Already updated by capture                     | (consumer)                                         | —                       | Yes — single `Y.Doc` transaction after full validation |

## Index semantics (multi-operation batches)

Within one `EditableOperationBatch`, each operation’s `index` is measured in the **initial** text coordinate system. While applying, the engine uses **cumulative delta**:

1. `appliedIndex = op.index + delta`
2. Apply op at `appliedIndex`
3. Update `delta` (+insert length, −delete length, replace delta, 0 for attributes)

The same rules apply to:

- DOM apply (`validateOperationBatch` + `applyOperationBatchToDom`)
- Y.Text apply (`validateEditableOperationsForYText` + `applyEditableOperationsToYText`)
- Live Y delta replay (`applyLiveOperationBatchToDom` — face-value indices, no delta)

UTF-16 code units, `\n` line breaks, and plain-text / host policy checks are shared between DOM and validation.

## Echo suppression

During `applyOperations()`:

- `OperationCapture.beginRemoteApply(host)` is active for the whole batch.
- Synthetic `input` events do not produce new capture batches.
- No `operation` or `InputChangeCommand` is emitted from apply.

Integrators must not call `applyOperations()` and also push the same bytes into Yjs manually — pick one path.

## Yjs bound hosts — exactly-once local CRDT apply

For an active `EditableYjsBinding`:

1. Capture emits one confirmed batch → one `operation` callback.
2. Composition commits may remap indices via `resolveCompositionCommitOperations`; if remap yields **no** operations, apply is **aborted** (`composition-aborted` diagnostic).
3. `validateOperationBatch(host, batch)` runs on the full batch (host policy, cumulative indices).
4. Plain-text: host length must match `Y.Text.length` before apply.
5. `validateEditableOperationsForYText(yText, operations)` — no CRDT mutation.
6. One `doc.transact` → `applyEditableOperationsToYText`.

On validation failure, **no** `Y.Text` transaction runs (no partial CRDT commit).

## Composition + queued `applyOperations`

While composing, `applyOperations()` returns `{ queued: true }`. On `compositionend`, queued batches flush in order. Each batch is **re-validated** against the current DOM; stale indices throw `OperationValidationError` and abort the flush (no silent partial apply).

## Server-side replay

Server adapters should use the same batch DTOs and cumulative semantics. They must not depend on browser capture, `beginRemoteApply`, or DOM — apply to stored CRDT or generate operations for clients to `applyOperations()` on peers.

## Related

- [apply-operations.md](./apply-operations.md)
- [browser-operation-fallbacks.md](./browser-operation-fallbacks.md)
- [adr/0001-commands-and-operations.md](./adr/0001-commands-and-operations.md)

# applyOperations()

`Editable#applyOperations()` applies an external `EditableOperationBatch` atomically to a single block host. It is the **adapter foundation** for remote sync (Yjs, WebSocket replay, etc.) — not a complete collaboration solution.

See [OPERATION_CONTRACT.md](./OPERATION_CONTRACT.md) for how capture, `operation`, `applyOperations`, and Yjs local apply differ.

```typescript
editable.applyOperations(host, batch, {
  preserveSelection: true,
  emitChange: true
})
```

## Multi-operation batches

Operations use **face indices** in the initial text plus a **cumulative delta** while applying (see [OPERATION_CONTRACT.md](./OPERATION_CONTRACT.md)). Example: on `abcdef`, `[insertText index 6 "X", deleteText index 0 length 1]` → `bcdefX`.

## Guarantees

- The full batch is **validated** against the current operation text model before the first DOM write.
- On validation failure, **no** operation from the batch is applied.
- Mutations use **small, deterministic DOM patches** (Range insert/delete), not wholesale `innerHTML` replacement.
- UTF-16 offsets match the capture pipeline (`getBlockOperationText`, emoji, combining marks).
- `<br>` elements map to `\n` (`OPERATION_LINE_BREAK`).
- Internal UI nodes (`data-editable="remove"`) are excluded from offset mapping.
- Cross-realm hosts use `ownerDocument` / `defaultView` from the host element.

## Selection

When `preserveSelection: true` (default):

1. If the browser selection is inside the host, anchor/head are mapped to operation offsets **before** apply.
2. Each operation transforms those offsets (insert/delete/replace).
3. After apply, selection is restored from `batch.selectionAfter` when present, otherwise from the transformed snapshot.

Selections outside the host are left untouched.

## Events and echo protection

- Remote/API batches **do not** re-enter the capture pipeline (`operation` / `InputChangeCommand` are not emitted from apply).
- With `emitChange: true` (default), at most **one** `change` event fires after a successful apply.
- While apply runs, `OperationCapture` suppresses echo from synthetic `input` events.

## Composition queue

When a host is composing (IME), `applyOperations()` returns `{ applied: false, queued: true }`. Queued batches run in order on the next `compositionend` for that host.

## Plain-text hosts

Hosts with `data-plaintext="true"` reject `setTextAttributes` and attribute payloads on insert/replace with `OperationValidationError`.

## Errors

| Error                      | Cause                                                  |
| -------------------------- | ------------------------------------------------------ |
| `OperationValidationError` | Invalid indices, empty batch, plain-text attribute ops |
| `Error`                    | Host not registered, disconnected, or after `unload()` |

## Related

- Capture pipeline: `docs/browser-operation-fallbacks.md`
- Operation DTOs: `docs/adr/0001-commands-and-operations.md`

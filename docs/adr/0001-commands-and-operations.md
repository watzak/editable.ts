# ADR 0001: Commands and operations

Status: Accepted  
Date: 2026-09-09

## Context

editable.ts 1.2.x introduced `EditableCommand` — a typed, semantic intent layer for block-level editing (`splitBlock`, `mergeBlock`, `paste`, …). Commands describe **what the user meant** in document terms and are ideal for host-driven DOM adapters that already own block structure.

Future collaborative editing (Yjs) and deterministic replay need a separate layer: **canonical, validated text mutations** that are serializable, free of DOM nodes, and safe to sync. Mixing both concerns into one type would force Yjs adapters to parse HTML fragments and block commands to carry UTF-16 edit lists.

## Decision

Maintain two parallel, composable layers:

| Layer         | Type                     | Consumer               | Contains                                                                                      |
| ------------- | ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| **Command**   | `EditableCommand`        | Document / DOM adapter | Semantic block intent (`splitBlock`, `mergeBlock`, …), host on command, optional native event |
| **Operation** | `EditableOperationBatch` | Yjs / CRDT adapter     | Atomic text ops (`insertText`, `deleteText`, …), host passed separately in events             |

### Command layer (unchanged role)

- Fired via `beforeCommand` → `command` → legacy events → `change`.
- Host element lives on each command.
- Describes structural editing at block granularity.

### Operation layer (new)

- Fired via `beforeOperation(host, context)` → `operation(host, batch)`.
- DTOs contain **no** `HTMLElement`, `Event`, or Yjs types.
- `OperationContext.cancel()` prevents the batch from being emitted, mirroring `CommandContext`.
- `OperationBatchOrigin` (native event, originating command) is **batch-level only** and excluded from wire serialization.

### Operation vocabulary

All offsets and lengths use **UTF-16 code units** — the same indexing as JavaScript strings and DOM `Range#toString()`.

| Operation           | Fields                                           |
| ------------------- | ------------------------------------------------ |
| `insertText`        | `index`, `text`, optional `attributes`           |
| `deleteText`        | `index`, `length`                                |
| `replaceText`       | `index`, `length`, `text`, optional `attributes` |
| `setTextAttributes` | `index`, `length`, `attributes`                  |

Attribute values use `JsonValue`; `null` removes an attribute key.

### Line breaks

DOM `<br>` elements are represented as `\n` (`OPERATION_LINE_BREAK`) in operation text. Operations never embed HTML.

### Selection snapshots

`SelectionSnapshot` carries `anchor`, `head`, and `direction` (`none` | `forward` | `backward`) in UTF-16 offsets relative to the block host text model.

### Sources

`OperationSource` extends command sources with `composition` and `remote`:

`keyboard` | `beforeinput` | `paste` | `composition` | `api` | `remote`

## Consequences

**Positive**

- Yjs integration can consume operation batches without HTML parsing.
- Document adapters keep using commands without Yjs coupling.
- Operation batches are JSON-serializable when `origin` is stripped.
- `beforeOperation` cancellation enables host veto before sync.

**Negative**

- Two event streams to observe during transition; mappers from command → operation come in a later step.
- Block splits/merges are not expressible as pure text ops — structural edits remain commands until a block-model adapter exists.

## Verification

- Unit tests for `dispatchEditableOperations` and type contracts (`spec/operation-api.spec.ts`).
- Consumer type tests confirm additive API (`beforeOperation`, `operation`) without breaking 1.2.x handlers.
- Core has no Yjs dependency; browser capture wiring in Prompt 2 (`docs/browser-operation-fallbacks.md`), remote apply in Prompt 3 (`docs/apply-operations.md`), optional `./yjs` subpath in Prompt 4 (`docs/yjs-binding.md`), rich-text delta attributes via `InlineFormatRegistry` in Prompt 6, optional Awareness presence overlay (`EditableYjsPresence`) in Prompt 7 — never persisted in Y.Text.

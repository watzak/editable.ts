# ADR 001: Annotation v2 CRDT storage

## Status

Accepted (2026-09-18)

## Context

v1 stores each annotation as one JSON value on `editable.ts:annotations:v1`. Updates such as `addReply` read-modify-write the whole record, so concurrent replies on offline peers converge to **last-write-wins** (one reply lost).

## Decision

- **v2** map values are nested `Y.Map` entries (`v: 2`) with scalar fields (`anchor`, `head`, `status`, `resolvedAt`, …) and a nested `replies` `Y.Map<replyId, reply>`.
- **Read path** accepts v1 JSON and v2 maps via `parseAnnotationStorageValue`.
- **Default write path** (`AnnotationStore` constructor) uses v2 for new records and reply/resolve/orphan updates.
- **v1 → v2** only through `coordinatedMigrateAnnotationsV1ToV2` during a coordinated maintenance window (single write master). No automatic dual-write.

## Consequences

- Parallel replies merge by reply id (CRDT map).
- Integrators still on v1 must migrate before expecting reply merge semantics.
- Breaking: none for readers; writers that relied on v1 LWW semantics for conflict resolution must adopt v2.

## References

- `src/yjs/annotation-crdt.ts`, `src/yjs/annotation-coordinated-migration.ts`
- `spec/yjs-annotation-v2-collab.spec.ts`

# ADR 002: Structural edit concurrency (split/merge vs text)

## Status

Accepted with **product restriction** (2026-09-18)

## Context

Block split/merge touches `Y.Array` structure and one or more `Y.Text` instances. Tail edits (insert/delete) on the same `Y.Text` can proceed concurrently on other peers. Wrapping both in `Y.Doc.transact` on one client does **not** serialize remote structural and text ops — Yjs merges them by CRDT rules, which can yield divergent DOM if integrators assume transactional exclusivity.

Annotation remapping must capture UTF-16 anchors **before** mutating source `Y.Text` (`captureAnnotationSnapshotsBeforeSplit`). Crossing selections clip on the source block by default (`DEFAULT_ANNOTATION_SPLIT_POLICY`).

## Decision

- The library documents the limitation; it does **not** claim `transact` alone prevents split/merge vs tail-edit races.
- **Product restriction:** at most one structural editor (split/merge/move) should be active per document slice without a higher-level lock or single-writer policy. Text editing may continue on blocks not undergoing structure change.
- **Gate:** `spec/yjs-structural-concurrency-gate.spec.ts` keeps a failing reproduction until an integrator-level protocol exists.

## CMS example warning

`moveCmsComponent` in `examples/yjs-cms-document-adapter.ts` **clone-and-deletes** components, producing **new** `Y.Text` identities. Concurrent edits to the pre-move body do not follow the moved component. Moves are **integrator-owned** — use shared identity or explicit merge policy.

## References

- `src/yjs/annotation-split-policy.ts`, `src/yjs/structural-ytext.ts`
- `spec/yjs-p0-baseline.spec.ts` (move gate)

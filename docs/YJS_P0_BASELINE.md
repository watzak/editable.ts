# Yjs P0 baseline matrix

**Seed:** `20260918-p0-baseline`  
**Spec:** `spec/yjs-p0-baseline.spec.ts`  
**Audit date:** 2026-09-18  
**HEAD:** `58b3840ce22ea3c64c9fd108211de191ece564f8`

Run:

```bash
npm exec vitest run spec/yjs-p0-baseline.spec.ts
```

Gate tests use Vitest `it.fails` — they **must fail** until the underlying issue is fixed. Do not change them to passing without a product fix.

## Abnahme matrix

| Scenario                                                            | Status                        | Expected / observed                                                                        | Evidence                                                                            |
| ------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Two simultaneous `moveCmsComponent` on synced peers                 | **Funktioniert**              | Root length 3; same id set on both docs after bidirectional sync                           | `dual-move` replay                                                                  |
| Multi-block paste with suffix (`pasteBlocks`, offset mid-string)    | **Funktioniert**              | Source `Y.Text` → `prefix`; root length 3; suffix removed in CRDT                          | `paste-suffix` replay                                                               |
| Annotation after type change (same `componentId`, `body`, new host) | **Funktioniert**              | Record stays `active`; new DOM host; same `componentId`                                    | `annotation-type-change` replay                                                     |
| `plainText` host + `setTextAttributes` via `applyOperations`        | **Funktioniert**              | Throws `OperationValidationError`; `Y.Text` unchanged                                      | baseline spec                                                                       |
| `applyOperations` on **active** `EditableYjsBinding`                | **Funktioniert (DOM-only)**   | DOM updates; `Y.Text` unchanged — uses `beginRemoteApply`, no `operation` → CRDT pipeline  | `applyOperations-dom-only` replay; see [apply-operations.md](./apply-operations.md) |
| Invalid multi-op batch (out-of-range insert)                        | **Funktioniert**              | Throws before CRDT mutation; `Y.Text` stays `ab`                                           | baseline spec                                                                       |
| Split + `migrateAnnotationsOnSplit` (structural harness)            | **Funktioniert**              | Annotation stays `active` on target block                                                  | `split-rel-pos` replay                                                              |
| `moveCmsComponent` vs remote text edit (clone new `Y.Text`)         | **Reproduzierbar fehlerhaft** | Remote edit on pre-move body does not appear on moved component body (`alpha` vs `alpha!`) | Gate: `gate-move-vs-remote-text`                                                    |
| Two `AnnotationStore.addReply` before sync (v1 write)               | **Reproduzierbar fehlerhaft** | Thread length 1 after sync (LWW on whole map value), not 2                                 | Gate: `v1 concurrent addReply` (`writeVersion: 1`)                                  |
| Two `addReply` before sync (default v2)                             | **Funktioniert**              | Both replies present after bidirectional sync                                              | `spec/yjs-annotation-v2-collab.spec.ts`                                             |
| `allowedFormats: []` + `setTextAttributes` via `applyOperations`    | **Funktioniert**              | Throws `OperationValidationError`; DOM unchanged                                           | `host-policy.spec.ts`; see [MIGRATION.md](./MIGRATION.md)                           |

## Ungeprüft in this baseline

| Scenario                                        | Reason                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Real y-websocket / IndexedDB provider reconnect | Integrator-owned; see `docs/YJS_PROVIDER_INTEGRATION.md`                                                    |
| macOS / Windows OS IME                          | Playwright composition only; manual QA                                                                      |
| GitHub Pages unbundled Yjs demos                | Not part of CI e2e bundle                                                                                   |
| Full `npm run verify` green in one shot         | Blocked by unrelated `text-diff-edge-cases` coverage timeout (see [REPRO_BASELINE.md](./REPRO_BASELINE.md)) |

## Gate (release / CMS integration)

**Gesperrt** for treating `./yjs` + CMS example adapter as P0-clear until:

1. Move + concurrent text editing strategy is defined (clone vs shared `Y.Text` identity).
2. Annotation replies merge safely under CRDT for **v2** storage; v1 requires coordinated migration. Structural split/merge vs tail-edit remains integrator-gated (ADR 002).

## Related existing coverage (not duplicated here)

- Document remote structure: `spec/yjs-document-remote-sync.spec.ts`
- Type change reconcile: `spec/yjs-document-type-change.spec.ts`
- Annotation CRDT / UI: `spec/yjs-annotations.spec.ts`, `spec/yjs-document-annotations.spec.ts`
- Convergence fuzz seed `20260909`: `spec/yjs-convergence-fuzz.spec.ts`

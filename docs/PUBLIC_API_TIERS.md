# Public API tiers

All symbols remain exported from their existing `package.json` subpaths. This document **classifies** stability only — nothing is removed without a major release and [MIGRATION.md](./MIGRATION.md) entry.

| Tier                     | Meaning                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Supported**            | Semver-covered; breaking changes only in major (or documented migration for `./yjs` beta)                                   |
| **Experimental**         | `./yjs` collaboration surface; behavior may change in minor/patch until stable `1.3.x`                                      |
| **Internal diagnostics** | Callback payloads, parse helpers, structure diff utilities — safe to use for debugging, not a long-term integrator contract |

## Subpath `editable.ts` (core)

### Supported

- `Editable`, host registration (`add` / `remove` / `unload`), events, selection, clipboard
- Operations: `applyOperations`, operation types, validation errors
- Host policy: `allowedFormats`, `plainText`, `maxLength`, paste rules
- `binaryCursorSearch`, DOM helpers exported from core where documented in README

### Experimental

- None on core entry (core stays Yjs-free)

### Internal diagnostics

- Low-level parser/block utilities not re-exported from `core.ts` entry (deep imports into `lib/` are unsupported)

## Subpath `editable.ts/features`

### Supported

- Plugin setup methods (`setupHighlighting`, `setupSpellcheck`, `setupTextDiff`) when sideEffects import is used

### Experimental

- Plugin configuration shapes may evolve in minor releases

## Subpath `editable.ts/yjs`

### Supported (within beta)

- `EditableYjsBinding`, `EditableYjsDocumentBinding`, `EditableYjsDocumentAdapter` types
- `InitialSyncPolicy`, `deferInitialSync`, `activate()`, `activateBindingsAfterProviderSync`
- `EditableYjsPresence`, `InlineFormatRegistry` / default codecs
- Operation contract: `applyEditableOperationsToYText`, `validateEditableOperationsForYText`

### Experimental

- Annotations (`EditableYjsAnnotations`, `EditableYjsDocumentAnnotations`, `AnnotationStore`, v2 CRDT storage, coordinated migration)
- Document structure sync helpers (`diffStructureSnapshot`, `parseStructureSnapshot`)
- Structural Y.Text helpers (`moveYTextTailToTarget`, `mergeYTextIntoTarget`)
- Composition remote sync helpers
- Examples under `examples/` (including CMS adapter) — **not** published in the npm tarball as importable packages; copy or vendor patterns only

### Internal diagnostics

- `YjsSyncDiagnostic`, `onSyncDiagnostic` kinds
- `DocumentStructureDiagnostic`
- `parseAnnotationRecord`, `parseAnnotationStorageValue`, `isV2AnnotationMap`
- `remote-sync-state` snapshot helpers used for tests and recovery

## Not public API

- `examples/*` source in the git repo (demos only)
- `scripts/*`, `spec/*`, `e2e/*`
- Deep imports such as `editable.ts/lib/yjs/...` (use `./yjs` barrel)

See also [DOCUMENT_ADAPTER_CONTRACT.md](./DOCUMENT_ADAPTER_CONTRACT.md), [YJS_PROVIDER_INTEGRATION.md](./YJS_PROVIDER_INTEGRATION.md), [RELEASE_READINESS_YJS_RC.md](./RELEASE_READINESS_YJS_RC.md).

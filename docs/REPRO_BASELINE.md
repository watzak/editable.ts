# Repro baseline — editable.ts (local audit)

**Date:** 2026-09-18 (Prompt 04 integration readiness)  
**Git HEAD:** see `integration-artifacts/MANIFEST.json` after `npm run integration:artifact`  
**Package version:** `1.2.1` (unchanged; suggested pre-release `1.3.0-beta.2` in [RELEASE_READINESS_YJS_RC.md](./RELEASE_READINESS_YJS_RC.md))  
**P0 seed:** `20260918-p0-baseline` · **Consumer tarball:** [INTEGRATION_ARTIFACT.md](./INTEGRATION_ARTIFACT.md)

No version bump, tag, publish, or CMS integration work in this audit.

## Toolchain

| Item          | Value                                             |
| ------------- | ------------------------------------------------- |
| Node (local)  | v24.18.0 (`.nvmrc` → `24`)                        |
| npm (local)   | 11.16.0 (`engines`: node `>=22`, npm `>=11`)      |
| Lockfile      | `package-lock.json`                               |
| Unit runner   | Vitest 4.1.11                                     |
| Lint / format | oxlint, oxfmt                                     |
| E2E           | Playwright 1.60 (`chromium`, `firefox`, `webkit`) |

## Public exports (`package.json`)

| Subpath                   | Role                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `.`                       | Core (`Editable`, operations, host policy) — **Yjs-free**                              |
| `./features`              | Optional plugins (spellcheck, highlighting, …)                                         |
| `./yjs`                   | Optional collaboration (`EditableYjsBinding`, document binding, annotations, presence) |
| `./dist/editable.umd.cjs` | UMD bundle — **Yjs-free**                                                              |

## Optional peers (Yjs)

| Package       | Range     | Notes                             |
| ------------- | --------- | --------------------------------- |
| `yjs`         | `^13.6.0` | optional (`peerDependenciesMeta`) |
| `y-protocols` | `^1.0.6`  | optional; Awareness for presence  |

Dev-only: `y-websocket`, `y-indexeddb`, `ws` (demos / e2e).

## CI workflows (`.github/workflows/ci.yml`)

| Job          | Command                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| quality      | `npm ci` → `npm run verify`                                                                           |
| e2e (matrix) | `npm ci` → `npx playwright install <browser> --with-deps` → `npm run test:e2e -- --project=<browser>` |

## Local verification (2026-09-18)

| Command             | Result                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`            | Pass (1 high-severity prod advisory reported by npm audit; not auto-fixed)                                                                                                                                                     |
| `npm test`          | Pass — **72** files, **905** passed, **3** expected fail (gates), **908** total                                                                                                                                                |
| `npm run lint`      | Pass                                                                                                                                                                                                                           |
| `npm run typecheck` | Pass                                                                                                                                                                                                                           |
| `npm run verify`    | **Partial** — fails on `test:coverage` timeout in `spec/text-diff/text-diff-edge-cases.spec.ts` (“very long text strings”, 8s limit). Same suite passes under `npm test` without coverage overhead.                            |
| `npm run test:e2e`  | **123 passed**, **3 skipped** (native undo), **0 failed** — chromium / firefox / webkit (2026-09-18 local). IME: [MANUAL_IME_ACCEPTANCE.md](./MANUAL_IME_ACCEPTANCE.md) only.                                                  |
| `npm run integration:artifact` | Produces `integration-artifacts/*.tgz` + `MANIFEST.json` (SHA256) for kamod-edit pin                                                                                                                          |
| `npm run validate:packed-consumer` | Pass — core/yjs peer boundary, barrel byte metrics                                                                                                                                                        |

Re-run P0 matrix only:

```bash
npm exec vitest run spec/yjs-p0-baseline.spec.ts
```

Replay lines are printed as `[P0:20260918-p0-baseline] …` JSON on stdout.

## Scope boundary

This baseline documents **library + example CMS adapter** behavior under Vitest/jsdom and Playwright. It does **not** implement or validate a full Kamod/Preact CMS (`Y.Doc`-as-draft, single undo pipeline). Feature work stays blocked until P0 gate items in [YJS_P0_BASELINE.md](./YJS_P0_BASELINE.md) are resolved or explicitly accepted.

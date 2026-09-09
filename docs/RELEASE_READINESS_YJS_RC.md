# Release readiness — Yjs experimental RC (local audit)

**Date:** 2026-09-09  
**Package version audited:** `1.2.1` (unchanged — no publish performed)  
**Recommended next version:** `1.3.0-beta.1`

## Executive summary

The optional `./yjs` subpath is ready for an **experimental** release candidate. Core, Features, and UMD remain Yjs-free.

**CI fix applied:** Removed duplicate `examples/yjs-array-structural-adapter.js` (lib imports) that shadowed the TypeScript source during Vitest resolution. Tests and the collab demo now use the single `.ts` example (src imports); Vitest `extensionAlias` resolves `.js` specifiers to `.ts` when no competing `.js` file exists.

Local verification passes after the fix: `npm ci`, `npm run verify` (742 unit tests, typecheck, lint, format, knip, publint, ATTW, packed consumer, size limits), and Playwright e2e (90 passed, 3 skipped) across Chromium/Firefox/WebKit including the collab RC demo.

**Recommendation:** Publish `1.3.0-beta.1` with `./yjs` documented as experimental; gather integrator feedback and run manual OS IME before promoting to stable `1.3.0`.

**Not performed (per scope):** version bump, git tag, push, GitHub release, npm publish.

## Audit results

| Area                                 | Status | Notes                                                                                                                                                                                  |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Echo / reentrancy                    | Pass   | Binding origin skips self-updates; `beginRemoteApply` suppresses capture; destroy ignores late ops; demo uses sync guard + debounced awareness                                         |
| Remote apply under concurrent typing | Pass   | Delta patching restricted to attribute-only deltas; text changes rebuild the host from canonical `Y.Text`. Non-convergence reconciles instead of throwing out of the `Y.Text` observer |
| Composition / blur / destroy races   | Pass   | Hardening specs; presence `MutationObserver` auto-destroy on host removal                                                                                                              |
| Listener leaks                       | Pass   | `destroy()` on binding, presence, structural bridge, undo controller                                                                                                                   |
| innerHTML in sync hot path           | Pass   | Live operation apply; `innerHTML` only in example structural adapter split helper                                                                                                      |
| iframe / realm                       | Pass   | `ownerDocument` + `Editable({ window })` tested                                                                                                                                        |
| URL / presence sanitization          | Pass   | Payload validators + existing URL security                                                                                                                                             |
| `\n` / `<br>`                        | Pass   | Documented in `docs/yjs-binding.md`; operation model canonical                                                                                                                         |
| UTF-16 offsets                       | Pass   | Documented; fuzz includes emoji + combining marks                                                                                                                                      |
| Yjs in core/features/UMD             | Pass   | `validate:core-bundle` enforced                                                                                                                                                        |
| 1000-op seeded convergence           | Pass   | `spec/yjs-convergence-fuzz.spec.ts` seed `20260909`                                                                                                                                    |
| Packed consumer                      | Pass   | Core without yjs; `./yjs` + `./features` from packed tarball                                                                                                                           |
| npm audit (prod deps)                | Pass   | `0 vulnerabilities` (`npm audit --omit=dev`)                                                                                                                                           |
| Test/build artifact isolation        | Pass   | Unit tests import `src/` and `examples/*.ts`; no pre-build `lib/` dependency                                                                                                           |

## Verification log (2026-09-09, post-fix)

| Command                    | Result                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `npm ci`                   | Pass                                                                                   |
| `npm run typecheck`        | Pass                                                                                   |
| `npm run test:coverage`    | Pass — 48 files, 742 tests; coverage ≥ thresholds (lines 82.13%, branches 67.5%)       |
| `npm run lint`             | Pass — 1 pre-existing warning in `presence-payload.ts` (no-control-regex)              |
| `npm run format:check`     | Pass                                                                                   |
| `npm run knip`             | Pass                                                                                   |
| `npm run validate:package` | Pass — build, core-bundle Yjs-free, consumer typecheck, publint, ATTW, packed consumer |
| `npm run verify`           | Pass — full pipeline above + `pack:check` + size limits                                |
| `npm run test:e2e`         | Pass — 90 passed, 3 skipped (native undo unsupported), 0 failed                        |
| `npm audit --omit=dev`     | 0 vulnerabilities                                                                      |

## Entrypoint sizes (gzip / brotli)

Measured via `node scripts/measure-entrypoint-sizes.mjs` after build. Yjs remains an optional peer — not bundled.

| Entry           | Raw      | gzip     | brotli   |
| --------------- | -------- | -------- | -------- |
| core (ESM)      | 10.54 kB | 2.65 kB  | 2.27 kB  |
| features (ESM)  | 2.87 kB  | 0.85 kB  | 0.71 kB  |
| yjs index (ESM) | 1.92 kB  | 0.78 kB  | 0.66 kB  |
| yjs binding     | 16.56 kB | 3.87 kB  | 3.36 kB  |
| yjs undo        | 5.95 kB  | 1.59 kB  | 1.37 kB  |
| yjs presence    | 8.90 kB  | 2.06 kB  | 1.79 kB  |
| UMD             | 91.66 kB | 26.18 kB | 23.11 kB |

Size-limit CI (brotli): UMD ≤ 24 kB, binding ≤ 4 kB, undo ≤ 2 kB, presence ≤ 3 kB — all pass.

## Demos & browser tests

| Demo                                | Coverage                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `examples/yjs-collab-demo.html`     | Plain + rich toggle, offline/reconnect, presence, undo/redo, bold, split (example adapter), destroy/remount |
| `examples/yjs-presence-editor.html` | Awareness two-client                                                                                        |
| `examples/yjs-rich-editor.html`     | Rich-text delta sync                                                                                        |

E2e notes:

- Chromium/Firefox/WebKit via Playwright; real `beforeinput` paths where Playwright generates them.
- Composition simulated in `e2e/composition-unicode-flows.spec.ts`; **real OS IME requires manual QA**.
- Collab e2e asserts **Y.Text convergence** as canonical; remote DOM may lag Playwright typing (ZWSP) until reconcile.
- The collab demo syncs only after confirmed `operation` batches (no raw `input` trigger) and diffs against the peer state vector, so peers never re-exchange known operations.

## Known limits (experimental)

- `./yjs` API may change before `1.3.0` stable.
- Structural adapter in `examples/yjs-array-structural-adapter.ts` is illustrative — not a mandated document schema.
- Provider wiring (y-websocket, y-indexeddb, etc.) is integrator-owned; see `docs/yjs-provider-example.md`.
- Playwright cannot fully substitute macOS/Windows IME composition sessions.
- Standalone Yjs HTML demos (`yjs-collab-demo.html`, etc.) load unbundled ES modules via Vite dev (`npm run dev` / e2e). GitHub Pages deploy copies `examples/` only; Yjs demos there require a built `lib/` tree or bundling — not verified in this audit.

## Pre-release checklist (not executed)

- [ ] Bump to `1.3.0-beta.1`
- [ ] Tag + GitHub release notes
- [ ] npm publish with `yjs` + `y-protocols` optional peers
- [ ] Manual OS IME pass (macOS + Windows)
- [ ] Integrator trial with real y-websocket provider

## Version recommendation

| Option             | When                                                              |
| ------------------ | ----------------------------------------------------------------- |
| **`1.3.0-beta.1`** | Immediate experimental npm pre-release (**recommended**)          |
| **`1.3.0`**        | After beta feedback + IME/provider validation                     |
| **`1.2.2`**        | Patch-only without Yjs announcement (understates feature surface) |

Current `1.2.1` understates the Yjs integration; **`1.3.0-beta.1`** best signals the additive experimental `./yjs` subpath.

# Release readiness — Yjs experimental RC (local audit)

**Date:** 2026-09-09  
**Package version audited:** `1.2.1` (unchanged — no publish performed)  
**Recommended next version:** `1.3.0-beta.1`

## Executive summary

The optional `./yjs` subpath (Prompts 4–9) is ready for an **experimental** release candidate. Core, Features, and UMD remain Yjs-free. Local verification passes: `npm ci`, `npm run verify` (730 unit tests, typecheck, lint, knip, publint, ATTW, packed consumer, size limits), and Playwright e2e across Chromium/Firefox/WebKit including the new collab RC demo.

**Recommendation:** Publish `1.3.0-beta.1` with `./yjs` documented as experimental; gather integrator feedback and run manual OS IME before promoting to stable `1.3.0`.

**Not performed (per scope):** version bump, git tag, push, GitHub release, npm publish.

## Audit results

| Area | Status | Notes |
| --- | --- | --- |
| Echo / reentrancy | Pass | Binding origin skips self-updates; `beginRemoteApply` suppresses capture; destroy ignores late ops; demo uses sync guard + debounced awareness |
| Composition / blur / destroy races | Pass | Hardening specs; presence `MutationObserver` auto-destroy on host removal |
| Listener leaks | Pass | `destroy()` on binding, presence, structural bridge, undo controller |
| innerHTML in sync hot path | Pass | Live operation apply; `innerHTML` only in example structural adapter split helper |
| iframe / realm | Pass | `ownerDocument` + `Editable({ window })` tested |
| URL / presence sanitization | Pass | Payload validators + existing URL security |
| `\n` / `<br>` | Pass | Documented in `docs/yjs-binding.md`; operation model canonical |
| UTF-16 offsets | Pass | Documented; fuzz includes emoji + combining marks |
| Yjs in core/features/UMD | Pass | `validate:core-bundle` enforced |
| 1000-op seeded convergence | Pass | `spec/yjs-convergence-fuzz.spec.ts` seed `20260909` |
| Packed consumer | Pass | Core without yjs; `./yjs` + `./features` from packed tarball |
| npm audit (prod deps) | Pass | `0 vulnerabilities` (`npm audit --omit=dev`) |

## Verification log (2026-09-09)

| Command | Result |
| --- | --- |
| `npm ci` | Pass |
| `npm run verify` | Pass — 730 unit tests, coverage ≥ thresholds, publint, ATTW, pack consumer |
| `npm run test:e2e` | Pass — 87 passed, 3 skipped (native undo unsupported), 0 failed |
| `npm audit --omit=dev` | 0 vulnerabilities |

## Entrypoint sizes (gzip / brotli)

Measured via `node scripts/measure-entrypoint-sizes.mjs` after build. Yjs remains an optional peer — not bundled.

| Entry | Raw | gzip | brotli |
| --- | --- | --- | --- |
| core (ESM) | 10.54 kB | 2.65 kB | 2.27 kB |
| features (ESM) | 2.87 kB | 0.85 kB | 0.71 kB |
| yjs index (ESM) | 1.72 kB | 0.71 kB | 0.61 kB |
| yjs binding | 13.29 kB | 3.17 kB | 2.75 kB |
| yjs undo | 5.95 kB | 1.59 kB | 1.37 kB |
| yjs presence | 8.90 kB | 2.06 kB | 1.79 kB |
| UMD | 91.24 kB | 26.05 kB | 23.02 kB |

Size-limit CI (brotli): UMD ≤ 24 kB, binding ≤ 4 kB, undo ≤ 2 kB, presence ≤ 3 kB — all pass.

## Demos & browser tests

| Demo | Coverage |
| --- | --- |
| `examples/yjs-collab-demo.html` | Plain + rich toggle, offline/reconnect, presence, undo/redo, bold, split (example adapter), destroy/remount |
| `examples/yjs-presence-editor.html` | Awareness two-client |
| `examples/yjs-rich-editor.html` | Rich-text delta sync |

E2e notes:

- Chromium/Firefox/WebKit via Playwright; real `beforeinput` paths where Playwright generates them.
- Composition simulated in `e2e/composition-unicode-flows.spec.ts`; **real OS IME requires manual QA**.
- Collab e2e asserts **Y.Text convergence** as canonical; remote DOM may lag Playwright typing (ZWSP) until reconcile.

## Known limits (experimental)

- `./yjs` API may change before `1.3.0` stable.
- Structural adapter in `examples/` is illustrative — not a mandated document schema.
- Provider wiring (y-websocket, y-indexeddb, etc.) is integrator-owned; see `docs/yjs-provider-example.md`.
- Playwright cannot fully substitute macOS/Windows IME composition sessions.

## Pre-release checklist (not executed)

- [ ] Bump to `1.3.0-beta.1`
- [ ] Tag + GitHub release notes
- [ ] npm publish with `yjs` + `y-protocols` optional peers
- [ ] Manual OS IME pass (macOS + Windows)
- [ ] Integrator trial with real y-websocket provider

## Version recommendation

| Option | When |
| --- | --- |
| **`1.3.0-beta.1`** | Immediate experimental npm pre-release (**recommended**) |
| **`1.3.0`** | After beta feedback + IME/provider validation |
| **`1.2.2`** | Patch-only without Yjs announcement (understates feature surface) |

Current `1.2.1` understates the Yjs integration; **`1.3.0-beta.1`** best signals the additive experimental `./yjs` subpath.

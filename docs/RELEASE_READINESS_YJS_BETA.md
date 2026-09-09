# Release readiness — `1.3.0-beta.1` (local prep)

**Date:** 2026-09-09  
**Package version in tree:** `1.2.1` (unchanged — no commit/tag/publish per scope)  
**Target pre-release:** `1.3.0-beta.1`

## Executive summary

The optional `./yjs` subpath is prepared for an integrator beta. This pass adds **real y-websocket integration demos**, **deferred initial sync (`activate()`)**, a **provider-neutral status convention**, **sync diagnostics**, expanded documentation (startup sequences, IME plan, lifecycle), and **tarball consumer fixtures**.

**Not performed:** version bump commit, git tag, GitHub release, npm publish.

## Verification log (2026-09-09 beta prep)

| Command | Result |
|---------|--------|
| `npm ci` | Pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run verify` | Pass — typecheck, 817 unit tests, lint, format, knip, publint, ATTW, packed consumer, beta consumers, size limits |
| `npm run test:e2e` | **123 passed**, 3 skipped (native undo), 0 failed — Chromium/Firefox/WebKit |
| `npm pack` | Local tarball generated for consumer installs |

## New beta-prep deliverables

| Area | Artifact |
|------|----------|
| Provider status | `YjsProviderStatus`, `createProviderStatusSource`, `isProviderReadyForInitialSync` |
| Deferred sync | `deferInitialSync`, `binding.activate()`, `activateBindingsAfterProviderSync` |
| Diagnostics | `onSyncDiagnostic` / `YjsSyncDiagnostic` |
| Real transport demo | `examples/yjs-websocket-demo.html` + `scripts/yjs-websocket-server.mjs` |
| Offline demo | `examples/yjs-offline-demo.html` (`y-indexeddb` + websocket) |
| Docs | `YJS_PROVIDER_INTEGRATION.md`, `YJS_IME_TEST_PLAN.md`, updated `yjs-provider-example.md` |
| Release notes draft | `docs/releases/1.3.0-beta.1.md` |
| E2E | `e2e/yjs-websocket-flows.spec.ts` (two browser contexts, real WS server) |
| Consumer fixtures | `scripts/validate-beta-consumers.mjs` (core-only, yjs-peer, vite bundle) |

## Provider ownership (unchanged)

- `y-websocket`, `y-indexeddb`, `ws` are **devDependencies** for demos only
- Published package peers: optional `yjs`, `y-protocols`
- Integrators supply transport, auth, persistence, privacy compliance

## Size limits (brotli, CI)

| Artifact | Limit | Measured |
|----------|-------|----------|
| `dist/editable.umd.cjs` | 25 KB | ~24.61 KB |
| `lib/yjs/editable-yjs-binding.js` | 4.25 KB | ~4.17 KB |
| `lib/yjs/binding-undo.js` | 2 KB | ~1.4 KB |
| `lib/yjs/editable-yjs-presence.js` | 3 KB | ~1.83 KB |
| `lib/yjs/editable-yjs-annotations.js` | 4 KB | ~1.57 KB |

Core UMD/ESM remain Yjs-free (`validate:core-bundle`).

## E2E matrix

| Suite | Coverage |
|-------|----------|
| Manual network collab | Plain/rich, offline, presence, undo, destroy |
| Document collab | Structure sync, concurrent edits, offline |
| Annotations | Persistent map, two clients |
| **y-websocket** | Two contexts, provider `synced`, CRDT round-trip + typing |
| Presence | Overlay cleanup |

## Manual QA still required

- [ ] macOS IME ([YJS_IME_TEST_PLAN.md](./YJS_IME_TEST_PLAN.md))
- [ ] Windows IME (same doc)
- [ ] Production auth on websocket upgrade path
- [ ] GitHub Pages bundling for Yjs HTML demos (Vite dev verified)

## Known risks / honest limits

1. **Experimental API** — `./yjs` may change before `1.3.0` stable (document, annotations, deferred sync).
2. **Provider version coupling** — demo server uses `y-websocket@2` utils; client demos use same major line. `@y/websocket-server` targets Yjs 14 and is **not** used (incompatible with peer `yjs@13`).
3. **Document binding** — adapter-owned schema; remote structure reconcile is `@experimental`.
4. **IME** — CI simulates composition; real OS IME not automated.
5. **Annotation relative positions** — require consistent Y.Text field names across synced docs (same as presence).
6. **Size budget** — binding module grew with `activate()`; limit raised to 4.25 KB brotlied.

## Recommended publish steps (when approved)

1. Bump version to `1.3.0-beta.1` in `package.json`
2. Move `[Unreleased]` CHANGELOG section to dated beta entry
3. Tag `v1.3.0-beta.1`, GitHub pre-release with `docs/releases/1.3.0-beta.1.md`
4. `npm publish --tag beta`
5. Complete manual IME checklist

## Pre-release checklist

- [x] Real y-websocket two-client e2e
- [x] Deferred initial sync API + docs
- [x] Provider status convention
- [x] Sync diagnostics callback
- [x] Tarball consumer fixtures (core / yjs / bundler)
- [x] CHANGELOG + release notes draft
- [ ] Version bump + tag (explicitly out of scope)
- [ ] npm publish (explicitly out of scope)
- [ ] Manual IME sign-off

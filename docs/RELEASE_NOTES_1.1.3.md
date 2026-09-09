# Proposed release notes — editable.ts 1.1.3

> Draft for maintainer review. Version remains **1.1.2** in `package.json` until you run `npm run release`.

## Summary

Patch release focused on **security hardening**, **typed command/input pipeline**, **cross-browser E2E coverage**, and **release tooling** — without breaking the public API.

## Security

- Hardened HTML paste sanitizer: DOM-based attribute handling, blocked dangerous URL schemes, safer `target="_blank"` links.
- Per-instance paste rules and block ownership isolation.

## Features

- **Typed Command API** — discriminated `EditableCommand` union; `beforeCommand` / `command` events; optional `ChangeDetails` on `change`; legacy events unchanged.
- **Modern input pipeline** — `beforeinput` support, IME/composition guard, keydown deduplication fallback.
- **SSR / iframe safety** — realm-safe imports and `{ window }` configuration for embedded editors.

## Quality & tooling

- TypeScript split configs, consumer type tests, `validate:package` (publint + Are The Types Wrong).
- Cross-browser Playwright E2E (Chromium, Firefox, WebKit).
- `npm run verify` — unified pre-release quality gate.
- npm audit clean for production dependencies; dev toolchain updated (Vitest 4.1.11, transitive fixes).
- OIDC publish workflow: single release trigger, concurrency, provenance.

## Fixes

- Shared document listener lifecycle across multiple instances on one document.
- Selection/cursor edge cases in nested markup and unicode text.

## Breaking changes

None intended for 1.1.x consumers.

## Upgrade notes

- Import paths unchanged: `editable.ts` (core) and `editable.ts/features` (optional).
- If you relied on undocumented paste HTML behavior, re-test paste flows — sanitizer is stricter.
- For iframe editors, pass `{ window: iframe.contentWindow }` to `new Editable()`.

## Known limitations

- Structural undo/redo via native browser undo is engine-dependent (documented in README browser matrix).
- Firefox E2E paste uses a test helper fallback when synthetic `ClipboardEvent` clipboard data is unavailable; production paste uses native events.

## Files in npm package

`lib/`, `dist/editable.umd.cjs`, `README.md`, `LICENSE` — see `npm pack --dry-run` output before publish.

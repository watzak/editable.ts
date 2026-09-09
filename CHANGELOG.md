# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [Unreleased]

### Added

- Cross-browser Playwright E2E matrix (Chromium, Firefox, WebKit) with CI job split and failure artifacts.
- `npm run verify` — single local/CI quality gate before release.
- Release documentation refresh (`docs/publish.md`, `docs/RELEASE_CHECKLIST.md`) for OIDC Trusted Publishing.

### Changed

- Dev dependency audit remediation (Vitest 4.1.11, transitive toolchain updates).
- Publish workflow: single `release: published` trigger, concurrency guard, provenance, full `verify` step.
- Stop tracking generated `examples/dist/` bundles (GitHub Pages builds demo in CI).

### Features (since 1.1.2)

- **Typed Command API:** Browser input normalized into discriminated `EditableCommand` objects; `beforeCommand` / `command` events; optional `ChangeDetails` on `change`; legacy events preserved.
- **Input pipeline:** `beforeinput` + composition-aware editing with keydown deduplication fallback.
- **Package quality:** Split `tsconfig`, consumer type tests, `validate:package` (publint + attw), typed convenience methods.

### Security (since 1.1.2)

- Paste sanitizer hardening: DOM-based attribute application, blocked URL schemes (`javascript:`, `data:`, `vbscript:`, `file:`), `noopener`/`noreferrer` on `target="_blank"`.
- Per-instance isolation for paste rules and block ownership; iframe/SSR-safe realm handling.

## [1.1.2](https://github.com/watzak/editable.ts/compare/v1.1.1...v1.1.2) (2026-06-02)

### Features

- **Shared document listeners:** Multiple `Editable` instances on one document share native listeners safely via `shared-document-listeners.ts`, reducing duplicate handlers and memory use.
- **Tooling:** Added Knip configuration for unused file/dependency detection; extended Vitest coverage thresholds; CI coverage step.

### Changed

- **Dispatcher / selection:** Refactored listener setup and selection watcher integration; improved keyboard and highlight-related edge cases.
- **Build:** TypeScript build config split (`tsconfig.build.json`); demo and E2E fixture updates; README tweaks.
- **Lockfile:** Switched dependency lock to pnpm during this release cycle (later restored to npm in subsequent development).

## [1.1.1](https://github.com/watzak/editable.ts/compare/v1.1.0...v1.1.1) (2026-06-02)

### Changed

- Patch release with no functional source changes; version and changelog alignment only.

## [1.1.0](https://github.com/watzak/editable.ts/compare/v1.0.0...v1.1.0) (2026-06-02)

### Features

- End-to-end Playwright tests for core editor flows ([658e511](https://github.com/watzak/editable.ts/commit/658e511b48d4e2833d7b080e680044cef295e70c)).

## [1.0.0] - 2026-06-02

First stable release. The public API is considered stable; future 1.x releases will follow [SemVer](https://semver.org/).

### Added

- TypeScript-first implementation with full `.d.ts` exports and typed event payloads
- Optional `editable.ts/features` entry for highlighting, spellcheck overlays, and text diff (tree-shakeable)
- README hero section with badges, comparison table, and improved demo links
- `docs/ARCHITECTURE.md` — technical architecture deep-dive
- `docs/MIGRATION.md` — migration guide from [editable.js](https://github.com/livingdocsIO/editable.js)
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, and GitHub issue/PR templates
- Demo page SEO meta tags (title, description, Open Graph)
- Vitest test suite, Vite build pipeline, oxlint/oxfmt tooling
- npm OIDC trusted publishing workflow

### Changed

- Modernized fork of editable.js with ESM-first package exports (`lib/core.js`, `lib/features.js`)
- Core/features package export split for smaller default bundles (~2 KB gzip core entry).
- Cross-browser Selection/Range handling and event-driven block editing API

## [0.0.13] - 2026-06-02

### Changed

- Demo fixes and documentation updates (see git history; no `v0.0.13` tag in this repository)

## [0.0.12] - 2026-04-20

### Changed

- Library dependency bumps

## [0.0.11] - 2026-04-20

### Added

- Optional `editable.ts/features` entry — highlighting, spellcheck overlays, and text diff load separately from core for smaller default bundles

### Changed

- Core/features package export split for tree-shaking

## [0.0.10] - 2026-04-20

### Changed

- Package and build tooling updates

## [0.0.9] - 2026-04-19

### Added

- npm OIDC trusted publishing workflow

## [0.0.8] - 2026-04-03

### Added

- Demo analytics note and favicon

## Earlier versions

See [git history](https://github.com/watzak/editable.ts/commits/main) for changes prior to 0.0.8.

[Unreleased]: https://github.com/watzak/editable.ts/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/watzak/editable.ts/releases/tag/v1.1.2
[1.1.1]: https://github.com/watzak/editable.ts/releases/tag/v1.1.1
[1.1.0]: https://github.com/watzak/editable.ts/releases/tag/v1.1.0
[1.0.0]: https://github.com/watzak/editable.ts/releases/tag/v1.0.0
[0.0.13]: https://github.com/watzak/editable.ts/releases/tag/v0.0.13
[0.0.11]: https://github.com/watzak/editable.ts/releases/tag/v0.0.11
[0.0.10]: https://github.com/watzak/editable.ts/releases/tag/v0.0.10
[0.0.9]: https://github.com/watzak/editable.ts/releases/tag/v0.0.9
[0.0.8]: https://github.com/watzak/editable.ts/releases/tag/v0.0.8

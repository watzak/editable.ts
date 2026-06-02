# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.1.2](https://github.com/watzak/editable.ts/compare/v1.1.1...v1.1.2) (2026-06-02)

## [1.1.1](https://github.com/watzak/editable.ts/compare/v1.1.0...v1.1.1) (2026-06-02)

## [1.1.0](https://github.com/watzak/editable.ts/compare/v1.0.0...v1.1.0) (2026-06-02)

### Features

- end2end tests init ([658e511](https://github.com/watzak/editable.ts/commit/658e511b48d4e2833d7b080e680044cef295e70c))

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

## [0.0.13] - 2025-06-02

### Changed

- Demo fixes and documentation updates

## [0.0.12] - 2025

### Changed

- Library dependency bumps

## [0.0.11] - 2025

### Added

- Optional `editable.ts/features` entry — highlighting, spellcheck overlays, and text diff load separately from core for smaller default bundles

### Changed

- Core/features package export split for tree-shaking

## [0.0.10] - 2025

### Changed

- Package and build tooling updates

## [0.0.9] - 2025

### Added

- npm OIDC trusted publishing workflow

## [0.0.8] - 2025

### Added

- Demo analytics note and favicon

## Earlier versions

See [git history](https://github.com/watzak/editable.ts/commits/main) for changes prior to 0.0.8.

[Unreleased]: https://github.com/watzak/editable.ts/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/watzak/editable.ts/releases/tag/v1.0.0
[0.0.13]: https://github.com/watzak/editable.ts/releases/tag/v0.0.13

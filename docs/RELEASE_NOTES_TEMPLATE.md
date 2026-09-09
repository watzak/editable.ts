# Release notes template — editable.ts

> Draft for maintainer review before creating a GitHub Release. Replace `<version>` with the tag you are publishing (e.g. `1.2.2`).

## Summary

Brief overview of the release focus (one paragraph).

## Security

- _(List security fixes, or remove section if none.)_

## Features

- _(New user-facing capabilities.)_

## Quality & tooling

- _(CI, tests, build, or developer-experience changes.)_

## Fixes

- _(Bug fixes.)_

## Breaking changes

None intended for current semver line — or list them explicitly.

## Upgrade notes

- Import paths: `editable.ts` (core) and `editable.ts/features` (optional).
- _(Any migration or re-test guidance.)_

## Known limitations

- Structural undo/redo via native browser undo is engine-dependent (see README browser matrix).

## Files in npm package

`lib/`, `dist/editable.umd.cjs`, `README.md`, `LICENSE` — confirm with `npm run pack:check` before publish.

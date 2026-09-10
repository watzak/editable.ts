# Publishing editable.ts to npm

This repository publishes with [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). No long-lived `NPM_TOKEN` secret is required when Trusted Publishing is configured on npmjs.com.

## One-time npm setup (maintainer)

1. Open [npm package settings → Trusted Publisher](https://www.npmjs.com/package/editable.ts/access) (or create the package first).
2. Add a **GitHub Actions** trusted publisher:
   - **Organization or user:** `watzak`
   - **Repository:** `editable.ts`
   - **Workflow filename:** `publish.yml`
   - **Environment:** _(leave empty unless you add a GitHub Environment)_
3. Confirm the package access is **public** (`publishConfig.access` is already `"public"`).

Trusted Publishing binds publishes to GitHub’s OIDC token for this workflow only. Rotate or revoke access from npm if the repository or workflow name changes.

## Version sources (read before releasing)

Four separate channels track version state. They can diverge — always verify all four before assuming a release is complete.

| Channel                      | What it means                                                                                              | How to check                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **`package.json` on `main`** | Version prepared in source; reflects the latest `npm run release` commit on `main`.                        | `node -p "require('./package.json').version"`                                       |
| **Git tag (`v*`)**           | Annotated tag created locally by `npm run release`; **not on GitHub until pushed** with `--follow-tags`.   | `git tag -l 'v*' --sort=-version:refname \| head` and `git ls-remote --tags origin` |
| **GitHub Release**           | Published release on GitHub; **this is the only trigger** for the OIDC npm publish workflow.               | [Releases](https://github.com/watzak/editable.ts/releases)                          |
| **npm registry**             | Package consumers install; published only when the GitHub Release workflow succeeds (or manually — avoid). | `npm view editable.ts version`                                                      |

### Current divergence (2026-09-09, verify before acting)

As of commit `07aa057` (`chore(release): 1.2.1`):

| Channel                           | Value                             | Notes                                                                                                                                               |
| --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                    | **1.2.1**                         | Matches latest release commit on `main`.                                                                                                            |
| Git tags (remote)                 | **v1.2.1**, **v1.2.0**, v1.1.2, … | Tags were pushed; v1.2.0 was never published to npm.                                                                                                |
| GitHub Release (latest published) | **v1.1.2**                        | No published GitHub Release for v1.2.0 or v1.2.1 yet.                                                                                               |
| npm (latest)                      | **1.2.1**                         | Present on npm; **1.2.0 was skipped**. No `publish.yml` workflow run recorded for 1.2.x — likely a manual publish outside the documented OIDC path. |

**Maintainer decisions still required:**

1. Create **Published** GitHub Releases for `v1.2.0` and/or `v1.2.1` if you want release notes and provenance aligned with tags — or accept that 1.2.0 was tag-only and document why npm skipped it.
2. Do **not** run `npm publish` locally when OIDC Trusted Publishing is configured; use the GitHub Release workflow instead.
3. After any doc/format fix on `main`, ensure CI is green before the next release gate.

Re-check this table after each release; remove or update the snapshot once all channels match.

## Release process

Publishing is **not** automatic on every tag push. The only publish trigger is a **published GitHub Release** (see `.github/workflows/publish.yml`).

### Prerequisites

- All changes are on `main` and CI is green (quality job + E2E matrix on Chromium, Firefox, WebKit).
- Version bump and changelog entry are prepared locally (this repo uses [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) via `npm run release` when you choose to release).

### Steps

1. **Run local verification** (optional but recommended):

   ```bash
   npm ci
   npm run verify
   npm run test:e2e   # requires Playwright browsers locally
   ```

2. **Bump version and tag** (when you explicitly want to release):

   ```bash
   npm run release
   ```

   This runs [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version), which:
   - bumps `package.json` and `package-lock.json`
   - prepends a section to `CHANGELOG.md`
   - creates a **local** Git commit (e.g. `chore(release): 1.2.2`)
   - creates a **local** annotated tag (e.g. `v1.2.2`, prefix `v` by default)

   It does **not** push, publish to npm, or create a GitHub Release. Tags remain on your machine until you push them. Verify with `git tag -l 'v*' --sort=-version:refname` and `git log -1`.

   Optional dry-run (no files changed): `npx commit-and-tag-version --dry-run`

3. **Push commit and tag:**

   ```bash
   git push origin main --follow-tags
   ```

   Without `--follow-tags`, the release commit reaches GitHub but the version tag does not — CI and consumers would see the new `package.json` version without a matching tag.

4. **Create a GitHub Release** from the new tag (`Releases → Draft a new release → Choose tag`). Set status to **Published** (not draft).  
   Publishing the release starts the `Publish to npm` workflow.

5. **Workflow actions:**
   - `npm ci`
   - `npm run verify` (typecheck, coverage, lint, format, knip, build, package validation, pack dry-run, size limit)
   - `npm publish --provenance --access public`

6. **Confirm on npm:** [editable.ts on npm](https://www.npmjs.com/package/editable.ts)

## What `npm run verify` covers

| Step                                    | Script             |
| --------------------------------------- | ------------------ |
| Typecheck (source + tests)              | `typecheck`        |
| Unit tests + coverage thresholds        | `test:coverage`    |
| Lint                                    | `lint`             |
| Format                                  | `format:check`     |
| Unused deps/files                       | `knip`             |
| Build + consumer types + publint + attw | `validate:package` |
| Tarball dry-run                         | `pack:check`       |
| UMD bundle size                         | `size`             |

E2E (`test:e2e`) runs in CI separately because it installs browser engines. **Both CI and a successful E2E run should be green before you publish a release.**

## Provenance

`npm publish --provenance` attaches build provenance to the package on npm, linked to this repository and the GitHub Actions run. This requires Trusted Publishing (OIDC) and is enabled in `publish.yml`.

## GitHub Pages demo

The live demo at [watzak.github.io/editable.ts/examples/](https://watzak.github.io/editable.ts/examples/) is built by `.github/workflows/pages.yml` on pushes to `main`. Demo assets under `examples/dist/` are **generated at build time** and are not committed to git.

## Troubleshooting

| Issue                           | Action                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Publish workflow does not start | Ensure the GitHub Release is **Published**, not draft; check workflow filename matches npm trusted publisher config.           |
| `403` / provenance errors       | Re-check Trusted Publisher settings on npm; confirm `id-token: write` permission in workflow.                                  |
| Verify fails on size            | Run `npm run build && npm run size`; adjust bundle or size-limit config intentionally if the UMD grew.                         |
| `publint` / `spawn pnpm ENOENT` | This repo uses **npm** only (`npm ci` in CI). Keep `publint --pack npm` in `validate:package`; do not commit `pnpm-lock.yaml`. |
| E2E red in CI                   | Fix cross-browser tests before publishing; do not skip the E2E job for releases.                                               |

## Legacy token publishing (deprecated here)

Older setups used an `NPM_TOKEN` repository secret. **This project no longer documents token-based publish.** Use Trusted Publishing instead. If you must fall back temporarily, add `NODE_AUTH_TOKEN` to the publish job — but prefer fixing OIDC configuration.

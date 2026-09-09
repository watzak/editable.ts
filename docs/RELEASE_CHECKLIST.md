# Release checklist — editable.ts

Use this checklist before publishing. **Do not publish or push tags until you explicitly approve.**

See [publish.md](./publish.md) for how `package.json`, Git tags, GitHub Releases, and npm relate.

## Pre-release (development)

- [ ] All intended changes merged to `main`
- [ ] `npm ci` completes cleanly
- [ ] `npm run verify` passes locally
- [ ] `npm run test:e2e` passes locally (install browsers: `npx playwright install chromium firefox webkit`)
- [ ] GitHub Actions CI green on `main` (quality + E2E matrix)
- [ ] `npm audit --omit=dev` reports **0 vulnerabilities**
- [ ] Dev audit documented if any remain (target: **0** after Prompt 8 updates)
- [ ] CHANGELOG reviewed: new entries under `[Unreleased]` or the upcoming version section are accurate
- [ ] `docs/publish.md` matches workflow (`publish.yml`, OIDC, no `NPM_TOKEN`)
- [ ] npm Trusted Publisher configured for `watzak/editable.ts` → workflow `publish.yml`

## Version bump (manual gate)

- [ ] Decide the next semver version (major / minor / patch)
- [ ] Run `npm run release` (commit-and-tag-version) **only when ready**
- [ ] Review generated commit: `package.json`, `CHANGELOG.md`, lockfile if touched
- [ ] Confirm the new local Git tag (e.g. `v1.2.2`) — **tags are local until pushed**
- [ ] Confirm version **not** bumped prematurely in this prep branch

## Publish gate (maintainer only)

- [ ] Push `main` and tags: `git push origin main --follow-tags`
- [ ] Create a **Published** GitHub Release for the new tag (not draft)
- [ ] Confirm `Publish to npm` workflow started and completed
- [ ] Verify package on npm: version, provenance badge, exports, README, LICENSE
- [ ] Confirm GitHub Pages demo still deploys (optional smoke test)

## Post-release

- [ ] Close release milestone / tracking issues
- [ ] Announce if desired (no automation required)

## Rollback (if needed)

- [ ] Deprecate bad version on npm: `npm deprecate editable.ts@<version> "reason"`
- [ ] Fix forward on `main`, tag a new patch when ready — do not republish the same version

## Manual commands reference

```bash
# Local full verify (no E2E)
npm ci && npm run verify

# Local E2E (all browsers)
npx playwright install chromium firefox webkit
npm run test:e2e

# Audit
npm audit
npm audit --omit=dev

# Inspect tarball before publish
npm run pack:check

# Version + tag (when approved) — creates LOCAL commit + tag only
npm run release
git push origin main --follow-tags
# Then: GitHub → Releases → Publish release for the new tag
```

**Publishing to npm is triggered only by a Published GitHub Release**, not by pushing a tag alone and not by running `npm run release` locally.

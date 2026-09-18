# Integration artifact (kamod-edit / workspace consumers)

Reproducible **local npm pack** with git commit and SHA256 — **not** an npm publish.

## Generate

```bash
npm run integration:artifact
```

Outputs:

| File                                                         | Purpose                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `integration-artifacts/editable.ts-<version>+<shortSha>.tgz` | Installable tarball                                   |
| `integration-artifacts/MANIFEST.json`                        | Version, `gitHead`, `sha256`, peer ranges, open gates |
| `integration-artifacts/*.sha256`                             | Checksum file for CI                                  |

Verify:

```bash
sha256sum -c integration-artifacts/*.sha256
```

## Consume in kamod-edit

See [integration/kamod-edit-consumer/README.md](../integration/kamod-edit-consumer/README.md):

```bash
node scripts/create-integration-artifact.mjs
cd integration/kamod-edit-consumer
node install-from-manifest.mjs
node verify-imports.mjs
```

Pin `editable.ts` to the **`sha256`** in `MANIFEST.json` for audit trails.

## Automated checks

- `npm run validate:packed-consumer` — core without `yjs`, `./yjs` with peers, bundle byte metrics
- `npm run validate:beta-consumers` — core-only, yjs-peer, vite bundler fixtures

## Readiness

**Experimental** while P0 gates in [YJS_P0_BASELINE.md](./YJS_P0_BASELINE.md) remain open. Recommended pre-release version is recorded in `MANIFEST.json` (`recommendedNextVersion`) — bump in git only when publishing.

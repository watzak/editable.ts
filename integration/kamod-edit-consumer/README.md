# kamod-edit workspace consumer (local)

Use this fixture to pin **exactly** the tarball recorded in `integration-artifacts/MANIFEST.json`.

## Steps

1. From repo root: `node scripts/create-integration-artifact.mjs`
2. Verify SHA256: `sha256sum -c integration-artifacts/*.sha256`
3. In kamod-edit (or this fixture):

```bash
cd integration/kamod-edit-consumer
npm install
node verify-imports.mjs
```

## Expected

- `editable.ts` resolves from `file:../../integration-artifacts/editable.ts-*.tgz`
- Core import works without `yjs` in `node_modules`
- `./yjs` import works after adding peers (`yjs`, `y-protocols`)

This directory is **not** published to npm. It documents how kamod-edit should consume the audited artifact.

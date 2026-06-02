# Contributing to editable.ts

Thank you for your interest in contributing!

## Development setup

```bash
git clone https://github.com/watzak/editable.ts.git
cd editable.ts
npm install
```

Requirements: Node.js >= 22, npm >= 11 (see `.nvmrc`).

## Commands

```bash
npm run dev          # Demo app (Vite dev server)
npm test             # Vitest + lint + format check
npm run test:watch   # Vitest in watch mode
npm run test:coverage
npm run test:e2e     # Playwright browser tests (examples/e2e-editor-flows.html)
npm run lint         # oxlint
npm run fmt          # oxfmt (auto-format)
npm run build        # TypeScript → lib/, bundle → dist/, demo → examples/dist/
npm run capture:readme  # Regenerate README demo GIF (needs: npx playwright install chromium)
```

## Pull request guidelines

1. **Focus** — One logical change per PR (feature, fix, or docs).
2. **Tests** — Add or update Vitest specs in `spec/` for behavior changes.
3. **Lint/format** — `npm test` runs lint and format checks automatically.
4. **Docs** — Update README or `docs/` when changing public API or exports.
5. **No drive-by refactors** — Keep diffs minimal and scoped.

## Code style

- TypeScript strict mode; match existing module layout under `src/`
- Use existing patterns (`eventable`, `dispatcher`, typed events in `event-types.ts`)
- Prefer native DOM utilities over new dependencies

## Reporting issues

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) and include browser, reproduction steps, and expected behavior.

For migration questions from editable.js, see [docs/MIGRATION.md](docs/MIGRATION.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

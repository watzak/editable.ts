# Manual IME acceptance (not automated)

Playwright and Vitest **simulate** `composition*` events. That is sufficient for regression of the JS pipeline, **not** for OS input method certification.

## Automated coverage (does not replace this doc)

- Unit/e2e composition tests in `spec/` and `e2e/`
- Three-browser matrix: Chromium, Firefox, WebKit (Linux CI / local)

## Manual sign-off required

Execute [YJS_IME_TEST_PLAN.md](./YJS_IME_TEST_PLAN.md) on real OS IME:

| Platform                               | Status in CI                                  |
| -------------------------------------- | --------------------------------------------- |
| Linux + Playwright composition         | Automated only                                |
| **macOS** (Japanese, emoji, dictation) | **Manual** — not marked pass without sign-off |
| **Windows** (Pinyin, touch keyboard)   | **Manual**                                    |

Do **not** infer macOS/Windows IME approval from green CI. Record results in the sign-off template at the bottom of `YJS_IME_TEST_PLAN.md`.

## Release gate

`./yjs` remains **experimental** until manual IME sign-off **and** P0 gates in [YJS_P0_BASELINE.md](./YJS_P0_BASELINE.md) are closed or accepted.

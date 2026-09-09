# Browser operation capture fallbacks

Operation batches are built from pre-mutation snapshots plus confirmed post-mutation text. Capability detection uses feature probes only — **no user-agent sniffing**.

## Primary path: `beforeinput`

When `InputEvent` and `beforeinput` are available (probed via `'onbeforeinput' in element` and `'inputType' in InputEvent.prototype`):

1. **`beforeinput`** — capture block operation text and selection; optionally predict ops from `inputType`, `data`, and `getTargetRanges()`.
2. Browser applies the mutation (text types are not `preventDefault()`'d).
3. **`input`** — confirm with a minimal LCS diff against the stored before-state; emit one `EditableOperationBatch` and one `change`.

Supported text `inputType`s:

| inputType               | Operation                                 |
| ----------------------- | ----------------------------------------- |
| `insertText`            | `insertText` / `replaceText`              |
| `insertReplacementText` | `replaceText` (autocorrect, autocomplete) |
| `insertLineBreak`       | `insertText` with `\n`                    |
| `deleteContentBackward` | `deleteText`                              |
| `deleteContentForward`  | `deleteText`                              |
| `deleteByCut`           | `deleteText`                              |

## `getTargetRanges()` fallback

When `getTargetRanges()` returns a non-empty list, mutation span offsets are taken from the first range mapped into the block host (UTF-16).

When ranges are missing or empty, selection snapshots from the pre-mutation capture are used:

- Inserts use the collapsed caret or selected span.
- Backspace at caret deletes the preceding code unit.
- Delete at caret deletes the following code unit.
- Cut uses the current non-collapsed selection span.

If prediction does not match the post-mutation diff, the diff wins.

## No `beforeinput` fallback

When `beforeinput` is unavailable:

- Confirmed text state is tracked after each successful operation commit and on focus.
- The **`input`** handler diffs against the last confirmed state.
- Structural edits still use the **`keydown`** fallback (Enter, Backspace at block boundaries, formatting).

## Composition (IME)

- **`compositionstart`** — snapshot text and selection; suppress intermediate operation batches.
- **`compositionupdate` / `input` while composing** — ignored for operations.
- **`compositionend`** — one batch from LCS diff between start snapshot and final text (`source: 'composition'`). Empty or cancelled sessions emit nothing.

## Paste

1. **`preparePaste`** — sanitize and split clipboard data without writing the host DOM.
2. **`beforeOperation`** — text-level batch for the first block (`source: 'paste'`).
3. **`beforeCommand`** / **`command`** — structural `paste` command with block HTML payloads.
4. **`applyPaste`** — DOM mutation only when `defaultBehavior: true` and handlers did not cancel.

With `defaultBehavior: false`, no DOM write occurs before the paste command; external adapters apply the command payload.

## Smart quotes

Smart quote resolution runs synchronously during the **`input`** commit (no delayed DOM writes). Replacements are appended to the same operation batch as the triggering insert, or applied as an additional `replaceText` op before the batch is emitted. Echo `input` events are suppressed while the DOM correction runs.

## Structural vs text operations

Block splits, merges, inserts, and multi-block paste remain **commands** (legacy events + `change`). Text-level ops inside a single block are **operation batches** paired with `InputChangeCommand` for plain typing, composition commits, and first-block paste text.

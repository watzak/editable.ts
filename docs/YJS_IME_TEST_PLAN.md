# Manual IME test plan — Yjs beta

Automated tests simulate `compositionstart` / `compositionupdate` / `compositionend`. Real input method editors require manual QA before promoting `./yjs` from beta to stable.

## Prerequisites

- Two browser windows (or two machines) on the same Yjs room
- One plain-text binding demo (`y-websocket-demo` with `data-plaintext="true"`) and one rich demo (`data-plaintext="false"`)
- Network throttling tool optional (browser DevTools)

## macOS

| #   | Input source                  | Steps                                                   | Pass criteria                                                  |
| --- | ----------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| M1  | ABC → 日本語 (Japanese)       | Focus host, type romaji through IME composition, commit | Y.Text matches committed glyphs; remote peer converges         |
| M2  | Emoji picker (Ctrl+Cmd+Space) | Insert emoji mid-word                                   | UTF-16 offsets stable; presence/annotations stay aligned       |
| M3  | Dictation (if enabled)        | Dictate a short phrase                                  | No spurious split/merge; undo removes one logical action       |
| M4  | Compose + Enter               | Complete IME word, press Enter at end                   | Structural adapter (if enabled) splits once, not per keystroke |
| M5  | Compose + blur                | Commit composition, blur host                           | Presence clears when configured; no orphan DOM                 |

## Windows

| #   | Input source               | Steps                                      | Pass criteria                                |
| --- | -------------------------- | ------------------------------------------ | -------------------------------------------- |
| W1  | Microsoft Pinyin           | Compose pinyin phrase, select candidate    | CRDT and peer converge; caret visible        |
| W2  | Win+. emoji                | Insert emoji inside bold range (rich host) | Formatting preserved in Y.Text attributes    |
| W3  | Dead keys (e.g. ^ + vowel) | Enter combining marks                      | Offsets remain UTF-16 consistent             |
| W4  | Compose during offline     | Disconnect provider, compose, reconnect    | Merged state matches single canonical Y.Text |
| W5  | Touch keyboard (tablet)    | Type with on-screen keyboard               | No duplicate inserts after sync              |

## Regression triggers

Repeat M1/W1 after any change to:

- `operation-selection.ts` / UTF-16 boundaries
- Incremental remote apply (`remote-sync-state.ts`)
- Initial sync / `activate()` timing
- Structural split/merge adapters

## Sign-off template

```
Date:
Tester:
OS + browser:
editable.ts version:
Provider:
Result: PASS / FAIL
Notes:
```

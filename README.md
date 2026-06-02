# editable.ts

[![npm version](https://img.shields.io/npm/v/editable.ts.svg)](https://www.npmjs.com/package/editable.ts)
[![CI](https://github.com/watzak/editable.ts/actions/workflows/ci.yml/badge.svg)](https://github.com/watzak/editable.ts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![bundle size](https://img.shields.io/badge/gzip%20core-~2%20KB-brightgreen)](#bundle-size)

**A lightweight, typed API for block-level `contenteditable` editing.**

editable.ts wraps the browser's native `contenteditable` with cross-browser Selection/Range handling, a typed event system, and optional highlighting — without imposing a document model. Forked from [editable.js](https://github.com/livingdocsIO/editable.js) and modernized with TypeScript, Vitest, and Vite.

**[Live demo](https://watzak.github.io/editable.ts/examples/)** · **[npm](https://www.npmjs.com/package/editable.ts)** · **[Migration from editable.js](docs/MIGRATION.md)** · **[Architecture](docs/ARCHITECTURE.md)**

> **Privacy:** the demo page includes a Matomo image tracker (`matomo.kamod.ch`) for anonymous usage statistics. The npm library contains no analytics.

## Why editable.ts?

|                  | editable.ts                       | TipTap / Lexical / ProseMirror | Raw `contenteditable` |
| ---------------- | --------------------------------- | ------------------------------ | --------------------- |
| Bundle (typical) | **~2 KB gzip** (core)             | 50 KB – 200 KB+                | 0 KB                  |
| Document model   | **Your HTML/DOM**                 | Custom schema                  | Browser DOM           |
| Learning curve   | **Low** — events + DOM            | Medium – high                  | High (browser quirks) |
| Best for         | CMS blocks, inline edit, comments | Full rich-text apps            | Prototypes only       |

**Choose editable.ts when** you want lean block editing (paragraphs, headings, blockquotes), keep control of your HTML, and need selection/cursor APIs without shipping a full editor framework.

**Choose something else when** you need collaborative CRDT editing, complex schemas, or a plug-and-play toolbar editor out of the box.

## Features

- **Cross-browser compatibility** — abstracts Selection and Range API differences
- **Event-driven architecture** — typed pub/sub for focus, selection, split, merge, paste, and more
- **Block-based editing** — optimized for `p`, `h1`–`h6`, `blockquote`, and other phrasing-content blocks
- **Selection & cursor APIs** — coordinates, insertion, wrapping, tag detection
- **Optional features entry** — highlighting, spellcheck overlays, text diff (tree-shakeable)
- **Sensible defaults** — split, merge, and insert blocks with `defaultBehavior: true`
- **TypeScript-first** — full `.d.ts` exports, typed event payloads

## Installation

```shell
npm install editable.ts
```

```typescript
import { Editable } from 'editable.ts'
```

Or use the prebuilt UMD bundle: `dist/editable.umd.cjs`.

### Package exports: core vs. features

| Import                 | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `editable.ts`          | Lean entry: `Editable`, events, cursor, content — **without** highlighting/text-diff code |
| `editable.ts/features` | Same class plus `highlight`, `setupHighlighting`, `setupSpellcheck`, `setupTextDiff`, …   |

Types such as `HighlightOptions` and `TextDiffOptions` are re-exported from the core entry for convenience:

```typescript
import { Editable, type HighlightOptions } from 'editable.ts'

// Core only (smaller bundle)
import { Editable } from 'editable.ts'

// With highlighting / spellcheck overlays / text diff
import { Editable } from 'editable.ts/features'
```

### Bundle size

| Artifact                 | Size (approx.)       | Notes                                                      |
| ------------------------ | -------------------- | ---------------------------------------------------------- |
| `lib/core.js` (ESM)      | ~8 KB (~2 KB gzip)   | Core entry; bundlers tree-shake further modules            |
| `lib/features.js`        | ~3 KB (~1 KB gzip)   | Optional entry; pulls in highlight/text-diff code          |
| `dist/editable.umd.cjs`  | ~58 KB (~17 KB gzip) | Single file for `<script>` / legacy bundlers               |
| `lib/` (total, unpacked) | ~1 MB                | All `.js` + `.d.ts`; bundlers include only what you import |

Verify locally after `npm run build`:

```shell
ls -la dist/ lib/core.js
gzip -c dist/editable.umd.cjs | wc -c
```

## Quick start

```typescript
import { Editable } from 'editable.ts'

const editable = new Editable({
  defaultBehavior: true,
  browserSpellcheck: true,
  smartQuotes: true,
  quotes: ['“', '”'],
  singleQuotes: ['‘', '’']
})

const element = document.querySelector('.my-editable')
editable.add(element)
```

## Examples

### Selection toolbar (vanilla DOM)

Show a floating toolbar when the user selects text:

```typescript
const toolbar = document.getElementById('toolbar')!

editable.on('selection', (_element, selection) => {
  if (!selection) {
    toolbar.hidden = true
    return
  }

  const coords = selection.getCoordinates()
  const toolbarHeight = toolbar.offsetHeight
  const toolbarWidth = toolbar.offsetWidth

  toolbar.style.top = `${coords.top - toolbarHeight}px`
  toolbar.style.left = `${coords.left + coords.width / 2 - toolbarWidth / 2}px`
  toolbar.hidden = false
})
```

### Cursor manipulation

```typescript
const cursor = editable.getSelection()

if (cursor?.isCursor) {
  if (cursor.isAtBeginning()) {
    console.log('Cursor is at the beginning')
  }

  cursor.insert('Hello, World!')

  const newCursor = editable.createCursor(element, 'end')
  newCursor?.insertAfter('<strong>Bold text</strong>')
}
```

### Content extraction

```typescript
const content = editable.getContent(element)

const selection = editable.getSelection(element)
if (selection?.isSelection) {
  console.log(selection.text(), selection.html())
}
```

### Event handling

```typescript
editable.on('focus', (element) => console.log('focused', element))
editable.on('change', (element) => console.log('changed', element))

editable.on('split', (element, before, after, cursor) => {
  console.log('Block split:', { before, after, cursor })
})

editable.on('merge', (element, direction, cursor) => {
  console.log('Blocks merged:', { direction, cursor })
})
```

### Highlighting

Import the features entry so these methods exist on `Editable`:

```typescript
import { Editable } from 'editable.ts/features'

const editable = new Editable()
editable.add(element)

editable.highlight({
  editableHost: element,
  text: 'search term',
  highlightId: 'search-1',
  type: 'search'
})

editable.setupSpellcheck({
  throttle: 300,
  spellcheckService: (text, callback) => callback(checkSpelling(text))
})

editable.setupTextDiff({ checkOnInit: true, throttle: 0 })

editable.removeHighlight({ editableHost: element, highlightId: 'search-1' })
```

### Custom behavior

```typescript
const editable = new Editable({ defaultBehavior: false })

editable.on('insert', (element, direction, cursor) => {
  insertCustomBlock(element, direction, cursor)
})
```

## Events

### Core

| Event       | When                            |
| ----------- | ------------------------------- |
| `focus`     | Editable element receives focus |
| `blur`      | Editable element loses focus    |
| `selection` | Text is selected                |
| `cursor`    | Cursor position changes         |
| `change`    | Content changed                 |

### Content modification

| Event     | When                                                 |
| --------- | ---------------------------------------------------- |
| `insert`  | Enter at beginning or end of block                   |
| `split`   | Enter in the middle of a block                       |
| `merge`   | Backspace at start or Delete at end of block         |
| `newline` | Shift+Enter                                          |
| `switch`  | Arrow key at block boundary (move to adjacent block) |

### Clipboard & highlighting

| Event               | When                          |
| ------------------- | ----------------------------- |
| `clipboard`         | Copy, cut, or paste           |
| `paste`             | Paste operation               |
| `spellcheckUpdated` | Spellcheck highlights updated |

## API reference

| Module                                 | Description                                          |
| -------------------------------------- | ---------------------------------------------------- |
| [core.ts](src/core.ts)                 | Main `Editable` class                                |
| [features.ts](src/features.ts)         | Optional highlighting / spellcheck / text-diff entry |
| [cursor.ts](src/cursor.ts)             | Cursor API                                           |
| [selection.ts](src/selection.ts)       | Selection API                                        |
| [event-types.ts](src/event-types.ts)   | Typed event payloads                                 |
| [plugin-types.ts](src/plugin-types.ts) | Highlight and text-diff types                        |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a technical deep-dive.

### Config types

```typescript
interface EditableConfig {
  window?: Window
  defaultBehavior?: boolean
  mouseMoveSelectionChanges?: boolean
  browserSpellcheck?: boolean
  smartQuotes?: boolean
  quotes?: string[]
  singleQuotes?: string[]
}
```

## Development

```bash
npm install
npm start          # demo (Vite dev server)
npm test           # Vitest + lint + format
npm run build      # lib/ + dist/ + demo bundle
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull request guidelines.

**Requirements:** Node.js >= 22, npm >= 11

## Related projects

- [editable.js](https://github.com/livingdocsIO/editable.js) — original JavaScript library (see [migration guide](docs/MIGRATION.md))
- [livingdocs.io](https://livingdocs.io/) — online document editing platform

## License

[MIT License](LICENSE)

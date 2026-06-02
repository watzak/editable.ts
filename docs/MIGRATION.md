# Migration from editable.js

editable.ts is a TypeScript rewrite and modernization of [editable.js](https://github.com/livingdocsIO/editable.js). The public API is largely compatible, but imports, tooling, and a few optional features differ.

## Quick comparison

|                          | editable.js             | editable.ts                         |
| ------------------------ | ----------------------- | ----------------------------------- |
| Language                 | JavaScript              | TypeScript (ships `.d.ts`)          |
| Module format            | UMD / legacy bundlers   | ESM (`lib/`) + UMD (`dist/`)        |
| Tests                    | Karma                   | Vitest                              |
| Build                    | Browserify / legacy     | TypeScript + Vite                   |
| Highlighting / text diff | Included in main bundle | Optional via `editable.ts/features` |

## Installation

```shell
# Before
npm install editable.js

# After
npm install editable.ts
```

## Imports

```javascript
// editable.js (UMD / global)
var editable = new Editable()
```

```typescript
// editable.ts — core only (smaller bundle)
import { Editable } from 'editable.ts'

// editable.ts — with highlighting, spellcheck overlays, text diff
import { Editable } from 'editable.ts/features'
```

If you used highlighting, spellcheck overlays, or text-diff markers in editable.js, switch to the `editable.ts/features` entry. Type-only imports such as `HighlightOptions` remain available from the core entry:

```typescript
import { Editable, type HighlightOptions } from 'editable.ts'
import { Editable } from 'editable.ts/features' // registers feature methods
```

## API compatibility

These APIs are intentionally kept compatible:

- `new Editable(config)`
- `editable.add(element | selector)` / `remove()` / `enable()` / `disable()`
- `editable.on(event, handler)` / `off()`
- `editable.getSelection()` / `getContent()`
- `editable.createCursor(element, position)`
- Events: `focus`, `blur`, `selection`, `cursor`, `change`, `insert`, `split`, `merge`, `newline`, `switch`, `clipboard`, `paste`

### Typed events

Event handlers are typed via `EditableEventMap`. Your IDE will autocomplete event names and payload types:

```typescript
editable.on('split', (element, before, after, cursor) => {
  // fully typed
})
```

### Configuration

Most config options are unchanged:

```typescript
const editable = new Editable({
  defaultBehavior: true,
  browserSpellcheck: true,
  smartQuotes: true,
  quotes: ['“', '”'],
  singleQuotes: ['‘', '’']
})
```

## Breaking changes to watch for

1. **ESM-first** — Use `import` or the UMD build at `editable.ts/dist/editable.umd.cjs`. There is no global `window.Editable` in the ESM build.

2. **Feature entry split** — Highlighting and text-diff code is not loaded unless you import `editable.ts/features`.

3. **Node.js for development** — Building and testing requires Node.js >= 22 (see `package.json` engines). Browser runtime has no Node dependency.

4. **Class names / markers** — Internal CSS classes and highlight markers may differ slightly. Run your integration tests after migrating.

5. **jQuery not required** — editable.js examples sometimes used jQuery for toolbars. editable.ts is framework-agnostic; use native DOM or your UI library.

## Migration checklist

- [ ] Replace `editable.js` dependency with `editable.ts`
- [ ] Update imports to ESM (`import { Editable } from 'editable.ts'`)
- [ ] Add `editable.ts/features` import if you use highlighting or text diff
- [ ] Run your editor integration tests (selection, split/merge, paste)
- [ ] Verify toolbar positioning with `selection.getCoordinates()` (native DOM)
- [ ] Remove any reliance on global `Editable` unless using the UMD bundle

## Need help?

Open a [GitHub issue](https://github.com/watzak/editable.ts/issues) with the label `migration` and describe your editable.js setup.

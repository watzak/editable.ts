# editable.ts/yjs

> **Experimental API (release candidate)** — The `./yjs` subpath is optional, semver-minor until marked stable. Breaking changes may occur in 1.x while experimental. Not published in this audit — local RC only.

## Installation

```bash
npm install editable.ts
# Yjs integration (optional peers):
npm install yjs y-protocols
```

Core-only installs do **not** pull Yjs (`peerDependenciesMeta.optional`). TypeScript consumers import `./yjs` only when needed.

## Import map

| Entry                  | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `editable.ts`          | Core editor — no Yjs                                   |
| `editable.ts/features` | Optional highlighting / text-diff                      |
| `editable.ts/yjs`      | `EditableYjsBinding`, presence, undo, structural hooks |

Yjs is **external** — never bundled into core, features, or UMD (`validate:core-bundle`).

Optional Yjs adapter subpath. Import separately from core:

```typescript
import { Editable } from 'editable.ts'
import { EditableYjsBinding } from 'editable.ts/yjs'
```

`yjs` is a **peer dependency** (marked optional in `peerDependenciesMeta`) so core-only installs do not warn or pull Yjs in.

## Scope

- One `EditableYjsBinding` connects **one** block host to **one** user-supplied `Y.Text`
- After initial sync, **`Y.Text` is canonical**
- Local `EditableOperationBatch` objects from capture are applied in **one** `Y.Doc` transaction with a binding-specific origin (echo-safe)
- Foreign `Y.Text` deltas are translated to `EditableOperation`s and applied with **live** DOM patches (insert/delete/replace/attributes) — no `innerHTML` in the hot path
- Each binding keeps a **canonical pre-update snapshot** (plain text; rich text also stores normalized text runs). Incremental apply runs only when the host still matches that snapshot
- When incremental apply cannot converge, or the host drifted, **`binding.reconcile(reason?)`** rebuilds from canonical `Y.Text` (recovery only)
- **Rich-text hosts** (`data-plaintext="false"`, default): inline formats sync via Y.Text delta attributes through `InlineFormatRegistry`
- **Plain-text hosts** (`data-plaintext="true"`): character data only; attributed operations are rejected
- **Not included:** providers (you wire WebSocket/WebRTC yourself)
- **Optional:** `EditableYjsPresence` for remote cursors via user-supplied `Awareness` (`y-protocols`)

## Inline format codec

Rich text never stores HTML in the CRDT. Formats map to canonical Y.Text attributes via **`InlineFormatRegistry`** in the **core** package (`editable.ts`), not under `./yjs`. The Yjs adapter imports the same registry from the host policy so capture, apply, reconcile, and remote delta conversion stay aligned.

| Format      | Y.Text key                      | DOM                     |
| ----------- | ------------------------------- | ----------------------- |
| Bold        | `bold: true`                    | `<strong>`              |
| Italic      | `italic: true`                  | `<em>`                  |
| Underline   | `underline: true`               | `<u>`                   |
| Superscript | `superscript: true`             | `<sup>`                 |
| Subscript   | `subscript: true`               | `<sub>`                 |
| Link        | `link: { href, rel?, target? }` | `<a>` (safe attrs only) |
| Line break  | `\n` in operation text          | `<br>`                  |

Register custom codecs with `registry.register(codec)` — each codec defines a unique key, allowed DOM tags, read/sanitize/create hooks, and participates in deterministic wrapper order.

### Host policy (per block)

Configure via `editable.add(host, { … })`:

```typescript
editable.add(host, {
  plainText: false,
  allowedFormats: ['bold', 'italic', 'link'],
  allowLineBreaks: true,
  maxLength: 500, // validates and rejects ops — never silently truncates
  placeholder: 'Write a headline…' // UI only — not stored in Y.Text
})
```

- **`allowedFormats` / `deniedFormats`** — mutually exclusive; disallowed local format commands return `null` / throw on apply; remote Yjs attributes are stripped after codec sanitization
- **`formatRegistry`** — optional custom `InlineFormatRegistry` instance per host
- Unknown or unsafe remote keys/URLs never reach the DOM

- Attribute values are `JsonValue` only
- `null` removes a format (e.g. `{ link: null }`)
- URL allowlist matches paste sanitization (`http`, `https`, `mailto`, `tel`; blocks `javascript:`, `data:`, `vbscript:`, `file:` and control-char bypasses)
- `target="_blank"` enforces `rel="noopener noreferrer"`
- Custom codecs must register explicitly on `InlineFormatRegistry`

### Format operations adapter

Keyboard bold/italic toggles emit `setTextAttributes` batches via the operation capture pipeline. Programmatic helpers:

```typescript
import {
  buildToggleFormatOperation,
  buildLinkOperation,
  buildUnlinkOperation
} from 'editable.ts/yjs'
```

## Minimal example (provider-neutral)

See also `examples/yjs-rich-editor.html`.

```typescript
import * as Y from 'yjs'
import { Editable } from 'editable.ts'
import { EditableYjsBinding } from 'editable.ts/yjs'

const docA = new Y.Doc()
const docB = new Y.Doc()
const yTextA = docA.getText('shared')
const yTextB = docB.getText('shared')

const editableA = new Editable()
const editableB = new Editable()
const hostA = document.querySelector('#editor-a') as HTMLElement
const hostB = document.querySelector('#editor-b') as HTMLElement
editableA.add(hostA)
editableB.add(hostB)

const policy = {
  yEmptyHostFilled: 'copy-host-to-y',
  hostEmptyYFilled: 'copy-y-to-host',
  bothFilledDiffer: 'error'
} as const

const bindingA = new EditableYjsBinding({
  editable: editableA,
  host: hostA,
  yText: yTextA,
  initialSync: policy
})
const bindingB = new EditableYjsBinding({
  editable: editableB,
  host: hostB,
  yText: yTextB,
  initialSync: policy
})

function sync(from: Y.Doc, to: Y.Doc) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from))
}

hostA.addEventListener('input', () => sync(docA, docB))
// In production, wire your provider here — this package does not ship one.

bindingA.destroy()
bindingB.destroy()
```

## Initial sync

No scenario silently drops content. Provide an explicit `InitialSyncPolicy`:

| Scenario                  | Behavior                                |
| ------------------------- | --------------------------------------- |
| Both empty                | No-op                                   |
| Both identical            | No-op                                   |
| Y.Text empty, host filled | `yEmptyHostFilled: 'copy-host-to-y'`    |
| Host empty, Y.Text filled | `hostEmptyYFilled: 'copy-y-to-host'`    |
| Both filled, differ       | `bothFilledDiffer: 'error'` or resolver |

Rich-text initial sync copies attributed DOM runs into `Y.Text` (not plain `innerHTML`).

## Lifecycle and `destroy()`

Always tear down in order:

```typescript
presence?.destroy()
binding.destroy()
editable.unload(host)
// provider?.destroy() — your network layer
```

| Component              | `destroy()` behaviour                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `EditableYjsBinding`   | Removes `operation` + `Y.Text` listeners; destroys internal `UndoManager` only |
| External `UndoManager` | Left intact; binding removes its tracked origin                                |
| `EditableYjsPresence`  | Clears Awareness field, removes overlay, scroll/selection listeners            |
| Host removed from DOM  | Presence auto-cleans via disconnect observer                                   |

Calling `destroy()` on a binding ignores subsequent local operation batches (no echo reentrancy).

## SSR and iframes

- Bindings require a **connected** host at construction (`ownerDocument` must exist)
- Use `new Editable({ window: iframe.contentWindow })` for iframe hosts
- Presence overlays append to `host.ownerDocument.body` — not the top-level window
- No SSR path: instantiate bindings after mount in the browser

## Security and trust boundaries

| Surface               | Mitigation                                                    |
| --------------------- | ------------------------------------------------------------- |
| Link URLs in `Y.Text` | Allowlist via `sanitizeUrlAttribute` (same as paste)          |
| Awareness name/color  | Sanitized in `parsePresencePayload`                           |
| Remote HTML           | Never applied — only operation batches from delta translation |
| Presence payload      | Namespaced key; invalid positions ignored                     |
| Structural adapter    | Your code — must validate intents and reject untrusted shapes |

Treat Yjs room membership as an authentication boundary. See `docs/yjs-provider-example.md`.

## `\n` / `<br>` mapping

Operation text uses `\n` (see `OPERATION_LINE_BREAK`). DOM `<br>` maps to `\n` in the operation model. Rich-text initial sync walks DOM runs, not `innerHTML` snapshots. Normal sync applies **live operation patches** — not full `innerHTML` replacement.

## UTF-16 offsets

All selection and operation indices are **UTF-16 code units** (JavaScript string model). Surrogate pairs (emoji) count as two units. Presence and undo metadata use the same indexing via `Y.RelativePosition`.

## Ownership

- Multiple bindings may attach to the same `Y.Text` (multiple hosts mirroring one CRDT string)
- `destroy()` removes `operation` and `Y.Text` listeners and clears references
- Call `destroy()` before `editable.unload(host)`

## Remote sync: incremental vs reconcile

### Incremental path (normal)

Used when **all** of the following hold:

1. The host is not mid-composition or mid-input (`beforeinput` pending)
2. Host operation text matches the binding's canonical snapshot from the previous successful sync
3. For **attribute-only** remote deltas on rich-text hosts, plain-text agreement is sufficient and inline runs must already match `Y.Text.toDelta()` (otherwise reconcile rebuilds formatting from Y)
4. For **text-changing** deltas on rich-text hosts, plain-text agreement is sufficient (format repair runs afterward if needed)
5. `yTextDeltaToOperations(event.delta)` applies cleanly and the host reaches `Y.Text.toString()`

Behavior:

- Inserts, deletes, replacements, and attribute changes patch the DOM via `applyLiveOperationBatchToDom`
- Local selection is transformed through the remote batch; echo and operation capture are suppressed (`beginRemoteApply`)
- Rich-text formatting is repaired incrementally via `setTextAttributes` when text matches but runs diverged

Diagnostics (tests): `binding.getRemoteSyncDiagnostics()` returns `{ path: 'incremental', operationCount }`.

### Reconcile path (recovery)

`binding.reconcile(reason?)` or automatic recovery when incremental preconditions fail:

| Reason                         | When                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `remote-host-not-canonical`    | Host text or (for attribute-only deltas) runs diverged from snapshot before the remote event |
| `remote-during-composition`    | IME composition session active on the host                                                   |
| `remote-during-pending-input`  | `beforeinput` mutation pending on the host                                                   |
| `incremental-apply-incomplete` | Live apply did not reach canonical `Y.Text`                                                  |
| `remote-delta-target-mismatch` | Delta simulation disagreed with resulting `Y.Text`                                           |
| `remote-rich-attribute`        | Rich attribute delta after prior incremental text sync — full `Y.Text` DOM rebuild           |
| `remote-format-fragmented-dom` | Fragmented DOM or normalized text mismatch before attribute delta                            |
| `rich-format-recovery`         | Incremental format repair could not match `Y.Text.toDelta()`                                 |
| `post-local-batch`             | Local batch left host text out of sync with `Y.Text`                                         |

Reconcile applies canonical `Y.Text` to the host (plain replace or rich append-from-delta via `applyYTextDeltaToHostDom`). **`Y.Text` always wins** — the host is never copied back over the CRDT silently.

### Guarantees

| Concern        | Incremental                                  | Reconcile                                                    |
| -------------- | -------------------------------------------- | ------------------------------------------------------------ |
| UTF-16 offsets | Preserved via selection transform            | Restored when possible; may collapse to nearest valid offset |
| Composition    | Skipped — reconcile instead                  | Safe — full rebuild from `Y.Text`                            |
| Inline formats | Delta attributes + incremental format repair | Full mirror of `Y.Text.toDelta()`                            |
| Echo / capture | Suppressed during remote apply               | Suppressed during remote apply                               |

## Recovery

```typescript
binding.reconcile('manual recovery after provider gap')
```

Explicit recovery when operation text or rich runs diverged. Use after network gaps or debugging; automatic reconcile covers drift during remote sync.

## Awareness / remote presence (optional)

Presence is **never** written to `Y.Text` or serialized document updates. User name, color, and selection live only in Awareness under the namespaced key `editable.ts:presence:v1`.

```typescript
import { Awareness } from 'y-protocols/awareness'
import { EditableYjsPresence } from 'editable.ts/yjs'

const awareness = new Awareness(doc) // supplied by your app — no provider here

const presence = new EditableYjsPresence({
  editable,
  host,
  yText,
  awareness,
  user: { name: 'Ada', color: '#ef4444' },
  throttleMs: 50, // selection publish interval
  hideOnBlur: true, // clear local presence when host blurs
  renderCursors: true, // set false to publish only
  renderer: undefined // optional custom PresenceRenderer
})

presence.destroy()
```

Behavior:

- Local UTF-16 anchor/head offsets convert to `Y.RelativePosition` JSON relative to **this** `Y.Text`
- Remote positions resolve against the local `Y.Doc`; invalid, foreign, or deleted-type positions are ignored
- Rendering uses a **fixed overlay** (`Range.getClientRects()`), not host DOM mutation — safe inside iframes via `host.ownerDocument`
- Respects `prefers-reduced-motion` (caret blink disabled)
- Re-renders on awareness changes, `Y.Text` edits (overlay only), scroll, and resize

See `examples/yjs-presence-editor.html` for a two-client demo with manual doc + awareness sync.

## Undo / redo (optional)

`EditableYjsBinding` can integrate `Y.UndoManager` scoped to **one** `Y.Text` and **one** binding transaction origin:

```typescript
const binding = new EditableYjsBinding({
  editable,
  host,
  yText,
  initialSync: policy,
  undo: {
    captureTimeout: 500,
    onStatusChange: ({ canUndo, canRedo }) => {
      /* … */
    }
    // undoManager: externalManager // optional — never destroyed by binding
  }
})

binding.undo()
binding.redo()
binding.canUndo()
binding.canRedo()
binding.stopUndoCapturing() // paste/format/structure boundaries
```

Behavior:

- Only transactions with this binding's origin enter the local undo stack — remote CRDT edits are excluded
- Continuous typing merges within `captureTimeout`; paste, composition, format (`setTextAttributes`), and `api` batches start new stack items
- Selection before each captured edit is stored as `Y.RelativePosition` metadata (`editable.ts:undo:selection:v1`) and restored after undo/redo when still valid
- Native `historyUndo` / `historyRedo` is intercepted while undo is enabled — no competing browser undo stack
- Initial sync uses a non-tracked origin; the stack is cleared after construction
- Externally supplied `undoManager` instances are left intact on `destroy()`; internally created managers are destroyed

## Structural adapter hooks (optional)

The text binding does **not** impose a document block schema. Optional hooks confirm or reject structure intents inside a `Y.Doc` transaction:

```typescript
const binding = new EditableYjsBinding({
  editable,
  host,
  yText,
  initialSync: policy,
  structuralAdapter: {
    splitBlock(ctx, intent) {
      // mutate Y.Array / Y.Map / nested Y.Text — or reject
      return { status: 'accepted', focusHost, selection: { anchor: 0, head: 0, direction: 'none' } }
    },
    mergeBlock(ctx, intent) {
      /* … */ return { status: 'accepted', focusHost, selection }
    },
    insertBlock(ctx, intent) {
      /* … */ return { status: 'defer' }
    }, // fall back to default DOM
    pasteBlocks(ctx, intent) {
      /* … */ return { status: 'rejected', reason: '…' }
    }
  }
})
```

When a hook returns `accepted`, default DOM split/merge/insert/paste is cancelled; the adapter owns CRDT + DOM updates, focus, and selection. Returning `defer` keeps editable.ts default behavior. Returning `rejected` cancels the gesture entirely.

Helpers `splitYTextDeltaAt`, `moveYTextTailToTarget`, and `mergeYTextIntoTarget` preserve inline format attributes across splits/merges without HTML snapshots.

**Example only (not a required schema):** `examples/yjs-array-structural-adapter.ts` — `Y.Array<Y.Map>` of `{ id, body: Y.Text }` blocks.

### Binding vs host document model

| Layer                   | Responsibility                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| `EditableYjsBinding`    | One block host ↔ one `Y.Text`; text operations; optional undo + structure hooks |
| Host / `Editable`       | DOM blocks, commands (`splitBlock`, …), default behavior                        |
| Your structural adapter | Maps commands to **your** CRDT block tree; registers additional bindings        |

The binding never requires a global block model — only the optional adapter interprets structure.

## Bundle size

| Artifact                           | Raw    | Brotli (approx.) |
| ---------------------------------- | ------ | ---------------- |
| `lib/yjs/editable-yjs-binding.js`  | ~14 kB | ~3.5 kB          |
| `lib/yjs/binding-undo.js`          | ~4 kB  | ~1.5 kB          |
| `lib/yjs/editable-yjs-presence.js` | ~8 kB  | ~3 kB            |
| `lib/yjs/` total                   | ~55 kB | —                |

Core and UMD builds must not reference Yjs — enforced by `validate:core-bundle`.

## Known limitations (experimental)

- No built-in provider — wire WebSocket/WebRTC yourself
- Structural hooks are synchronous; async adapters are not supported
- Multi-block DOM projection across peers requires your adapter + block registry (see example)
- Real OS IME must be tested manually; Playwright uses simulated `composition*` events
- `reconcile()` is a diagnostic full-resync — not the hot path
- Undo is per-binding origin; shared `UndoManager` across blocks is app-defined

## Browser testing notes

| Area                        | Automation                                          | Manual               |
| --------------------------- | --------------------------------------------------- | -------------------- |
| `beforeinput` insert/delete | Playwright Chromium/Firefox/WebKit                  | —                    |
| Composition                 | Simulated `compositionstart/end` in unit tests      | Real OS IME required |
| Undo/redo                   | Binding API + `historyUndo` intercept               | —                    |
| Offline/reconnect           | Demo + e2e via manual `Y.applyUpdate`               | —                    |
| 1000-op convergence         | `spec/yjs-convergence-fuzz.spec.ts` seed `20260909` | —                    |

## Related

- DOM apply adapter: `docs/apply-operations.md`
- Operation DTOs: `docs/adr/0001-commands-and-operations.md`
- Provider sketch: `docs/yjs-provider-example.md`
- RC readiness: `docs/RELEASE_READINESS_YJS_RC.md`
- Live demo: `examples/yjs-rich-editor.html`
- Presence demo: `examples/yjs-presence-editor.html`
- Full RC demo: `examples/yjs-collab-demo.html`

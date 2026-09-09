# editable.ts/yjs

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
- Foreign `Y.Text` deltas are translated to operations and applied with **live** DOM patches
- When a delta batch does not fully converge, a **diagnostic diff repair** runs (`diffToOperations` from the last synced host text to current `Y.Text`) — not the normal path
- Explicit full replace recovery: `binding.reconcile(reason?)`
- **Rich-text hosts** (`data-plaintext="false"`, default): inline formats sync via Y.Text delta attributes through `InlineFormatRegistry`
- **Plain-text hosts** (`data-plaintext="true"`): character data only; attributed operations are rejected
- **Not included:** providers, awareness

## Inline format codec

Rich text never stores HTML in the CRDT. Formats map to canonical Y.Text attributes:

| Format     | Y.Text key                      | DOM                     |
| ---------- | ------------------------------- | ----------------------- |
| Bold       | `bold: true`                    | `<strong>`              |
| Italic     | `italic: true`                  | `<em>`                  |
| Underline  | `underline: true`               | `<u>`                   |
| Link       | `link: { href, rel?, target? }` | `<a>` (safe attrs only) |
| Line break | `\n` in operation text          | `<br>`                  |

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

## Ownership

- Multiple bindings may attach to the same `Y.Text` (multiple hosts mirroring one CRDT string)
- `destroy()` removes `operation` and `Y.Text` listeners and clears references
- Call `destroy()` before `editable.unload(host)`

## Recovery

```typescript
binding.reconcile('manual recovery after provider gap')
```

Applies canonical `Y.Text` to the host when operation text diverged. Use after network gaps or debugging; not part of the hot sync path.

## Bundle size

| Artifact                          | Raw    | Brotli (approx.) |
| --------------------------------- | ------ | ---------------- |
| `lib/yjs/editable-yjs-binding.js` | ~12 kB | ~2.5 kB          |
| `lib/yjs/` total                  | ~35 kB | —                |

Core and UMD builds must not reference Yjs — enforced by `validate:core-bundle`.

## Related

- DOM apply adapter: `docs/apply-operations.md`
- Operation DTOs: `docs/adr/0001-commands-and-operations.md`
- Live demo: `examples/yjs-rich-editor.html`

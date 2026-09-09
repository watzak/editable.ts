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
- **Not included:** providers, awareness, rich-text attributes

## Minimal example (provider-neutral)

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

| Artifact                          | Raw   | Brotli (approx.) |
| --------------------------------- | ----- | ---------------- |
| `lib/yjs/editable-yjs-binding.js` | ~6 kB | ~1.5 kB          |
| `lib/yjs/` total                  | ~7 kB | —                |

Core and UMD builds must not reference Yjs — enforced by `validate:core-bundle`.

## Related

- DOM apply adapter: `docs/apply-operations.md`
- Operation DTOs: `docs/adr/0001-commands-and-operations.md`

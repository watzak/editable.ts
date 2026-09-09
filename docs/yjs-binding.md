# editable.ts/yjs

Optional Yjs adapter subpath. Import separately from core:

```typescript
import { Editable } from 'editable.ts'
import { EditableYjsBinding } from 'editable.ts/yjs'
```

`yjs` is a **peer dependency** (marked optional in `peerDependenciesMeta`) so core-only installs do not warn or pull Yjs in.

## Scope (Prompt 4)

- Packaging: `./yjs` export, ESM + declarations via `tsc`
- Minimal shell: constructor validation, explicit initial sync, `destroy()`
- **Not included yet:** live two-way sync, rich text, awareness, providers

## Initial sync

No scenario silently drops content. Provide an explicit {@link InitialSyncPolicy}:

| Scenario                  | Behavior                                         |
| ------------------------- | ------------------------------------------------ |
| Both empty                | No-op                                            |
| Both identical            | No-op                                            |
| Y.Text empty, host filled | `yEmptyHostFilled: 'copy-host-to-y'`             |
| Host empty, Y.Text filled | `hostEmptyYFilled: 'copy-y-to-host'`             |
| Both filled, differ       | `bothFilledDiffer: 'error'` or conflict resolver |

```typescript
new EditableYjsBinding({
  editable,
  host,
  yText,
  initialSync: {
    yEmptyHostFilled: 'copy-host-to-y',
    hostEmptyYFilled: 'copy-y-to-host',
    bothFilledDiffer: 'error'
  }
})
```

## Ownership

One binding associates a registered block `host` with a `Y.Text` until `destroy()` is called. Further sync hooks will register observers on the binding instance; callers must destroy bindings before unloading the host.

## Bundle size

Measured without bundling the `yjs` peer (core imports are shared with the main package):

| Artifact                          | Raw   | Brotli (approx.) |
| --------------------------------- | ----- | ---------------- |
| `lib/yjs/editable-yjs-binding.js` | 4.6 kB | 1.1 kB           |
| `lib/yjs/` total                  | 5.4 kB | —                |

`size-limit` tracks `editable-yjs-binding.js` at 1.5 kB brotlied. Core and UMD builds must not reference Yjs — enforced by `validate:core-bundle`.

## Related

- DOM apply adapter: `docs/apply-operations.md`
- Operation DTOs: `docs/adr/0001-commands-and-operations.md`

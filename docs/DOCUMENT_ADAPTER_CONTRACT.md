# Document adapter contract (`EditableYjsDocumentAdapter`)

The library binds one `EditableYjsBinding` per {@link DocumentDirectiveRef}. CMS-specific schemas live in integrator adapters (see `examples/yjs-cms-document-adapter.ts`), not in core.

## Required methods

| Method                             | Contract                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRoot(doc)`                     | Returns the canonical structure root stored in `Y.Doc` (opaque to the binding). Must be stable for the lifetime of the binding.                                                                         |
| `listDirectives(root)`             | **Flat** list of every `{ componentId, directiveKey, yText }` that needs a text binding. Must reflect current CRDT state after structure changes. Order is used for focus fallbacks, not display order. |
| `renderComponent(…)`               | **Synchronously** creates DOM under `mountParent` at `siblingIndex`, returns `directiveHosts` map. Hosts must be **connected** before the binding calls `mountDirective`.                               |
| `observeStructure(root, onChange)` | Subscribe to **structure** changes (component add/remove/move, type change, container shape). Must **not** fire on text-only `Y.Text` updates — those are handled per-directive. Return unsubscribe.    |
| `getComponentMountParent(…)`       | Parent element for new component roots.                                                                                                                                                                 |
| `createStructuralAdapter(runtime)` | Hooks for split/merge/paste intents.                                                                                                                                                                    |
| `createComponentId()`              | Collision-resistant ids for local inserts.                                                                                                                                                              |

Optional: `listComponents`, `listComponentsWithValidation`, `destroyComponentView`, `resolveDirective`.

## Synchronous mount assumption

`EditableYjsDocumentBinding.reconcile()` calls `renderComponent`, then immediately `mountDirective(ref, host)` for each directive. Adapters must not defer mount to `requestAnimationFrame` or async import without returning placeholder hosts — bindings will not retry.

## Directive registration & host policy

Before `editable.add(host, …)` the binding checks `editable.ownsBlock(host)`:

```602:610:editable.ts/src/yjs/editable-yjs-document-binding.ts
  private mountDirective(ref: DocumentDirectiveRef, host: HTMLElement): EditableYjsBinding {
    ...
    if (!this.editable.ownsBlock(host)) {
      this.editable.add(host, { plainText: false })
    }
```

Integrators may **pre-register** hosts with explicit policy (`plainText`, `allowedFormats`, …) **before** reconcile mounts them. If the host is already owned, the binding **does not** change policy — set policy on first `editable.add` or via your render path.

Default when the binding registers: `{ plainText: false }` only.

## Properties / non-text fields (not automatic)

The document binding reconciles **structure** and **text directives** only. It does **not**:

- Observe `Y.Map` properties (e.g. heading `level`)
- Re-render when properties change remotely

Example CMS adapter reads `properties` only inside `renderComponent` when building DOM (heading tag). Remote property edits require integrator action (reconcile remount, dedicated observer, or custom patch). See comment in `examples/yjs-cms-document-adapter.ts` for `properties`.

## Structure observer wiring

The binding registers `observeStructure` and coalesces reconcile passes (`requestAnimationFrame`). Text edits on an existing `Y.Text` must **not** trigger full structure reconcile — only per-binding remote apply.

## Validation

Use `listComponentsWithValidation` to skip invalid nodes while continuing sync; invalid entries should be logged by the integrator.

## Related tests

- `spec/yjs-document-activation.spec.ts` — deferred activate, late mounts
- `spec/yjs-document-type-change.spec.ts` — type change remount
- `examples/yjs-cms-document-adapter.ts` — reference implementation (experimental, not semver API)

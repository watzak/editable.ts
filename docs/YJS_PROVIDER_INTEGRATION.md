# Yjs provider integration (beta)

editable.ts does **not** ship a network or persistence provider. Integrators own transport (`y-websocket`, `y-webrtc`, custom), optional persistence (`y-indexeddb`), authentication, and privacy compliance.

## Provider status convention

Map your provider events onto the neutral status surface exported from `editable.ts/yjs`:

| Status         | Typical source                   | UI hint                                     |
| -------------- | -------------------------------- | ------------------------------------------- |
| `connecting`   | WebSocket opening                | Disable publish / show spinner              |
| `connected`    | Socket open, handshake pending   | Wait — do not activate yet                  |
| `synced`       | First server/state sync complete | Safe to {@link EditableYjsBinding.activate} |
| `disconnected` | Socket closed / manual offline   | Read-only or local-only banner              |
| `reconnecting` | Provider retry                   | Preserve local Y.Doc; avoid duplicate seeds |
| `error`        | Auth failure, protocol error     | Show retry; log diagnostic                  |

Helpers:

```typescript
import {
  createProviderStatusSource,
  activateBindingsAfterProviderSync,
  isProviderReadyForInitialSync
} from 'editable.ts/yjs'
```

`createProviderStatusSource()` is an in-memory bus for demos and glue code. Production apps typically wrap their provider directly.

## Deferred initial sync

**Do not** construct `EditableYjsBinding` with the default eager sync when:

- IndexedDB may still hydrate the `Y.Doc`
- A WebSocket provider has not completed its first sync
- You pre-render host HTML from SSR while the CRDT is still empty

```typescript
const binding = new EditableYjsBinding({
  editable,
  host,
  yText,
  initialSync: policy,
  deferInitialSync: true,
  onSyncDiagnostic: (d) => console.info(d)
})

activateBindingsAfterProviderSync({
  providerStatus,
  activate: () => binding.activate(),
  onSyncDiagnostic: (d) => console.warn(d)
})
```

Until `activate()`:

- No `operation` → `Y.Text` capture
- No `Y.Text` → DOM remote apply
- Host and `Y.Text` may diverge by design

## Safe startup sequences

### 1. Empty local document (greenfield)

1. Create `Y.Doc` + provider room
2. Wait for provider `synced` (or confirm empty room)
3. Create binding with `deferInitialSync: true`
4. `activate()` — typically `host-empty-y-filled` copies remote (empty) or seeds from host

### 2. Existing server state

1. Create `Y.Doc`, connect provider
2. **Wait for `synced`** before `activate()`
3. Empty host + filled `Y.Text` → `copy-y-to-host` on activate

### 3. Offline IndexedDB + server

1. Create `Y.Doc`
2. Attach `IndexeddbPersistence` — await `whenSynced`
3. Connect WebSocket provider — await `synced`
4. `deferInitialSync: true` → `activate()` after **both** hydration and provider sync
5. CRDT merge is handled by Yjs; binding reconciles DOM from canonical `Y.Text`

See `examples/yjs-offline-demo.html`.

### 4. Two filled, different states (conflict)

If host HTML and `Y.Text` differ at activate time:

- Default policy `bothFilledDiffer: 'error'` throws `InitialSyncConflictError`
- Supply a resolver or pick `'host'` / `'y'` explicitly via custom resolver
- Emit `onSyncDiagnostic` with kind `initial-sync-conflict`

Never silently overwrite without an integrator decision.

### 5. Same plain text, different inline formats (rich text)

When operation text matches but inline attributes differ at activate time:

- Default (no `bothIdenticalFormatsDiffer`): host-only formatting → import to `Y.Text`; Y-only → rebuild host; both formatted differently → `InitialSyncFormatConflictError`
- Set `bothIdenticalFormatsDiffer: 'copy-host-to-y' | 'copy-y-to-host' | 'error'` explicitly when needed
- After activation, **`binding.reconcile()`** is recovery-only (Y.Text → host). Local DOM → Y.Text adoption uses **`binding.syncRichHostRunsToYText()`**

## Lifecycle & destroy order

```typescript
window.addEventListener('beforeunload', () => {
  presence?.destroy()
  documentAnnotations?.destroy()
  binding.destroy() // or documentBinding.destroy()
  provider.destroy()
  persistence?.destroy()
  editable.unload()
})
```

Destroy order: **overlays → bindings → provider → editable**. Bindings ignore late operations after `destroy()`.

## Diagnostic callbacks

`onSyncDiagnostic` reports non-fatal lifecycle events (`binding-deferred`, `binding-activated`, `initial-sync-complete`, `remote-reconcile`, `initial-sync-conflict`). These are integrator-facing — not a provider API.

## Demos (devDependencies only)

| Demo                    | Command                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Manual network          | `examples/yjs-collab-demo.html`                                                                           |
| y-websocket             | Terminal 1: `npm run dev:yjs-websocket` — Terminal 2: `npm run dev` → `/examples/yjs-websocket-demo.html` |
| y-indexeddb + websocket | `/examples/yjs-offline-demo.html` (same server)                                                           |

The demo server uses `y-websocket@2` bin utils with peer `yjs@13`. `@y/websocket-server` targets Yjs 14 and is not used in this repo.

## Manual IME test plan

See [YJS_IME_TEST_PLAN.md](./YJS_IME_TEST_PLAN.md).

## Privacy

User names (presence), annotation bodies, and author IDs are **application data**. editable.ts sanitizes on read but does not encrypt, retention-manage, or anonymize. Compliance is integrator-owned.

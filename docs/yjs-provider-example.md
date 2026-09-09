# Provider-neutral Yjs wiring (documentation only)

editable.ts does **not** ship a network provider. See **[YJS_PROVIDER_INTEGRATION.md](./YJS_PROVIDER_INTEGRATION.md)** for startup sequences, status conventions, deferred initial sync, and lifecycle.

## Install peers

```bash
npm install editable.ts yjs y-protocols
# Optional transport/persistence (integrator-owned, not bundled):
npm install y-websocket
# npm install y-indexeddb
```

## Minimal y-websocket server (Node)

Run separately — included as `scripts/yjs-websocket-server.mjs` in the repo for local demos:

```bash
npm run dev:yjs-websocket
```

```javascript
// scripts/yjs-websocket-server.mjs (abbreviated)
import { WebSocketServer } from 'ws'
import { createRequire } from 'node:module'
const { setupWSConnection } = createRequire(import.meta.url)('y-websocket/bin/utils.cjs')
```

## Browser client (deferred activate)

```typescript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { Awareness } from 'y-protocols/awareness'
import { Editable } from 'editable.ts'
import {
  EditableYjsBinding,
  EditableYjsPresence,
  createProviderStatusSource,
  activateBindingsAfterProviderSync
} from 'editable.ts/yjs'

const doc = new Y.Doc()
const providerStatus = createProviderStatusSource({ status: 'connecting' })
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', doc)

provider.on('status', ({ status }) => {
  providerStatus.setStatus({
    status:
      status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'
  })
})
provider.on('sync', (isSynced) => {
  if (isSynced) providerStatus.setStatus({ status: 'synced' })
})

const yText = doc.getText('block-1')
const editable = new Editable()
const host = document.querySelector('#editor') as HTMLElement
editable.add(host)

const binding = new EditableYjsBinding({
  editable,
  host,
  yText,
  initialSync: {
    yEmptyHostFilled: 'copy-host-to-y',
    hostEmptyYFilled: 'copy-y-to-host',
    bothFilledDiffer: 'error'
  },
  deferInitialSync: true,
  undo: true,
  onSyncDiagnostic: (d) => console.info('[sync]', d)
})

activateBindingsAfterProviderSync({
  providerStatus,
  activate: () => binding.activate()
})

const presence = new EditableYjsPresence({
  editable,
  host,
  yText,
  awareness: provider.awareness,
  user: { name: 'Ada', color: '#6366f1' }
})

window.addEventListener('beforeunload', () => {
  presence.destroy()
  binding.destroy()
  provider.destroy()
  editable.unload()
})
```

## Trust boundaries

- Treat remote Yjs updates as **trusted only within your authenticated room**
- URL attributes and Awareness name/color are sanitized on read; authenticate peers in your provider layer
- Never apply foreign HTML to the host — the binding applies **operations** derived from `Y.Text` deltas only

## Demos

| Demo                                     | Transport                        |
| ---------------------------------------- | -------------------------------- |
| `examples/yjs-collab-demo.html`          | Manual `Y.applyUpdate`           |
| `examples/yjs-websocket-demo.html`       | Real `y-websocket`               |
| `examples/yjs-offline-demo.html`         | `y-indexeddb` + `y-websocket`    |
| `examples/yjs-document-collab-demo.html` | Manual network, document binding |
| `examples/yjs-annotations-demo.html`     | Manual network, annotations      |

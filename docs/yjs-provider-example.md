# Provider-neutral Yjs wiring (documentation only)

editable.ts does **not** ship a network provider. This document shows how you might connect `EditableYjsBinding` to [y-websocket](https://github.com/yjs/y-websocket) — **example code only**, not part of the published package.

## Install peers

```bash
npm install editable.ts yjs y-protocols y-websocket
```

## Minimal server (Node)

```javascript
// server.mjs — run separately; not included in editable.ts
import { WebSocketServer } from 'ws'
import http from 'http'
import { setupWSConnection } from 'y-websocket/bin/utils'

const server = http.createServer()
const wss = new WebSocketServer({ server })
wss.on('connection', (ws, req) => setupWSConnection(ws, req))
server.listen(1234)
```

## Browser client sketch

```typescript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { Awareness } from 'y-protocols/awareness'
import { Editable } from 'editable.ts'
import { EditableYjsBinding, EditableYjsPresence } from 'editable.ts/yjs'

const doc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', doc)
const awareness = provider.awareness
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
  undo: true
})

const presence = new EditableYjsPresence({
  editable,
  host,
  yText,
  awareness,
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
- URL attributes and Awareness name/color are sanitized on read, but your provider must authenticate peers
- Never apply foreign HTML to the host — the binding applies **operations** derived from `Y.Text` deltas only

## Local demo without network

See `examples/yjs-collab-demo.html` for a two-client simulation using manual `Y.applyUpdate` and Awareness encoding.

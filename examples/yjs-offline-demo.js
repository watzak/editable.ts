import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { WebsocketProvider } from 'y-websocket'
import { Editable } from '../lib/core.js'
import {
  activateBindingsAfterProviderSync,
  createProviderStatusSource,
  EditableYjsBinding
} from '../lib/yjs/index.js'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:1234`
const ROOM = new URLSearchParams(location.search).get('room') ?? 'editable-offline'
const DOC_NAME = `editable-offline-${ROOM}`

const statusEl = document.querySelector('[data-testid="provider-status"]')
const logEl = document.querySelector('[data-testid="diagnostic-log"]')

function log(line) {
  if (logEl) logEl.textContent = `${logEl.textContent}\n${line}`.trim()
}

const doc = new Y.Doc()
const providerStatus = createProviderStatusSource({ status: 'connecting' })

const persistence = new IndexeddbPersistence(DOC_NAME, doc)
persistence.on('synced', () => {
  log('indexeddb: local state loaded')
})

const provider = new WebsocketProvider(WS_URL, ROOM, doc, { connect: true })

provider.on('status', ({ status }) => {
  const mapped =
    status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'
  providerStatus.setStatus({ status: mapped })
})

provider.on('sync', () => {
  if (provider.synced) providerStatus.setStatus({ status: 'synced' })
})

provider.on('synced', () => {
  providerStatus.setStatus({ status: 'synced' })
})

providerStatus.subscribe((status) => {
  if (statusEl) {
    statusEl.dataset.state = status.status
    statusEl.textContent = status.status
  }
})

const yText = doc.getText('body')
const host = document.getElementById('editor')
const editable = new Editable({ defaultBehavior: true })
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
  onSyncDiagnostic: (d) => log(`[${d.kind}] ${d.message}`)
})

persistence.whenSynced.then(() => {
  log('indexeddb: local state hydrated')
  activateBindingsAfterProviderSync({
    providerStatus,
    activate: () => binding.activate(),
    onSyncDiagnostic: (d) => log(`[${d.kind}] ${d.message}`)
  })
})

document.querySelector('.toolbar')?.addEventListener('click', (event) => {
  const action = event.target instanceof HTMLButtonElement ? event.target.dataset.action : null
  if (!action) return
  if (action === 'toggle-offline') {
    if (provider.shouldConnect) {
      provider.disconnect()
      providerStatus.setStatus({ status: 'disconnected', message: 'manual offline' })
      log('offline: disconnected websocket')
    } else {
      provider.connect()
      providerStatus.setStatus({ status: 'reconnecting' })
      log('offline: reconnecting websocket')
    }
  }
  if (action === 'reconnect') {
    provider.disconnect()
    provider.connect()
    providerStatus.setStatus({ status: 'reconnecting' })
    log('reconnect: forced')
  }
})

window.__yjsOfflineE2E = { providerStatus, binding, yText, provider, persistence, log }

window.addEventListener('beforeunload', () => {
  binding.destroy()
  provider.destroy()
  persistence.destroy()
  editable.unload()
})

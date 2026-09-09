import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { Awareness } from 'y-protocols/awareness'
import { Editable } from '../lib/core.js'
import {
  activateBindingsAfterProviderSync,
  createProviderStatusSource,
  EditableYjsBinding,
  EditableYjsPresence
} from '../lib/yjs/index.js'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:1234`
const ROOM = new URLSearchParams(location.search).get('room') ?? 'editable-demo'

const statusEl = document.querySelector('[data-testid="provider-status"]')
const logEl = document.querySelector('[data-testid="diagnostic-log"]')
const roomEl = document.getElementById('room-name')

function appendLog(line) {
  if (!logEl) return
  logEl.textContent = `${logEl.textContent}\n${line}`.trim()
}

function mapWebsocketStatus(providerStatus) {
  switch (providerStatus) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'connecting'
    case 'disconnected':
      return 'disconnected'
    default:
      return 'disconnected'
  }
}

const doc = new Y.Doc()
const providerStatus = createProviderStatusSource({ status: 'connecting' })
const provider = new WebsocketProvider(WS_URL, ROOM, doc, { connect: true })

if (roomEl) roomEl.textContent = ROOM

provider.on('status', ({ status }) => {
  providerStatus.setStatus({ status: mapWebsocketStatus(status) })
})

provider.on('sync', () => {
  if (provider.synced) {
    providerStatus.setStatus({ status: 'synced', message: 'Provider synced with server' })
  }
})

provider.on('synced', () => {
  providerStatus.setStatus({ status: 'synced', message: 'Provider synced with server' })
})

provider.on('connection-error', (error) => {
  providerStatus.setStatus({
    status: 'error',
    message: error instanceof Error ? error.message : 'connection-error'
  })
})

const unsubscribeStatus = providerStatus.subscribe((status) => {
  if (statusEl) {
    statusEl.dataset.state = status.status
    statusEl.textContent = status.message ? `${status.status}: ${status.message}` : status.status
  }
})

const yText = doc.getText('body')
const host = document.getElementById('editor')
const editable = new Editable({ defaultBehavior: true })
editable.add(host, { plainText: false })

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
  onSyncDiagnostic: (d) => appendLog(`[${d.kind}] ${d.message}`)
})

const awareness = provider.awareness ?? new Awareness(doc)
const presence = new EditableYjsPresence({
  editable,
  host,
  yText,
  awareness,
  user: {
    name: `user-${Math.floor(Math.random() * 1000)}`,
    color: '#6366f1'
  },
  throttleMs: 50
})

const unsubscribeActivate = activateBindingsAfterProviderSync({
  providerStatus,
  activate: () => binding.activate(),
  onSyncDiagnostic: (d) => appendLog(`[${d.kind}] ${d.message}`)
})

window.__yjsWebsocketE2E = {
  providerStatus,
  binding,
  yText,
  doc,
  appendLog
}

window.addEventListener('beforeunload', () => {
  unsubscribeActivate()
  unsubscribeStatus()
  presence.destroy()
  binding.destroy()
  provider.destroy()
  editable.unload()
})

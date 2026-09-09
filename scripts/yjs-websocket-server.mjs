/**
 * Minimal y-websocket server for local integration demos.
 * Not part of the published editable.ts package.
 */
import http from 'node:http'
import { createRequire } from 'node:module'
import { WebSocketServer } from 'ws'

const require = createRequire(import.meta.url)
const { setupWSConnection } = require('y-websocket/bin/utils')

const port = Number(process.env.YJS_WS_PORT ?? 1234)
const host = process.env.YJS_WS_HOST ?? '127.0.0.1'

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('editable.ts y-websocket demo server\n')
})

const wss = new WebSocketServer({ server })
wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req)
})

server.listen(port, host, () => {
  console.log(`y-websocket demo listening on ws://${host}:${port}`)
})

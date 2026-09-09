import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

declare global {
  interface Window {
    __yjsWebsocketE2E?: {
      providerStatus: { getStatus: () => { status: string } }
      yText: {
        toString: () => string
        insert: (index: number, text: string) => void
        length: number
      }
      doc: { transact: (fn: () => void) => void }
    }
  }
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let serverProcess: ReturnType<typeof spawn> | null = null

test.describe('y-websocket integration demo', () => {
  test.beforeAll(async () => {
    serverProcess = spawn('node', ['scripts/yjs-websocket-server.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, YJS_WS_PORT: '1234', YJS_WS_HOST: '127.0.0.1' },
      stdio: 'pipe'
    })
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('websocket server timeout')), 10_000)
      serverProcess!.stderr?.on('data', (chunk) => {
        if (String(chunk).includes('EADDRINUSE')) {
          clearTimeout(timer)
          resolvePromise()
        }
      })
      serverProcess!.stdout?.on('data', (chunk) => {
        if (String(chunk).includes('listening')) {
          clearTimeout(timer)
          resolvePromise()
        }
      })
    })
  })

  test.afterAll(async () => {
    serverProcess?.kill('SIGTERM')
    serverProcess = null
  })

  test('activates binding after provider synced', async ({ browser }) => {
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    await pageA.goto('/examples/yjs-websocket-demo.html?room=e2e-ws', {
      waitUntil: 'domcontentloaded'
    })
    await pageB.goto('/examples/yjs-websocket-demo.html?room=e2e-ws', {
      waitUntil: 'domcontentloaded'
    })

    await pageA.waitForFunction(
      () => window.__yjsWebsocketE2E?.providerStatus.getStatus().status === 'synced',
      undefined,
      { timeout: 20_000 }
    )
    await pageB.waitForFunction(
      () => window.__yjsWebsocketE2E?.providerStatus.getStatus().status === 'synced',
      undefined,
      { timeout: 20_000 }
    )

    await pageA.evaluate(() => {
      const api = window.__yjsWebsocketE2E!
      api.doc.transact(() => {
        api.yText.insert(api.yText.length, 'hello websocket')
      })
    })

    await pageB.waitForFunction(
      () => (window.__yjsWebsocketE2E?.yText.toString() ?? '').includes('hello'),
      undefined,
      { timeout: 15_000 }
    )

    await pageA.locator('[data-testid="websocket-editor"]').click()
    await pageA.keyboard.type('!')
    await pageB.waitForFunction(
      () => (window.__yjsWebsocketE2E?.yText.toString() ?? '').includes('!'),
      undefined,
      { timeout: 15_000 }
    )

    const remote = await pageB.evaluate(() => window.__yjsWebsocketE2E?.yText.toString())
    expect(remote).toContain('hello')

    await contextA.close()
    await contextB.close()
  })
})

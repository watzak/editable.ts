/**
 * Captures README demo assets from the local examples build.
 * Usage: node scripts/capture-readme-demo.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const examplesDir = join(root, 'examples')
const assetsDir = join(root, '.github', 'assets')
const port = 8765

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json'
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
      const filePath = join(examplesDir, urlPath === '/' ? 'index.html' : urlPath)

      try {
        const fileStat = await stat(filePath)
        if (!fileStat.isFile()) {
          res.writeHead(404)
          res.end('Not found')
          return
        }

        const ext = extname(filePath)
        const body = await readFile(filePath)
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' })
        res.end(body)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.listen(port, () => resolve(server))
  })
}

async function capture() {
  await mkdir(assetsDir, { recursive: true })

  const server = await startServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 920, height: 640 },
    deviceScaleFactor: 2
  })

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.formatting-example p')

    const formattingSection = page.locator('.example-section').nth(1)
    await formattingSection.scrollIntoViewIfNeeded()
    const clipBox = await formattingSection.boundingBox()
    if (!clipBox) throw new Error('Could not measure formatting section')

    const screenshotSection = async (path) => {
      await page.screenshot({ path, clip: clipBox })
    }

    const paragraph = page.locator('.formatting-example p')
    await paragraph.click()
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    await page.waitForTimeout(200)

    await screenshotSection(join(assetsDir, 'frame-1.png'))

    // Select a phrase to show the floating toolbar
    await page.evaluate(() => {
      const el = document.querySelector('.formatting-example p')
      const textNode = el?.firstChild
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return

      const text = textNode.textContent ?? ''
      const start = text.indexOf('consectetur')
      const end = start + 'consectetur adipiscing elit'.length
      if (start < 0) return

      const range = document.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, end)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })

    await page.waitForSelector('.selection-tip', { state: 'visible', timeout: 5000 })
    await page.waitForTimeout(300)

    await screenshotSection(join(assetsDir, 'frame-2.png'))
    await screenshotSection(join(assetsDir, 'demo.png'))

    console.log('Captured .github/assets/demo.png and frame-*.png')
  } finally {
    await browser.close()
    server.close()
  }
}

async function buildGif() {
  const gif = join(assetsDir, 'demo.gif')

  await new Promise((resolve, reject) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        '0.4',
        '-i',
        join(assetsDir, 'frame-%d.png'),
        '-filter_complex',
        '[0:v]fps=2,scale=860:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer',
        '-loop',
        '0',
        gif
      ],
      { stdio: 'inherit' }
    )
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))))
  })

  console.log('Created .github/assets/demo.gif')
}

capture()
  .then(() => buildGif().catch(() => console.warn('ffmpeg not available — demo.gif skipped')))
  .then(async () => {
    const { unlink } = await import('node:fs/promises')
    for (const file of ['frame-1.png', 'frame-2.png', 'palette.png', 'demo-selection.png']) {
      await unlink(join(assetsDir, file)).catch(() => {})
    }
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

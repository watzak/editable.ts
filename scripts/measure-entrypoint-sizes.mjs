import { readFileSync } from 'node:fs'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const entrypoints = [
  { label: 'core (ESM)', path: 'lib/core.js' },
  { label: 'features (ESM)', path: 'lib/features.js' },
  { label: 'yjs index (ESM)', path: 'lib/yjs/index.js' },
  { label: 'yjs binding', path: 'lib/yjs/editable-yjs-binding.js' },
  { label: 'yjs undo', path: 'lib/yjs/binding-undo.js' },
  { label: 'yjs presence', path: 'lib/yjs/editable-yjs-presence.js' },
  { label: 'UMD', path: 'dist/editable.umd.cjs' }
]

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`
}

console.log('| Entry | Raw | gzip | brotli |')
console.log('| --- | --- | --- | --- |')

for (const entry of entrypoints) {
  const file = join(root, entry.path)
  const raw = readFileSync(file)
  const gz = gzipSync(raw)
  const br = brotliCompressSync(raw)
  console.log(`| ${entry.label} | ${kb(raw.length)} | ${kb(gz.length)} | ${kb(br.length)} |`)
}

console.log('\nYjs (`yjs`, `y-protocols`) remains an optional peer — not bundled into core/UMD.')

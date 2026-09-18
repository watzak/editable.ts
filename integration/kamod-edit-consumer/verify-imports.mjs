import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const editableRoot = join(here, '../..')
const artifactsDir = join(editableRoot, 'integration-artifacts')
const manifest = JSON.parse(readFileSync(join(artifactsDir, 'MANIFEST.json'), 'utf8'))

if (!existsSync(join(artifactsDir, manifest.tarball))) {
  console.error('Missing tarball — run: npm run integration:artifact')
  process.exit(1)
}

const { Editable } = await import('editable.ts')
if (!Editable) throw new Error('Editable missing')

const installedPkg = JSON.parse(
  readFileSync(join(here, 'node_modules/editable.ts/package.json'), 'utf8')
)
if (installedPkg.version !== manifest.version) {
  throw new Error(`Installed ${installedPkg.version} !== manifest ${manifest.version}`)
}

const monorepoDevYjs = existsSync(join(editableRoot, 'node_modules/yjs'))
if (!monorepoDevYjs && existsSync(join(here, 'node_modules/yjs'))) {
  throw new Error('yjs must not be installed in consumer node_modules until peer step')
}

if (!monorepoDevYjs) {
  const requireFromYjsEntry = createRequire(
    join(here, 'node_modules/editable.ts/lib/yjs/editable-yjs-binding.js')
  )
  try {
    requireFromYjsEntry.resolve('yjs')
    throw new Error('yjs peer should not resolve without explicit install')
  } catch (error) {
    if (error instanceof Error && error.message.includes('should not resolve')) throw error
  }
}

console.log('kamod-edit consumer fixture ok', {
  version: manifest.version,
  sha256: manifest.sha256,
  tarball: manifest.tarball,
  monorepoDevYjs
})

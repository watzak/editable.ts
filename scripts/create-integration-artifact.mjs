#!/usr/bin/env node
/**
 * Produces a reproducible npm pack tarball + SHA256 manifest for kamod-edit / CI consumers.
 * Does not publish to npm.
 */
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = join(packageRoot, 'integration-artifacts')

const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const gitHead = execSync('git rev-parse HEAD', { cwd: packageRoot, encoding: 'utf8' }).trim()
const gitShort = execSync('git rev-parse --short HEAD', {
  cwd: packageRoot,
  encoding: 'utf8'
}).trim()
const dirty = execSync('git status --porcelain', { cwd: packageRoot, encoding: 'utf8' }).trim()

execSync('npm run build -s', { cwd: packageRoot, stdio: 'inherit' })
const packName = execSync('npm pack --silent', { cwd: packageRoot, encoding: 'utf8' }).trim()
const srcTarball = join(packageRoot, packName)

mkdirSync(outDir, { recursive: true })
const destName = `editable.ts-${pkg.version}+${gitShort}.tgz`
const destTarball = join(outDir, destName)
copyFileSync(srcTarball, destTarball)

const sha256 = createHash('sha256').update(readFileSync(destTarball)).digest('hex')

const manifest = {
  name: pkg.name,
  version: pkg.version,
  recommendedNextVersion: '1.3.0-beta.2',
  gitHead,
  gitShort,
  workingTreeDirty: dirty.length > 0,
  tarball: destName,
  sha256,
  createdAt: new Date().toISOString(),
  consume: {
    npm: `npm install file:${destTarball}`,
    peersForYjs: { yjs: '^13.6.0', 'y-protocols': '^1.0.6' }
  },
  readiness: 'experimental-yjs-beta',
  openGates: [
    'spec/yjs-p0-baseline.spec.ts move vs remote Y.Text clone',
    'spec/yjs-p0-baseline.spec.ts v1 reply LWW (writeVersion 1 only)',
    'spec/yjs-structural-concurrency-gate.spec.ts integrator structural lock'
  ]
}

writeFileSync(join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))
writeFileSync(join(outDir, `${destName}.sha256`), `${sha256}  ${destName}\n`)

console.log(JSON.stringify(manifest, null, 2))
console.log(`\nArtifact: ${destTarball}`)

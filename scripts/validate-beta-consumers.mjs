import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packOutput = execSync('npm pack --silent', { cwd: packageRoot, encoding: 'utf8' }).trim()
const tarball = join(packageRoot, packOutput)

function runFixture(name, setup) {
  const tempDir = mkdtempSync(join(tmpdir(), `editable-beta-${name}-`))
  try {
    setup(tempDir, tarball)
    console.log(`beta consumer [${name}]: ok`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

try {
  runFixture('core-only', (dir, tgz) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'editable-beta-core-only',
          private: true,
          type: 'module',
          dependencies: { 'editable.ts': `file:${tgz}` }
        },
        null,
        2
      )
    )
    execSync('npm install --no-audit --no-fund', { cwd: dir, stdio: 'pipe' })
    writeFileSync(
      join(dir, 'main.mjs'),
      `import { Editable } from 'editable.ts'
if (!Editable) throw new Error('missing Editable')
`
    )
    execSync('node main.mjs', { cwd: dir, stdio: 'pipe' })
    if (existsSync(join(dir, 'node_modules', 'yjs'))) {
      throw new Error('core-only install resolved yjs')
    }
  })

  runFixture('yjs-peer', (dir, tgz) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'editable-beta-yjs',
          private: true,
          type: 'module',
          dependencies: {
            'editable.ts': `file:${tgz}`,
            yjs: '^13.6.0',
            'y-protocols': '^1.0.6'
          }
        },
        null,
        2
      )
    )
    execSync('npm install --no-audit --no-fund', { cwd: dir, stdio: 'pipe' })
    writeFileSync(
      join(dir, 'main.mjs'),
      `import {
  EditableYjsBinding,
  EditableYjsDocumentBinding,
  EditableYjsAnnotations,
  createProviderStatusSource,
  activateBindingsAfterProviderSync
} from 'editable.ts/yjs'
const checks = [
  EditableYjsBinding,
  EditableYjsDocumentBinding,
  EditableYjsAnnotations,
  createProviderStatusSource,
  activateBindingsAfterProviderSync
]
if (checks.some((c) => !c)) throw new Error('missing yjs exports')
`
    )
    execSync('node main.mjs', { cwd: dir, stdio: 'pipe' })
  })

  runFixture('bundler-vite', (dir, tgz) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'editable-beta-bundler',
          private: true,
          type: 'module',
          dependencies: {
            'editable.ts': `file:${tgz}`,
            yjs: '^13.6.0'
          },
          devDependencies: {
            vite: '^8.0.0'
          }
        },
        null,
        2
      )
    )
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><script type="module" src="/main.js"></script>`
    )
    writeFileSync(
      join(dir, 'main.js'),
      `import { Editable } from 'editable.ts'
import { EditableYjsBinding } from 'editable.ts/yjs'
console.log(typeof Editable, typeof EditableYjsBinding)
`
    )
    writeFileSync(
      join(dir, 'vite.config.js'),
      `export default { build: { outDir: 'dist', emptyOutDir: true } }`
    )
    execSync('npm install --no-audit --no-fund', { cwd: dir, stdio: 'pipe' })
    execSync('npx vite build', { cwd: dir, stdio: 'pipe' })
    const out = readFileSync(join(dir, 'dist', 'assets', readdirAssets(dir)), 'utf8')
    if (out.includes('EditableYjsBinding') === false) {
      throw new Error('bundler output missing yjs binding reference')
    }
    if (
      readFileSync(join(dir, 'node_modules', 'editable.ts', 'lib', 'core.js'), 'utf8').includes(
        'yjs'
      )
    ) {
      throw new Error('core.js references yjs in bundler fixture')
    }
  })

  console.log('Beta consumer fixtures passed (core-only, yjs-peer, bundler-vite).')
} finally {
  rmSync(tarball, { force: true })
}

function readdirAssets(dir) {
  const assetsDir = join(dir, 'dist', 'assets')
  const js = readdirSync(assetsDir).find((f) => f.endsWith('.js'))
  if (!js) throw new Error('vite build produced no JS asset')
  return js
}

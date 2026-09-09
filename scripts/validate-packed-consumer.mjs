import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packOutput = execSync('npm pack --silent', { cwd: packageRoot, encoding: 'utf8' }).trim()
const tarball = join(packageRoot, packOutput)

const tempDir = mkdtempSync(join(tmpdir(), 'editable-packed-consumer-'))

try {
  writeFileSync(
    join(tempDir, 'package.json'),
    JSON.stringify(
      {
        name: 'editable-packed-consumer-fixture',
        private: true,
        type: 'module',
        dependencies: {
          'editable.ts': `file:${tarball}`
        }
      },
      null,
      2
    )
  )

  execSync('npm install --no-audit --no-fund', { cwd: tempDir, stdio: 'pipe' })

  const nodeModules = join(tempDir, 'node_modules')

  writeFileSync(
    join(tempDir, 'core-import.mjs'),
    `import { Editable } from 'editable.ts'
if (!Editable) throw new Error('Editable export missing')
console.log('core-import-ok')
`
  )
  execSync('node core-import.mjs', { cwd: tempDir, stdio: 'pipe' })

  writeFileSync(
    join(tempDir, 'features-import.mjs'),
    `import 'editable.ts/features'
console.log('features-import-ok')
`
  )
  execSync('node features-import.mjs', { cwd: tempDir, stdio: 'pipe' })

  const featuresJs = readFileSync(join(nodeModules, 'editable.ts', 'lib', 'features.js'), 'utf8')
  if (featuresJs.includes('EditableYjsBinding') || featuresJs.includes('from "yjs"')) {
    console.error('Published features.js unexpectedly references Yjs')
    process.exit(1)
  }

  if (existsSync(join(nodeModules, 'yjs'))) {
    console.error('Core-only install unexpectedly resolved yjs into node_modules')
    process.exit(1)
  }

  writeFileSync(
    join(tempDir, 'yjs-import.mjs'),
    `let failed = false
try {
  await import('editable.ts/yjs')
} catch {
  failed = true
}
if (!failed) {
  throw new Error('editable.ts/yjs should not load without yjs peer installed')
}
console.log('yjs-subpath-unresolved-without-peer-ok')
`
  )
  execSync('node yjs-import.mjs', { cwd: tempDir, stdio: 'pipe' })

  const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf8'))
  pkg.dependencies.yjs = '^13.6.0'
  writeFileSync(join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2))
  execSync('npm install --no-audit --no-fund', { cwd: tempDir, stdio: 'pipe' })

  writeFileSync(
    join(tempDir, 'yjs-import-ok.mjs'),
    `import { Editable } from 'editable.ts'
import { EditableYjsBinding } from 'editable.ts/yjs'
if (!Editable || !EditableYjsBinding) throw new Error('yjs subpath exports missing')
console.log('yjs-import-ok')
`
  )
  execSync('node yjs-import-ok.mjs', { cwd: tempDir, stdio: 'pipe' })

  const coreJs = readFileSync(join(nodeModules, 'editable.ts', 'lib', 'core.js'), 'utf8')
  if (coreJs.includes('yjs') || coreJs.includes('EditableYjsBinding')) {
    console.error('Published core.js still references Yjs')
    process.exit(1)
  }

  console.log(
    'Packed consumer checks passed: core import works without yjs; yjs subpath requires peer.'
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
  rmSync(tarball, { force: true })
}

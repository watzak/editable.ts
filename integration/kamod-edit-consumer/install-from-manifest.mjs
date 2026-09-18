import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(
  readFileSync(join(here, '../../integration-artifacts/MANIFEST.json'), 'utf8')
)
const tarballRel = `file:../../integration-artifacts/${manifest.tarball}`

const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
pkg.dependencies['editable.ts'] = tarballRel
writeFileSync(join(here, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

execSync('npm install --no-audit --no-fund', { cwd: here, stdio: 'inherit' })
console.log('Installed', manifest.tarball, manifest.sha256)

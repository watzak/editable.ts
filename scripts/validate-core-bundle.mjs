import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const libRoot = new URL('../lib/', import.meta.url)
const coreEntry = readFileSync(new URL('../lib/core.js', import.meta.url), 'utf8')
const umdSource = readFileSync(new URL('../dist/editable.umd.cjs', import.meta.url), 'utf8')

const featureMarkers = [
  'highlight-support',
  'monitored-highlighting',
  'text-diff',
  'plugins/highlighting'
]

const yjsMarkers = [
  'from "yjs"',
  "from 'yjs'",
  'require("yjs")',
  "require('yjs')",
  'EditableYjsBinding',
  'lib/yjs/',
  'src/yjs/'
]

for (const marker of featureMarkers) {
  if (coreEntry.includes(marker)) {
    console.error(`Core bundle unexpectedly references optional feature module: ${marker}`)
    process.exit(1)
  }
}

for (const bundle of [
  { label: 'core entry', source: coreEntry },
  { label: 'umd', source: umdSource }
]) {
  for (const marker of yjsMarkers) {
    if (bundle.source.includes(marker)) {
      console.error(`${bundle.label} bundle unexpectedly references Yjs binding: ${marker}`)
      process.exit(1)
    }
  }
}

const importPattern = /from\s+["'](\.[^"']+)["']/g

function resolveImport(fromFile, spec) {
  const base = dirname(fromFile)
  let target = join(base, spec)
  if (!target.endsWith('.js')) target += '.js'
  return target
}

function collectCoreGraph(entryPath) {
  const visited = new Set()
  const queue = [entryPath]

  while (queue.length) {
    const file = queue.pop()
    if (visited.has(file)) continue
    visited.add(file)

    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const resolved = resolveImport(file, match[1])
      if (resolved.startsWith(fileURLToPath(libRoot))) {
        queue.push(resolved)
      }
    }
  }

  return visited
}

const coreGraph = collectCoreGraph(fileURLToPath(new URL('../lib/core.js', import.meta.url)))

for (const file of coreGraph) {
  const rel = relative(fileURLToPath(libRoot), file)
  if (rel.startsWith('yjs/')) {
    console.error(`Core dependency graph includes optional Yjs module: lib/${rel}`)
    process.exit(1)
  }
}

console.log(
  `Core and UMD bundles do not include optional feature or Yjs modules (${coreGraph.size} core files checked).`
)

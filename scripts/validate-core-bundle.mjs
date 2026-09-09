import { readFileSync } from 'node:fs'

const coreSource = readFileSync(new URL('../lib/core.js', import.meta.url), 'utf8')
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
  if (coreSource.includes(marker)) {
    console.error(`Core bundle unexpectedly references optional feature module: ${marker}`)
    process.exit(1)
  }
}

for (const bundle of [
  { label: 'core', source: coreSource },
  { label: 'umd', source: umdSource }
]) {
  for (const marker of yjsMarkers) {
    if (bundle.source.includes(marker)) {
      console.error(`${bundle.label} bundle unexpectedly references Yjs binding: ${marker}`)
      process.exit(1)
    }
  }
}

console.log('Core and UMD bundles do not include optional feature or Yjs modules.')

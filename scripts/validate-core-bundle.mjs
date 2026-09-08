import { readFileSync } from 'node:fs'

const coreSource = readFileSync(new URL('../lib/core.js', import.meta.url), 'utf8')
const featureMarkers = [
  'highlight-support',
  'monitored-highlighting',
  'text-diff',
  'plugins/highlighting'
]

for (const marker of featureMarkers) {
  if (coreSource.includes(marker)) {
    console.error(`Core bundle unexpectedly references optional feature module: ${marker}`)
    process.exit(1)
  }
}

console.log('Core bundle does not include optional feature modules.')

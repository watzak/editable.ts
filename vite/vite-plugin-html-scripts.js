/**
 * Vite plugin to inject the correct script tags into index.html
 * based on dev vs production mode
 */
import {readFileSync, writeFileSync} from 'fs'
import {resolve, dirname} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlSourcePath = resolve(__dirname, '../examples/index.html')

function transformHtml (html, isDev) {
  if (isDev) {
    // Dev mode: use source files with module type
    // Remove any production script tags
    html = html.replace(/<script[^>]*src="dist\/[^"]*"><\/script>/gi, '')
    // Remove any existing dev script tags to avoid duplicates
    html = html.replace(/<script[^>]*src="\/examples\/(index|styles-entry)\.js"><\/script>/gi, '')
    // Inject dev scripts
    html = html.replace('</head>', '    <script type="module" src="/examples/styles-entry.js"></script>\n  </head>')
    html = html.replace('</body>', '    <script type="module" src="/examples/index.js"></script>\n  </body>')
  } else {
    // Production: use built bundles
    // Remove any dev script tags
    html = html.replace(/<script[^>]*src="\/examples\/(index|styles-entry)\.js"><\/script>/gi, '')
    // Remove any existing production script tags to avoid duplicates
    html = html.replace(/<script[^>]*src="dist\/(bundle|styles)\.js"><\/script>/gi, '')
    // Inject production scripts
    html = html.replace('</head>', '    <script src="dist/styles.js"></script>\n  </head>')
    html = html.replace('</body>', '    <script src="dist/bundle.js"></script>\n  </body>')
  }
  return html
}

export function htmlScriptsPlugin (isDev = false) {
  let transformedHtml = null

  return {
    name: 'html-scripts-inject',
    buildStart () {
      // For production builds, read and transform HTML at build start
      if (!isDev) {
        const html = readFileSync(htmlSourcePath, 'utf-8')
        transformedHtml = transformHtml(html, isDev)
      }
    },
    transformIndexHtml (html) {
      transformedHtml = transformHtml(html, isDev)
      return transformedHtml
    },
    writeBundle () {
      // During production build, write transformed HTML back to source location
      if (!isDev && transformedHtml) {
        writeFileSync(htmlSourcePath, transformedHtml, 'utf-8')
      }
    }
  }
}


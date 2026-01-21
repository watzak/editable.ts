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
    // Remove any production script tags (including surrounding whitespace/newlines)
    html = html.replace(/\s*<script[^>]*src="dist\/[^"]*"><\/script>\s*/gi, '')
    // Remove any existing dev script tags to avoid duplicates (including surrounding whitespace/newlines)
    html = html.replace(/\s*<script[^>]*src="\/examples\/(index|styles-entry)\.js"><\/script>\s*/gi, '')
    // Inject dev scripts
    html = html.replace('</head>', '    <script type="module" src="/examples/styles-entry.js"></script>\n  </head>')
    html = html.replace('</body>', '    <script type="module" src="/examples/index.js"></script>\n  </body>')
  } else {
    // Production: use built bundles
    // Remove any dev script tags (including surrounding whitespace/newlines)
    html = html.replace(/\s*<script[^>]*src="\/examples\/(index|styles-entry)\.js"><\/script>\s*/gi, '')
    // Remove any existing production script tags to avoid duplicates (including surrounding whitespace/newlines)
    html = html.replace(/\s*<script[^>]*src="dist\/(bundle|styles)\.js"><\/script>\s*/gi, '')
    // Inject production scripts
    // Ensure proper newline before closing tags
    html = html.replace(/([^\n])\s*<\/head>/g, '$1\n    <script src="dist/styles.js"></script>\n  </head>')
    html = html.replace(/([^\n])\s*<\/body>/g, '$1\n    <script src="dist/bundle.js"></script>\n  </body>')
  }
  // Normalize multiple consecutive empty lines (3+ empty lines become max 2)
  // This prevents accumulation of empty lines after each build
  html = html.replace(/\n\s*\n\s*\n+/g, '\n\n')
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


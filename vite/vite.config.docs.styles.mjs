import {defineConfig} from 'vite'
import {resolve, dirname} from 'path'
import {fileURLToPath} from 'url'
import preact from '@preact/preset-vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import {htmlScriptsPlugin} from './vite-plugin-html-scripts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    preact(),
    htmlScriptsPlugin(false), // Production mode
    cssInjectedByJsPlugin({topExecutionPriority: false})
  ],
  build: {
    outDir: 'examples/dist',
    emptyOutDir: false, // Don't clear on second build
    sourcemap: true,
    rollupOptions: {
      input: {
        styles: resolve(__dirname, '../examples/styles-entry.js')
      },
      output: {
        format: 'iife',
        name: 'styles',
        entryFileNames: 'styles.js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    extensionAlias: {
      '.js': ['.ts', '.js']
    },
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime'
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
})


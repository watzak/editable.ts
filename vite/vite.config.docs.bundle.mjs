import {defineConfig} from 'vite'
import {resolve, dirname} from 'path'
import {fileURLToPath} from 'url'
import preact from '@preact/preset-vite'
import {htmlScriptsPlugin} from './vite-plugin-html-scripts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    preact(),
    htmlScriptsPlugin(false) // Production mode
  ],
  build: {
    outDir: 'examples/dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        bundle: resolve(__dirname, '../examples/index.js')
      },
      output: {
        format: 'iife',
        name: 'bundle',
        entryFileNames: 'bundle.js',
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


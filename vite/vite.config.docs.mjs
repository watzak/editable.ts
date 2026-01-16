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
    htmlScriptsPlugin(true), // Dev mode
    cssInjectedByJsPlugin({
      topExecutionPriority: false,
      jsAssetsFilterFunction: (outputAsset) => {
        // Only inject CSS into styles.js, not bundle.js
        return outputAsset.fileName === 'styles.js'
      }
    })
  ],
  build: {
    outDir: 'examples/dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        bundle: resolve(__dirname, '../examples/index.js'),
        styles: resolve(__dirname, '../examples/styles-entry.js')
      },
      output: {
        entryFileNames: '[name].js',
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
  server: {
    port: 9050,
    open: '/examples/index.html'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development')
  }
})


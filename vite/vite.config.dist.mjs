import {defineConfig} from 'vite'
import {resolve, dirname} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, '../lib/core.js'),
      name: 'Editable',
      fileName: 'editable',
      formats: ['umd']
    },
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    rollupOptions: {
      output: {
        // Ensure the library export is correctly named
        exports: 'named'
      }
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    extensionAlias: {
      '.js': ['.ts', '.js']
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
})


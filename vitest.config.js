import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./spec/setup.spec.ts'],
    include: ['spec/**/*.spec.ts'],
    exclude: ['spec/setup.spec.ts'], // Exclude setup file from tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'text-summary'],
      exclude: [
        'node_modules/',
        'spec/',
        'examples/',
        'lib/',
        'dist/',
        '**/*.d.ts',
        '**/*.spec.ts'
      ]
    },
    // Test timeout
    testTimeout: 8000
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    extensionAlias: {
      '.js': ['.ts', '.js']
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test')
  }
})


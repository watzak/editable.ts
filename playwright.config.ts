import { defineConfig, devices } from '@playwright/test'

const port = 9050
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  timeout: 30_000,
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 920, height: 720 }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  webServer: {
    command: 'npm run dev:e2e',
    url: `${baseURL}/examples/e2e-editor-flows.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})

import { defineConfig, devices } from '@playwright/test'

const port = process.env.PW_TEST_PORT ?? '4173'
const baseURL = process.env.PW_BASE_URL ?? 'http://127.0.0.1:' + port + '/prestique-workspace/'
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.PW_EVIDENCE_DIR ?? 'test-results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 2,
  reporter: [['list'], ['json', { outputFile: (process.env.PW_EVIDENCE_DIR ?? 'test-results') + '/e2e-results.json' }]],
  use: { baseURL, actionTimeout: 8_000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'Desktop Chromium', use: {
      ...devices['Desktop Chrome'],
      channel: process.env.PW_EXECUTABLE ? undefined : process.env.PW_CHANNEL || 'chromium',
      launchOptions: process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {},
    } },
  ],
  webServer: process.env.PW_EXTERNAL_SERVER ? undefined : {
    command: 'npm run preview -- --port ' + port,
    url: baseURL, timeout: 40_000,
    env: { VITE_BASE_PATH: '/prestique-workspace/' },
  },
})


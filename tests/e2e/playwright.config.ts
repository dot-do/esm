/**
 * Playwright Configuration for esm.do E2E Tests
 *
 * This configuration sets up Playwright for API testing against the esm.do worker.
 * We use Playwright's request context for API testing rather than browser testing.
 */

import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables or use defaults.
 */
const BASE_URL = process.env.ESM_BASE_URL || 'http://localhost:8787'
const CI = !!process.env.CI

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: CI,

  /* Retry on CI only */
  retries: CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await request.get('/')`. */
    baseURL: BASE_URL,

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',

    /* Extra HTTP headers for all requests */
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  },

  /* Configure projects for different test scenarios */
  projects: [
    {
      name: 'api',
      testMatch: '**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Global setup and teardown */
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),

  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'test-results/',

  /* Maximum time one test can run for */
  timeout: 30 * 1000,

  /* Maximum time expect() should wait for conditions to be met */
  expect: {
    timeout: 5 * 1000,
  },

  /* Web server configuration - starts wrangler dev before tests */
  webServer: {
    command: 'pnpm wrangler dev --port 8787',
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})

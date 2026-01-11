import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for integration tests
 *
 * Integration tests run against a live Miniflare server and test:
 * - API endpoints (CRUD, execution, versioning)
 * - CLI commands via spawn
 * - Deployment configurations
 * - Performance characteristics
 *
 * These tests are slower and more resource-intensive than unit tests,
 * so they are run separately via `npm run test:integration`.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 60000, // 60 seconds for integration tests
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests serially to avoid port conflicts
      },
    },
    maxConcurrency: 1,
    fileParallelism: false,
    // Retry flaky integration tests once
    retry: 1,
    // Reporter for CI/CD visibility
    reporters: process.env.CI ? ['verbose', 'junit'] : ['verbose'],
    // JUnit output for CI systems
    outputFile: {
      junit: './test-results/integration-junit.xml',
    },
    // Fail fast on first error in CI
    bail: process.env.CI ? 1 : 0,
    // Coverage configuration for integration tests
    coverage: {
      enabled: false, // Coverage is typically not useful for integration tests
      provider: 'v8',
      reportsDirectory: './coverage/integration',
    },
    // Setup file to run before tests
    setupFiles: [],
  },
})

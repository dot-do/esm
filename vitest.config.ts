import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // Redirect ai-evaluate to Node.js version which includes Miniflare fallback
      // The main 'ai-evaluate' export requires Cloudflare worker_loaders binding
      'ai-evaluate': resolve(__dirname, 'node_modules/ai-evaluate/dist/node.js'),
      // Also alias the explicit /node subpath
      'ai-evaluate/node': resolve(__dirname, 'node_modules/ai-evaluate/dist/node.js'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    maxConcurrency: 1,
    fileParallelism: false,
  },
})

// Integration test configuration (used by test:integration script)
export const integrationConfig = defineConfig({
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
    reporters: ['verbose'],
    // Fail fast on first error in CI
    bail: process.env.CI ? 1 : 0,
  },
})

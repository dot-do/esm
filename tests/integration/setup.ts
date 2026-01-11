/**
 * Integration Test Setup
 *
 * Provides test infrastructure for esm.do integration tests using miniflare.
 * Handles server startup, environment configuration, and cleanup.
 */

import { Miniflare, type MiniflareOptions } from 'miniflare'
import { beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import * as esbuild from 'esbuild'

// Cached bundled worker code
let bundledWorkerCode: string | null = null

/**
 * Bundle the worker TypeScript to JavaScript using esbuild
 */
export async function bundleWorker(): Promise<string> {
  if (bundledWorkerCode) return bundledWorkerCode

  const result = await esbuild.build({
    entryPoints: ['src/worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
  })

  bundledWorkerCode = result.outputFiles?.[0]?.text ?? ''
  return bundledWorkerCode
}

// Test server configuration
export interface TestServerConfig {
  port: number
  host: string
  timeout: number
}

// Default test configuration
export const defaultConfig: TestServerConfig = {
  port: 8787,
  host: 'localhost',
  timeout: 30000,
}

// Miniflare instance for integration tests
let miniflare: Miniflare | null = null
let serverUrl: string = ''

/**
 * Create Miniflare options for test environment
 */
export async function createMiniflareOptions(config: Partial<TestServerConfig> = {}): Promise<MiniflareOptions> {
  const mergedConfig = { ...defaultConfig, ...config }
  const script = await bundleWorker()

  return {
    modules: true,
    script,
    compatibilityDate: '2024-01-01',
    compatibilityFlags: ['nodejs_compat'],
    port: mergedConfig.port,
    host: mergedConfig.host,
    bindings: {
      // Provide mock unsafe_eval binding for tests
      // In production, this comes from Cloudflare Workers
    },
    unsafeEvalBinding: 'unsafe_eval',
  }
}

/**
 * Start the test server using Miniflare
 */
export async function startTestServer(config: Partial<TestServerConfig> = {}): Promise<string> {
  const options = await createMiniflareOptions(config)

  try {
    miniflare = new Miniflare(options)

    // Get the URL from miniflare
    const url = await miniflare.ready
    serverUrl = url.origin

    return serverUrl
  } catch (error) {
    console.error('Failed to start test server:', error)
    throw error
  }
}

/**
 * Stop the test server
 */
export async function stopTestServer(): Promise<void> {
  if (miniflare) {
    await miniflare.dispose()
    miniflare = null
    serverUrl = ''
  }
}

/**
 * Get the current test server URL
 */
export function getServerUrl(): string {
  if (!serverUrl) {
    throw new Error('Test server not started. Call startTestServer() first.')
  }
  return serverUrl
}

/**
 * Check if the test server is running
 */
export function isServerRunning(): boolean {
  return miniflare !== null && serverUrl !== ''
}

/**
 * Wait for server to be ready with health check
 */
export async function waitForServerReady(
  url: string = serverUrl,
  timeout: number = 10000,
  interval: number = 100
): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000),
      })
      if (response.ok) {
        return true
      }
    } catch {
      // Server not ready yet, continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  return false
}

/**
 * Create a test request helper for making API calls
 */
export function createTestClient(baseUrl: string = serverUrl) {
  return {
    /**
     * Make a GET request
     */
    async get(path: string, options: RequestInit = {}): Promise<Response> {
      return fetch(`${baseUrl}${path}`, {
        method: 'GET',
        ...options,
      })
    },

    /**
     * Make a POST request with JSON body
     */
    async post(path: string, body?: unknown, options: RequestInit = {}): Promise<Response> {
      return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      })
    },

    /**
     * Make a DELETE request
     */
    async delete(path: string, options: RequestInit = {}): Promise<Response> {
      return fetch(`${baseUrl}${path}`, {
        method: 'DELETE',
        ...options,
      })
    },

    /**
     * Make a request and parse JSON response
     */
    async json<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
      const response = await fetch(`${baseUrl}${path}`, options)
      return response.json() as Promise<T>
    },
  }
}

// Test module fixture data
export const testModules = {
  basic: {
    name: '@test/basic',
    types: 'export declare function hello(name: string): string;',
    module: 'export function hello(name) { return `Hello, ${name}!`; }',
    tests: `
describe('hello', () => {
  it('greets by name', () => {
    expect(hello('World')).toBe('Hello, World!');
  });
});`,
    script: 'return hello("Integration");',
  },

  withDeps: {
    name: '@test/with-deps',
    types: 'export declare function greet(name: string): string;',
    module: `
import { hello } from 'esm.do/@test/basic';
export function greet(name) {
  return hello(name) + ' Nice to meet you!';
}`,
    tests: `
describe('greet', () => {
  it('extends greeting', () => {
    expect(greet('World')).toContain('Hello');
  });
});`,
    script: 'return greet("Test");',
  },

  failing: {
    name: '@test/failing',
    types: 'export declare function fail(): void;',
    module: 'export function fail() { throw new Error("Intentional failure"); }',
    tests: `
describe('fail', () => {
  it('should fail', () => {
    expect(fail()).toBe('never');
  });
});`,
    script: 'fail();',
  },

  async: {
    name: '@test/async',
    types: 'export declare function delay(ms: number): Promise<void>;',
    module: `
export async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}`,
    tests: `
describe('delay', () => {
  it('delays execution', async () => {
    const start = Date.now();
    await delay(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
  });
});`,
    script: 'await delay(10); return "done";',
  },
}

/**
 * Setup integration test environment with beforeAll/afterAll hooks
 */
export function setupIntegrationTests(config: Partial<TestServerConfig> = {}) {
  let url: string

  beforeAll(async () => {
    url = await startTestServer(config)
    const ready = await waitForServerReady(url)
    if (!ready) {
      throw new Error('Test server failed to become ready')
    }
  }, 60000)

  afterAll(async () => {
    await stopTestServer()
  })

  return {
    getUrl: () => url,
    getClient: () => createTestClient(url),
  }
}

/**
 * Create an isolated test environment with fresh state
 */
export function createIsolatedTestEnv() {
  let localMiniflare: Miniflare | null = null
  let localUrl = ''

  return {
    async start(config: Partial<TestServerConfig> = {}): Promise<string> {
      const options = await createMiniflareOptions({
        ...config,
        // Use random port for isolated tests
        port: 0,
      })

      localMiniflare = new Miniflare(options)
      const url = await localMiniflare.ready
      localUrl = url.origin
      return localUrl
    },

    async stop(): Promise<void> {
      if (localMiniflare) {
        await localMiniflare.dispose()
        localMiniflare = null
        localUrl = ''
      }
    },

    getUrl(): string {
      return localUrl
    },

    getClient() {
      return createTestClient(localUrl)
    },
  }
}

/**
 * Test cleanup utilities
 */
export const cleanup = {
  /**
   * Delete test modules created during tests
   */
  async deleteTestModules(client: ReturnType<typeof createTestClient>, modules: string[]) {
    for (const name of modules) {
      try {
        await client.delete(name.replace('@', '/'))
      } catch {
        // Ignore deletion errors for non-existent modules
      }
    }
  },

  /**
   * Reset any mocked timers or state
   */
  resetMocks() {
    vi.clearAllMocks()
    vi.useRealTimers()
  },
}

// Environment variable helpers
export const testEnv = {
  /**
   * Get test environment variable with fallback
   */
  get(key: string, fallback: string = ''): string {
    return process.env[key] || fallback
  },

  /**
   * Check if running in CI environment
   */
  isCI(): boolean {
    return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
  },

  /**
   * Check if integration tests are enabled
   */
  isIntegrationEnabled(): boolean {
    return process.env.SKIP_INTEGRATION !== 'true'
  },
}

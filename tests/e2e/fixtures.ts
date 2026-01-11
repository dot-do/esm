/**
 * Test Fixtures for esm.do E2E Tests
 *
 * Provides reusable test fixtures including:
 * - Server setup/teardown
 * - Test module fixtures
 * - Authentication fixtures
 */

import { test as base, expect, APIRequestContext } from '@playwright/test'

// =============================================================================
// Types
// =============================================================================

/**
 * Test module definition
 */
export interface TestModule {
  name: string
  types: string
  module: string
  tests?: string
  script?: string
}

/**
 * Module response from API
 */
export interface ModuleResponse {
  name: string
  version: string
  files: string[]
  created?: boolean
  updated?: boolean
  testResults?: {
    passed: number
    failed: number
    total: number
    duration: number
  }
}

/**
 * Test execution response
 */
export interface TestResponse {
  passed: number
  failed: number
  total: number
  duration: number
  results: Array<{
    name: string
    status: 'passed' | 'failed'
    duration?: number
    error?: string
  }>
}

/**
 * Script execution response
 */
export interface RunResponse {
  result: unknown
  logs: Array<{ level: string; args: unknown[] }>
  duration: number
}

/**
 * Authentication token for protected operations
 */
export interface AuthToken {
  token: string
  type: 'Bearer' | 'Basic'
}

// =============================================================================
// Test Module Fixtures
// =============================================================================

/**
 * Pre-defined test modules for E2E testing
 */
export const testModules = {
  /**
   * Simple add function module
   */
  add: {
    name: '@e2e/add',
    types: 'export declare function add(a: number, b: number): number;',
    module: 'export function add(a, b) { return a + b; }',
    tests: `
describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('adds negative numbers', () => {
    expect(add(-1, 1)).toBe(0);
  });
  it('adds zero', () => {
    expect(add(0, 5)).toBe(5);
  });
});
`,
    script: 'return add(10, 20);',
  },

  /**
   * Multiply function module
   */
  multiply: {
    name: '@e2e/multiply',
    types: 'export declare function multiply(a: number, b: number): number;',
    module: 'export function multiply(a, b) { return a * b; }',
    tests: `
describe('multiply', () => {
  it('multiplies two numbers', () => {
    expect(multiply(3, 4)).toBe(12);
  });
});
`,
    script: 'return multiply(5, 6);',
  },

  /**
   * Module with failing tests
   */
  failing: {
    name: '@e2e/failing',
    types: 'export declare function getValue(): number;',
    module: 'export function getValue() { return 42; }',
    tests: `
describe('getValue', () => {
  it('should fail', () => {
    expect(getValue()).toBe(100);
  });
});
`,
    script: 'return getValue();',
  },

  /**
   * Module with console logging in script
   */
  logging: {
    name: '@e2e/logging',
    types: 'export declare function greet(name: string): string;',
    module: `export function greet(name) {
  console.log('Greeting:', name);
  return 'Hello, ' + name + '!';
}`,
    tests: `
describe('greet', () => {
  it('greets correctly', () => {
    expect(greet('World')).toBe('Hello, World!');
  });
});
`,
    script: `
console.log('Starting script');
const result = greet('E2E');
console.log('Result:', result);
return result;
`,
  },

  /**
   * Protected module (requires auth)
   */
  protected: {
    name: '@protected/secret',
    types: 'export declare const secret: string;',
    module: 'export const secret = "top-secret-value";',
    tests: `
describe('secret', () => {
  it('has a value', () => {
    expect(secret).toBeDefined();
  });
});
`,
    script: 'return secret;',
  },
} satisfies Record<string, TestModule>

// =============================================================================
// Fixture Types
// =============================================================================

interface TestFixtures {
  /** API request context with base configuration */
  api: APIRequestContext

  /** Helper to create a test module */
  createModule: (module: TestModule) => Promise<ModuleResponse>

  /** Helper to delete a test module */
  deleteModule: (name: string) => Promise<void>

  /** Helper to run module tests */
  runTests: (name: string) => Promise<TestResponse>

  /** Helper to execute module script */
  runScript: (name: string, input?: Record<string, unknown>) => Promise<RunResponse>

  /** Get auth headers for protected operations */
  authHeaders: (token?: AuthToken) => Record<string, string>

  /** Clean up modules created during test */
  cleanup: Set<string>
}

// =============================================================================
// Extended Test with Fixtures
// =============================================================================

export const test = base.extend<TestFixtures>({
  /**
   * API request context - reuses the default context
   */
  api: async ({ request }, use) => {
    await use(request)
  },

  /**
   * Create a module via the API
   */
  createModule: async ({ request, cleanup }, use) => {
    const createModule = async (module: TestModule): Promise<ModuleResponse> => {
      const response = await request.post(`/${module.name.replace('@', '')}`, {
        data: {
          types: module.types,
          module: module.module,
          tests: module.tests,
          script: module.script,
        },
      })

      expect(response.ok()).toBeTruthy()
      const data = await response.json()

      // Track for cleanup
      cleanup.add(module.name)

      return data as ModuleResponse
    }

    await use(createModule)
  },

  /**
   * Delete a module via the API
   */
  deleteModule: async ({ request, cleanup }, use) => {
    const deleteModule = async (name: string): Promise<void> => {
      const response = await request.delete(`/${name.replace('@', '')}`)
      // 404 is acceptable if module doesn't exist
      expect([200, 404]).toContain(response.status())

      // Remove from cleanup tracking
      cleanup.delete(name)
    }

    await use(deleteModule)
  },

  /**
   * Run tests for a module
   */
  runTests: async ({ request }, use) => {
    const runTests = async (name: string): Promise<TestResponse> => {
      const response = await request.post(`/${name.replace('@', '')}/test`)
      expect(response.ok()).toBeTruthy()
      return await response.json() as TestResponse
    }

    await use(runTests)
  },

  /**
   * Execute a module's script
   */
  runScript: async ({ request }, use) => {
    const runScript = async (
      name: string,
      input?: Record<string, unknown>
    ): Promise<RunResponse> => {
      const response = await request.post(`/${name.replace('@', '')}/run`, {
        data: input ? { input } : undefined,
      })
      expect(response.ok()).toBeTruthy()
      return await response.json() as RunResponse
    }

    await use(runScript)
  },

  /**
   * Get authentication headers
   */
  authHeaders: async ({}, use) => {
    const authHeaders = (token?: AuthToken): Record<string, string> => {
      if (!token) {
        // Use default test token
        return { Authorization: 'Bearer test-token' }
      }
      return { Authorization: `${token.type} ${token.token}` }
    }

    await use(authHeaders)
  },

  /**
   * Cleanup tracking - automatically cleans up modules after each test
   */
  cleanup: async ({ request }, use) => {
    const cleanup = new Set<string>()

    await use(cleanup)

    // Cleanup after test
    for (const name of cleanup) {
      try {
        await request.delete(`/${name.replace('@', '')}`)
      } catch {
        // Ignore cleanup errors
      }
    }
  },
})

// Re-export expect for convenience
export { expect }

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique module name for testing
 */
export function uniqueModuleName(prefix: string = 'test'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)
  return `@e2e/${prefix}-${timestamp}-${random}`
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100 } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      return await fn()
    } catch {
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }

  throw new Error(`waitFor timed out after ${timeout}ms`)
}

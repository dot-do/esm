/**
 * esm.do - Execution Routes Tests
 *
 * RED PHASE: These tests are designed to FAIL until execution routes are extracted
 * from src/api/worker.ts into src/routes/execution.ts
 *
 * Issue: esm-arch.2 - Execution routes extraction
 * Tests for /run and /test handlers
 *
 * The goal is to extract handleRunScript and handleRunTests into a dedicated
 * routes module that can be tested independently of the worker.
 */

import { describe, it, expect, beforeEach } from 'vitest'

// =============================================================================
// Module Export Tests
// These tests verify that execution routes are properly exported
// =============================================================================

describe('Execution Routes Module Exports', () => {
  it('should export handleRunScript function from routes/execution', async () => {
    // RED: This will fail because src/routes/execution.ts doesn't exist yet
    const execution = await import('../../src/routes/execution')

    expect(execution.handleRunScript).toBeDefined()
    expect(typeof execution.handleRunScript).toBe('function')
  })

  it('should export handleRunTests function from routes/execution', async () => {
    // RED: This will fail because src/routes/execution.ts doesn't exist yet
    const execution = await import('../../src/routes/execution')

    expect(execution.handleRunTests).toBeDefined()
    expect(typeof execution.handleRunTests).toBe('function')
  })

  it('should export ExecutionRouteContext type', async () => {
    // RED: The module should export a context type for dependency injection
    const execution = await import('../../src/routes/execution')

    // Type exports can be verified by checking if createContext exists
    expect(execution.createExecutionContext).toBeDefined()
    expect(typeof execution.createExecutionContext).toBe('function')
  })

  it('should export RunScriptOptions type', async () => {
    // RED: The module should export types for run options
    const execution = await import('../../src/routes/execution')

    expect(execution.isRunScriptOptions).toBeDefined()
    expect(typeof execution.isRunScriptOptions).toBe('function')
  })

  it('should export RunTestsOptions type', async () => {
    // RED: The module should export types for test options
    const execution = await import('../../src/routes/execution')

    expect(execution.isRunTestsOptions).toBeDefined()
    expect(typeof execution.isRunTestsOptions).toBe('function')
  })
})

// =============================================================================
// handleRunScript Tests
// Tests for the /run endpoint handler
// =============================================================================

describe('handleRunScript', () => {
  let mockStorage: {
    read: (name: string, version?: string) => Promise<{
      name: string
      types: string
      module: string
      tests: string
      script: string
      version?: string
    } | null>
    write: (name: string, data: unknown) => Promise<{ version: string; name: string }>
    delete: (name: string) => Promise<void>
    list: (pattern?: string) => Promise<string[]>
    versions: (name: string, limit?: number) => Promise<Array<{ version: string; message: string; timestamp: Date }>>
  }

  let mockExecutor: {
    run: (moduleCode: string, scriptCode: string, args?: Record<string, unknown>, timeout?: number) => Promise<{
      success: boolean
      value?: unknown
      error?: string
      logs: Array<{ level: string; args: unknown[] }>
      duration: number
    }>
  }

  beforeEach(() => {
    // Create mock storage with test module
    mockStorage = {
      read: async (name: string) => {
        if (name === '@test/runnable') {
          return {
            name: '@test/runnable',
            types: 'export declare function double(n: number): number',
            module: 'export function double(n) { return n * 2 }',
            tests: '',
            script: 'return double(21)',
            version: 'abc123',
          }
        }
        if (name === '@test/with-args') {
          return {
            name: '@test/with-args',
            types: 'export declare function greet(name: string): string',
            module: 'export function greet(name) { return "Hello, " + name }',
            tests: '',
            script: 'return greet(args.name)',
            version: 'def456',
          }
        }
        if (name === '@test/logging') {
          return {
            name: '@test/logging',
            types: 'export declare function log(msg: string): void',
            module: 'export function log(msg) { console.log(msg) }',
            tests: '',
            script: 'log("test message"); return true',
            version: 'ghi789',
          }
        }
        if (name === '@test/no-script') {
          return {
            name: '@test/no-script',
            types: 'export declare const X: number',
            module: 'export const X = 1',
            tests: '',
            script: '',
            version: 'jkl012',
          }
        }
        if (name === '@test/error-script') {
          return {
            name: '@test/error-script',
            types: 'export declare function crash(): never',
            module: 'export function crash() { throw new Error("intentional") }',
            tests: '',
            script: 'crash()',
            version: 'mno345',
          }
        }
        return null
      },
      write: async () => ({ version: 'new123', name: 'test' }),
      delete: async () => {},
      list: async () => [],
      versions: async () => [],
    }

    // Create mock executor
    mockExecutor = {
      run: async (moduleCode: string, scriptCode: string, args?: Record<string, unknown>) => {
        // Simple mock execution
        if (moduleCode.includes('double') && scriptCode.includes('return double(21)')) {
          return {
            success: true,
            value: 42,
            logs: [],
            duration: 10,
          }
        }
        if (moduleCode.includes('greet') && args?.name) {
          return {
            success: true,
            value: `Hello, ${args.name}`,
            logs: [],
            duration: 5,
          }
        }
        if (moduleCode.includes('console.log')) {
          return {
            success: true,
            value: true,
            logs: [{ level: 'log', args: ['test message'] }],
            duration: 3,
          }
        }
        if (moduleCode.includes('crash')) {
          return {
            success: false,
            error: 'intentional',
            logs: [],
            duration: 1,
          }
        }
        return {
          success: true,
          value: undefined,
          logs: [],
          duration: 0,
        }
      },
    }
  })

  it('should execute module script and return result', async () => {
    // RED: Import will fail until routes/execution.ts exists
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunScript('@test/runnable', context)

    expect(result.success).toBe(true)
    expect(result.value).toBe(42)
  })

  it('should pass arguments to script execution', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunScript('@test/with-args', context, {
      input: { name: 'World' },
    })

    expect(result.success).toBe(true)
    expect(result.value).toBe('Hello, World')
  })

  it('should capture console output in logs', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunScript('@test/logging', context)

    expect(result.success).toBe(true)
    expect(result.value).toBe(true)
    expect(result.logs).toBeDefined()
    expect(result.logs.length).toBeGreaterThan(0)
    expect(result.logs[0].args).toContain('test message')
  })

  it('should return error if module not found', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunScript('@test/nonexistent', context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('should return error if module has no script', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunScript('@test/no-script', context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('no script')
  })

  it('should handle script execution errors', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunScript('@test/error-script', context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('intentional')
  })

  it('should respect timeout option', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const timeoutExecutor = {
      run: async (_module: string, _script: string, _args?: Record<string, unknown>, timeout?: number) => {
        // Verify timeout was passed
        expect(timeout).toBe(1000)
        return {
          success: true,
          value: 'ok',
          logs: [],
          duration: 100,
        }
      },
    }

    const context = createExecutionContext({
      storage: mockStorage,
      executor: timeoutExecutor,
    })

    const result = await handleRunScript('@test/runnable', context, {
      timeout: 1000,
    })

    expect(result.success).toBe(true)
  })

  it('should include duration in result', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunScript('@test/runnable', context)

    expect(result.duration).toBeDefined()
    expect(typeof result.duration).toBe('number')
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })
})

// =============================================================================
// handleRunTests Tests
// Tests for the /test endpoint handler
// =============================================================================

describe('handleRunTests', () => {
  let mockStorage: {
    read: (name: string, version?: string) => Promise<{
      name: string
      types: string
      module: string
      tests: string
      script: string
      version?: string
    } | null>
    write: (name: string, data: unknown) => Promise<{ version: string; name: string }>
    delete: (name: string) => Promise<void>
    list: (pattern?: string) => Promise<string[]>
    versions: (name: string, limit?: number) => Promise<Array<{ version: string; message: string; timestamp: Date }>>
  }

  let mockExecutor: {
    test: (moduleCode: string, testCode: string, timeout?: number) => Promise<{
      passed: number
      failed: number
      total: number
      duration: number
      tests: Array<{
        name: string
        status: 'passed' | 'failed'
        duration?: number
        error?: string
      }>
    }>
  }

  beforeEach(() => {
    mockStorage = {
      read: async (name: string) => {
        if (name === '@test/testable') {
          return {
            name: '@test/testable',
            types: 'export declare function add(a: number, b: number): number',
            module: 'export function add(a, b) { return a + b }',
            tests: `
              describe('add', () => {
                it('adds positive numbers', () => expect(add(2, 3)).toBe(5))
                it('adds negative numbers', () => expect(add(-1, -2)).toBe(-3))
                it('adds zero', () => expect(add(0, 5)).toBe(5))
              })
            `,
            script: '',
            version: 'abc123',
          }
        }
        if (name === '@test/failing') {
          return {
            name: '@test/failing',
            types: 'export declare function broken(): number',
            module: 'export function broken() { return 1 }',
            tests: `
              describe('broken', () => {
                it('should return 42', () => expect(broken()).toBe(42))
                it('should return 1', () => expect(broken()).toBe(1))
              })
            `,
            script: '',
            version: 'def456',
          }
        }
        if (name === '@test/no-tests') {
          return {
            name: '@test/no-tests',
            types: 'export declare const X: number',
            module: 'export const X = 1',
            tests: '',
            script: '',
            version: 'ghi789',
          }
        }
        return null
      },
      write: async () => ({ version: 'new123', name: 'test' }),
      delete: async () => {},
      list: async () => [],
      versions: async () => [],
    }

    mockExecutor = {
      test: async (moduleCode: string, testCode: string) => {
        if (moduleCode.includes('add') && testCode.includes('adds positive')) {
          return {
            passed: 3,
            failed: 0,
            total: 3,
            duration: 15,
            tests: [
              { name: 'add > adds positive numbers', status: 'passed', duration: 5 },
              { name: 'add > adds negative numbers', status: 'passed', duration: 5 },
              { name: 'add > adds zero', status: 'passed', duration: 5 },
            ],
          }
        }
        if (moduleCode.includes('broken')) {
          return {
            passed: 1,
            failed: 1,
            total: 2,
            duration: 10,
            tests: [
              { name: 'broken > should return 42', status: 'failed', duration: 5, error: 'Expected 42 but got 1' },
              { name: 'broken > should return 1', status: 'passed', duration: 5 },
            ],
          }
        }
        return {
          passed: 0,
          failed: 0,
          total: 0,
          duration: 0,
          tests: [],
        }
      },
    }
  })

  it('should run module tests and return results', async () => {
    // RED: Import will fail until routes/execution.ts exists
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunTests('@test/testable', context)

    expect(result.passed).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.total).toBe(3)
  })

  it('should report failing tests', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunTests('@test/failing', context)

    expect(result.passed).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.total).toBe(2)
  })

  it('should include detailed test results', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunTests('@test/testable', context)

    expect(result.tests).toBeDefined()
    expect(result.tests.length).toBe(3)
    expect(result.tests[0].name).toContain('adds positive numbers')
    expect(result.tests[0].status).toBe('passed')
  })

  it('should include error details for failed tests', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunTests('@test/failing', context)

    const failedTest = result.tests.find((t: { status: string }) => t.status === 'failed')
    expect(failedTest).toBeDefined()
    expect(failedTest?.error).toContain('Expected 42')
  })

  it('should return error if module not found', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    // This should throw or return an error result
    await expect(handleRunTests('@test/nonexistent', context)).rejects.toThrow(/not found/i)
  })

  it('should return error if module has no tests', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    await expect(handleRunTests('@test/no-tests', context)).rejects.toThrow(/no tests/i)
  })

  it('should respect timeout option', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const timeoutExecutor = {
      test: async (_module: string, _tests: string, timeout?: number) => {
        expect(timeout).toBe(5000)
        return {
          passed: 1,
          failed: 0,
          total: 1,
          duration: 100,
          tests: [{ name: 'test', status: 'passed' as const, duration: 100 }],
        }
      },
    }

    const context = createExecutionContext({
      storage: mockStorage,
      executor: timeoutExecutor,
    })

    const result = await handleRunTests('@test/testable', context, {
      timeout: 5000,
    })

    expect(result.passed).toBe(1)
  })

  it('should include duration in result', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const context = createExecutionContext({
      storage: mockStorage,
      executor: mockExecutor,
    })

    const result = await handleRunTests('@test/testable', context)

    expect(result.duration).toBeDefined()
    expect(typeof result.duration).toBe('number')
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('should support test filtering by name pattern', async () => {
    const { handleRunTests, createExecutionContext } = await import('../../src/routes/execution')

    const filterExecutor = {
      test: async (_module: string, tests: string, _timeout?: number, filter?: string) => {
        expect(filter).toBe('positive')
        return {
          passed: 1,
          failed: 0,
          total: 1,
          duration: 5,
          tests: [{ name: 'add > adds positive numbers', status: 'passed' as const, duration: 5 }],
        }
      },
    }

    const context = createExecutionContext({
      storage: mockStorage,
      executor: filterExecutor,
    })

    const result = await handleRunTests('@test/testable', context, {
      filter: 'positive',
    })

    expect(result.total).toBe(1)
    expect(result.tests[0].name).toContain('positive')
  })
})

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('Execution Route Type Guards', () => {
  it('isRunScriptOptions should validate run options', async () => {
    const { isRunScriptOptions } = await import('../../src/routes/execution')

    // Valid options
    expect(isRunScriptOptions({ input: { x: 1 } })).toBe(true)
    expect(isRunScriptOptions({ timeout: 5000 })).toBe(true)
    expect(isRunScriptOptions({ input: {}, timeout: 1000 })).toBe(true)
    expect(isRunScriptOptions({})).toBe(true)

    // Invalid options
    expect(isRunScriptOptions(null)).toBe(false)
    expect(isRunScriptOptions(undefined)).toBe(false)
    expect(isRunScriptOptions('string')).toBe(false)
    expect(isRunScriptOptions({ timeout: 'not a number' })).toBe(false)
  })

  it('isRunTestsOptions should validate test options', async () => {
    const { isRunTestsOptions } = await import('../../src/routes/execution')

    // Valid options
    expect(isRunTestsOptions({ timeout: 5000 })).toBe(true)
    expect(isRunTestsOptions({ filter: 'add' })).toBe(true)
    expect(isRunTestsOptions({})).toBe(true)

    // Invalid options
    expect(isRunTestsOptions(null)).toBe(false)
    expect(isRunTestsOptions(undefined)).toBe(false)
    expect(isRunTestsOptions('string')).toBe(false)
    expect(isRunTestsOptions({ filter: 123 })).toBe(false)
  })
})

// =============================================================================
// Integration with Storage Tests
// =============================================================================

describe('Execution Routes Storage Integration', () => {
  it('should work with version-specific module reads', async () => {
    const { handleRunScript, createExecutionContext } = await import('../../src/routes/execution')

    const versionedStorage = {
      read: async (name: string, version?: string) => {
        if (name === '@test/versioned' && version === 'v1.0.0') {
          return {
            name: '@test/versioned',
            types: 'export declare const VERSION: string',
            module: 'export const VERSION = "1.0.0"',
            tests: '',
            script: 'return VERSION',
            version: 'v1.0.0',
          }
        }
        if (name === '@test/versioned' && !version) {
          return {
            name: '@test/versioned',
            types: 'export declare const VERSION: string',
            module: 'export const VERSION = "2.0.0"',
            tests: '',
            script: 'return VERSION',
            version: 'v2.0.0',
          }
        }
        return null
      },
      write: async () => ({ version: 'new', name: 'test' }),
      delete: async () => {},
      list: async () => [],
      versions: async () => [],
    }

    const mockExecutor = {
      run: async (module: string) => ({
        success: true,
        value: module.includes('1.0.0') ? '1.0.0' : '2.0.0',
        logs: [],
        duration: 1,
      }),
    }

    const context = createExecutionContext({
      storage: versionedStorage,
      executor: mockExecutor,
    })

    // Run specific version
    const v1Result = await handleRunScript('@test/versioned', context, {
      version: 'v1.0.0',
    })
    expect(v1Result.value).toBe('1.0.0')

    // Run latest version
    const latestResult = await handleRunScript('@test/versioned', context)
    expect(latestResult.value).toBe('2.0.0')
  })
})

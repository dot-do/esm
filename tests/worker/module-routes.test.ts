/**
 * RED Tests for Module Routes Extraction
 *
 * Issue: esm-arch.1 - Test isolated route handlers for GET/POST/DELETE
 *
 * These tests verify that module route handlers can be extracted and tested
 * in isolation, separate from the main fetch handler. This enables:
 * - Unit testing individual route handlers without HTTP overhead
 * - Mocking dependencies for isolated testing
 * - Better separation of concerns
 * - Easier maintenance and refactoring
 *
 * These tests are designed to FAIL until the route handlers are extracted
 * from src/api/worker.ts into separate, testable modules.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// These imports should exist after route extraction
// They will fail to import until the routes are extracted
import {
  handleGetModuleInfo,
  handleGetTypes,
  handleGetModule,
  handleGetTests,
  handleGetScript,
  handleCreateModule,
  handleRunTests,
  handleRunScript,
  handleDeleteModule,
} from '../../src/worker/routes/module.js'

import type { ModuleStorage, StoredModule } from '../../src/storage/types.js'

// =============================================================================
// Mock Storage for Isolated Testing
// =============================================================================
function createMockStorage(): ModuleStorage {
  const modules = new Map<string, StoredModule>()

  return {
    async read(name: string, version?: string): Promise<StoredModule | null> {
      return modules.get(name) || null
    },
    async write(name: string, data: StoredModule): Promise<{ version: string; name: string }> {
      modules.set(name, { ...data, version: 'mock-sha-123' })
      return { version: 'mock-sha-123', name }
    },
    async delete(name: string): Promise<void> {
      modules.delete(name)
    },
    async list(pattern?: string): Promise<string[]> {
      return Array.from(modules.keys())
    },
    async versions(name: string): Promise<any[]> {
      return [{ version: 'mock-sha-123', message: 'test', timestamp: new Date() }]
    },
    createTag: vi.fn(),
    getCommit: vi.fn().mockResolvedValue({ timestamp: Date.now(), message: 'test' }),
  }
}

// =============================================================================
// GET Module Info Route Handler Tests
// =============================================================================
describe('GET Module Info Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetModuleInfo).toBe('function')
  })

  it('should accept storage as a dependency', async () => {
    // Pre-populate storage
    await storage.write('@test/module', {
      name: '@test/module',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetModuleInfo({
      fullName: '@test/module',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('name', '@test/module')
  })

  it('should return module metadata with proper structure', async () => {
    await storage.write('@math/add', {
      name: '@math/add',
      types: 'export declare function add(a: number, b: number): number',
      module: 'export function add(a, b) { return a + b }',
      tests: 'describe("add", () => {})',
      script: 'return add(1, 2)',
    })

    const result = await handleGetModuleInfo({
      fullName: '@math/add',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('name', '@math/add')
    expect(result.data).toHaveProperty('version')
    expect(result.data).toHaveProperty('files')
    expect(result.data.files).toContain('index.d.ts')
    expect(result.data.files).toContain('index.mjs')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleGetModuleInfo({
      fullName: '@nonexistent/module',
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('not found')
  })

  it('should support version parameter', async () => {
    await storage.write('@test/versioned', {
      name: '@test/versioned',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetModuleInfo({
      fullName: '@test/versioned',
      version: 'mock-sha-123',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('version', 'mock-sha-123')
  })
})

// =============================================================================
// GET Types Route Handler Tests
// =============================================================================
describe('GET Types Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetTypes).toBe('function')
  })

  it('should return TypeScript declaration content', async () => {
    const types = 'export declare function greet(name: string): string'
    await storage.write('@test/typed', {
      name: '@test/typed',
      types,
      module: 'export function greet(name) { return "Hello " + name }',
      tests: '',
      script: '',
    })

    const result = await handleGetTypes({
      fullName: '@test/typed',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.content).toBe(types)
    expect(result.contentType).toBe('application/typescript')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleGetTypes({
      fullName: '@nonexistent/module',
      storage,
    })

    expect(result.status).toBe(404)
  })

  it('should include caching headers', async () => {
    await storage.write('@test/cached', {
      name: '@test/cached',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetTypes({
      fullName: '@test/cached',
      storage,
    })

    expect(result.headers).toHaveProperty('Cache-Control')
    expect(result.headers).toHaveProperty('ETag')
  })
})

// =============================================================================
// GET Module Route Handler Tests
// =============================================================================
describe('GET Module Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetModule).toBe('function')
  })

  it('should return ESM module content', async () => {
    const moduleCode = 'export function double(x) { return x * 2 }'
    await storage.write('@test/esm', {
      name: '@test/esm',
      types: 'export declare function double(x: number): number',
      module: moduleCode,
      tests: '',
      script: '',
    })

    const result = await handleGetModule({
      fullName: '@test/esm',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.content).toContain('export function double')
    expect(result.contentType).toBe('application/javascript')
  })

  it('should resolve esm.do imports to full URLs', async () => {
    const moduleCode = `import { add } from 'esm.do/@math/add'
export function sum(nums) { return nums.reduce(add, 0) }`

    await storage.write('@test/imports', {
      name: '@test/imports',
      types: 'export declare function sum(nums: number[]): number',
      module: moduleCode,
      tests: '',
      script: '',
    })

    const result = await handleGetModule({
      fullName: '@test/imports',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.content).toContain('https://esm.do/')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleGetModule({
      fullName: '@nonexistent/module',
      storage,
    })

    expect(result.status).toBe(404)
  })
})

// =============================================================================
// GET Tests Route Handler Tests
// =============================================================================
describe('GET Tests Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetTests).toBe('function')
  })

  it('should return test file content', async () => {
    const testCode = `describe('myFunc', () => {
  it('works correctly', () => {
    expect(myFunc(1)).toBe(2)
  })
})`
    await storage.write('@test/tests', {
      name: '@test/tests',
      types: 'export declare function myFunc(x: number): number',
      module: 'export function myFunc(x) { return x * 2 }',
      tests: testCode,
      script: '',
    })

    const result = await handleGetTests({
      fullName: '@test/tests',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.content).toBe(testCode)
    expect(result.contentType).toBe('application/javascript')
  })
})

// =============================================================================
// GET Script Route Handler Tests
// =============================================================================
describe('GET Script Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetScript).toBe('function')
  })

  it('should return script file content', async () => {
    const scriptCode = 'return myFunc(42)'
    await storage.write('@test/script', {
      name: '@test/script',
      types: 'export declare function myFunc(x: number): number',
      module: 'export function myFunc(x) { return x * 2 }',
      tests: '',
      script: scriptCode,
    })

    const result = await handleGetScript({
      fullName: '@test/script',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.content).toBe(scriptCode)
    expect(result.contentType).toBe('application/javascript')
  })
})

// =============================================================================
// POST Create Module Route Handler Tests
// =============================================================================
describe('POST Create Module Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleCreateModule).toBe('function')
  })

  it('should create a new module', async () => {
    const result = await handleCreateModule({
      fullName: '@test/new',
      body: {
        types: 'export declare const x: number',
        module: 'export const x = 1',
      },
      storage,
    })

    expect(result.status).toBe(201)
    expect(result.data).toHaveProperty('name', '@test/new')
    expect(result.data).toHaveProperty('version')
    expect(result.data).toHaveProperty('created', true)
  })

  it('should update an existing module', async () => {
    // First create
    await handleCreateModule({
      fullName: '@test/update',
      body: {
        types: 'export declare const x: number',
        module: 'export const x = 1',
      },
      storage,
    })

    // Then update
    const result = await handleCreateModule({
      fullName: '@test/update',
      body: {
        types: 'export declare const x: number',
        module: 'export const x = 2',
      },
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('updated', true)
  })

  it('should validate required fields', async () => {
    const result = await handleCreateModule({
      fullName: '@test/invalid',
      body: {
        module: 'export const x = 1',
        // Missing types
      },
      storage,
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('types')
  })

  it('should run tests if provided', async () => {
    const result = await handleCreateModule({
      fullName: '@test/withtests',
      body: {
        types: 'export declare function add(a: number, b: number): number',
        module: 'export function add(a, b) { return a + b }',
        tests: `describe('add', () => { it('works', () => expect(add(1,2)).toBe(3)) })`,
      },
      storage,
      executor: {
        runTests: vi.fn().mockResolvedValue({ passed: 1, failed: 0, total: 1, duration: 10, tests: [] }),
      },
    })

    expect(result.status).toBe(201)
    expect(result.data).toHaveProperty('testResults')
    expect(result.data.testResults).toHaveProperty('passed', 1)
  })

  it('should reject modules with failing tests by default', async () => {
    const result = await handleCreateModule({
      fullName: '@test/failing',
      body: {
        types: 'export declare function add(a: number, b: number): number',
        module: 'export function add(a, b) { return a - b }', // Bug
        tests: `describe('add', () => { it('works', () => expect(add(2,3)).toBe(5)) })`,
      },
      storage,
      executor: {
        runTests: vi.fn().mockResolvedValue({
          passed: 0,
          failed: 1,
          total: 1,
          duration: 10,
          tests: [{ name: 'add works', status: 'failed', error: 'Expected 5 but got -1' }],
        }),
      },
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('Tests failed')
  })

  it('should allow force save with failing tests', async () => {
    const result = await handleCreateModule({
      fullName: '@test/forcefailing',
      body: {
        types: 'export declare function add(a: number, b: number): number',
        module: 'export function add(a, b) { return a - b }',
        tests: `describe('add', () => { it('works', () => expect(add(2,3)).toBe(5)) })`,
        options: { force: true },
      },
      storage,
      executor: {
        runTests: vi.fn().mockResolvedValue({ passed: 0, failed: 1, total: 1, duration: 10, tests: [] }),
      },
    })

    expect(result.status).toBe(201)
    expect(result.data).toHaveProperty('warning')
  })
})

// =============================================================================
// POST Run Tests Route Handler Tests
// =============================================================================
describe('POST Run Tests Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleRunTests).toBe('function')
  })

  it('should run module tests and return results', async () => {
    await storage.write('@test/runnable', {
      name: '@test/runnable',
      types: 'export declare function add(a: number, b: number): number',
      module: 'export function add(a, b) { return a + b }',
      tests: `describe('add', () => { it('works', () => expect(add(1,2)).toBe(3)) })`,
      script: '',
    })

    const mockExecutor = {
      runTests: vi.fn().mockResolvedValue({
        passed: 1,
        failed: 0,
        total: 1,
        duration: 50,
        tests: [{ name: 'add > works', status: 'passed', duration: 5 }],
      }),
    }

    const result = await handleRunTests({
      fullName: '@test/runnable',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('passed', 1)
    expect(result.data).toHaveProperty('failed', 0)
    expect(result.data).toHaveProperty('total', 1)
    expect(result.data).toHaveProperty('results')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleRunTests({
      fullName: '@nonexistent/module',
      storage,
      executor: { runTests: vi.fn() },
    })

    expect(result.status).toBe(404)
  })

  it('should support timeout option', async () => {
    await storage.write('@test/timeout', {
      name: '@test/timeout',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: 'describe("x", () => {})',
      script: '',
    })

    const mockExecutor = {
      runTests: vi.fn().mockResolvedValue({ passed: 0, failed: 0, total: 0, duration: 0, tests: [] }),
    }

    await handleRunTests({
      fullName: '@test/timeout',
      storage,
      executor: mockExecutor,
      timeout: 100,
    })

    expect(mockExecutor.runTests).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      100
    )
  })
})

// =============================================================================
// POST Run Script Route Handler Tests
// =============================================================================
describe('POST Run Script Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleRunScript).toBe('function')
  })

  it('should execute module script and return result', async () => {
    await storage.write('@test/executable', {
      name: '@test/executable',
      types: 'export declare function compute(x: number): number',
      module: 'export function compute(x) { return x * x }',
      tests: '',
      script: 'return compute(7)',
    })

    const mockExecutor = {
      runScript: vi.fn().mockResolvedValue({
        success: true,
        value: 49,
        logs: [],
        duration: 10,
      }),
    }

    const result = await handleRunScript({
      fullName: '@test/executable',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('result', 49)
    expect(result.data).toHaveProperty('duration')
  })

  it('should pass input parameters to script', async () => {
    await storage.write('@test/withinput', {
      name: '@test/withinput',
      types: 'export declare function greet(name: string): string',
      module: 'export function greet(name) { return "Hello " + name }',
      tests: '',
      script: 'return greet(args.name)',
    })

    const mockExecutor = {
      runScript: vi.fn().mockResolvedValue({
        success: true,
        value: 'Hello World',
        logs: [],
        duration: 5,
      }),
    }

    const result = await handleRunScript({
      fullName: '@test/withinput',
      storage,
      executor: mockExecutor,
      input: { name: 'World' },
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('result', 'Hello World')
  })

  it('should capture console output', async () => {
    await storage.write('@test/logs', {
      name: '@test/logs',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: 'console.log("hello"); return x',
    })

    const mockExecutor = {
      runScript: vi.fn().mockResolvedValue({
        success: true,
        value: 1,
        logs: [{ level: 'log', args: ['hello'] }],
        duration: 5,
      }),
    }

    const result = await handleRunScript({
      fullName: '@test/logs',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('logs')
    expect(result.data.logs).toHaveLength(1)
  })

  it('should handle script errors', async () => {
    await storage.write('@test/error', {
      name: '@test/error',
      types: 'export declare function boom(): never',
      module: 'export function boom() { throw new Error("Kaboom") }',
      tests: '',
      script: 'boom()',
    })

    const mockExecutor = {
      runScript: vi.fn().mockResolvedValue({
        success: false,
        error: 'Kaboom',
        logs: [],
        duration: 5,
      }),
    }

    const result = await handleRunScript({
      fullName: '@test/error',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(500)
    expect(result.error).toContain('Kaboom')
  })
})

// =============================================================================
// DELETE Module Route Handler Tests
// =============================================================================
describe('DELETE Module Route Handler', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleDeleteModule).toBe('function')
  })

  it('should delete an existing module', async () => {
    await storage.write('@test/todelete', {
      name: '@test/todelete',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDeleteModule({
      fullName: '@test/todelete',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('deleted', true)
    expect(result.data).toHaveProperty('name', '@test/todelete')

    // Verify it's deleted
    const module = await storage.read('@test/todelete')
    expect(module).toBeNull()
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleDeleteModule({
      fullName: '@nonexistent/module',
      storage,
    })

    expect(result.status).toBe(404)
  })

  it('should return commit info for deletion', async () => {
    await storage.write('@test/deletecommit', {
      name: '@test/deletecommit',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDeleteModule({
      fullName: '@test/deletecommit',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('commit')
    expect(result.data.commit).toHaveProperty('sha')
    expect(result.data.commit).toHaveProperty('message')
    expect(result.data.commit.message).toMatch(/delete/i)
  })
})

// =============================================================================
// Route Handler Interface Tests
// =============================================================================
describe('Route Handler Interface', () => {
  it('should export all route handlers from a single module', async () => {
    // This verifies that all handlers are exported from a single entry point
    const handlers = await import('../../src/worker/routes/module.js')

    expect(handlers).toHaveProperty('handleGetModuleInfo')
    expect(handlers).toHaveProperty('handleGetTypes')
    expect(handlers).toHaveProperty('handleGetModule')
    expect(handlers).toHaveProperty('handleGetTests')
    expect(handlers).toHaveProperty('handleGetScript')
    expect(handlers).toHaveProperty('handleCreateModule')
    expect(handlers).toHaveProperty('handleRunTests')
    expect(handlers).toHaveProperty('handleRunScript')
    expect(handlers).toHaveProperty('handleDeleteModule')
  })

  it('should have consistent return type across handlers', async () => {
    const storage = createMockStorage()

    // All handlers should return objects with status and either data or error
    const result = await handleGetModuleInfo({
      fullName: '@test/module',
      storage,
    })

    expect(result).toHaveProperty('status')
    expect(typeof result.status).toBe('number')

    // Should have either data or error, not both
    const hasData = 'data' in result
    const hasError = 'error' in result
    expect(hasData || hasError).toBe(true)
  })

  it('should accept request context for logging and tracing', async () => {
    const storage = createMockStorage()
    await storage.write('@test/traced', {
      name: '@test/traced',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetModuleInfo({
      fullName: '@test/traced',
      storage,
      requestId: 'req-123',
    })

    expect(result.status).toBe(200)
    // Request ID should be available for logging purposes
  })
})

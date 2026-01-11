/**
 * RED Tests for ESM.do Service Worker Routes
 *
 * Issue: esm-xlvb - Test esm.do managed service worker routes
 *
 * These tests verify that the esm.do managed service routes work correctly:
 * - GET /:scope/:name - Read module info
 * - GET /:scope/:name.ext - Read with format (ts, js, json)
 * - GET /:scope/:name/diff - Compare versions
 * - POST /:scope/:name - Write/create module
 * - POST /:scope/:name/test - Run tests
 * - POST /:scope/:name/run - Execute script
 * - DELETE /:scope/:name - Delete module
 *
 * These tests are designed to FAIL until the route handlers are implemented
 * as part of the esm.do managed service package split.
 *
 * Note: These are unit tests with mocked dependencies. Integration tests
 * that require a running worker should use unstable_dev from wrangler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// These imports should exist after the esm.do service package is created
// They will fail to import until the routes are extracted
import {
  handleReadModule,
  handleReadModuleWithFormat,
  handleDiffVersions,
  handleWriteModule,
  handleRunTests,
  handleRunScript,
  handleDeleteModule,
  handleOptionsRequest,
  addSecurityHeaders,
} from '../../src/worker/routes/service.js'

import type { ModuleStorage, StoredModule } from '../../src/storage/types.js'

// =============================================================================
// Mock Storage for Isolated Testing
// =============================================================================
function createMockStorage(): ModuleStorage {
  const modules = new Map<string, StoredModule>()
  const versions = new Map<string, string[]>() // module name -> list of version hashes
  const versionContent = new Map<string, StoredModule>() // version hash -> content

  return {
    async read(name: string, version?: string): Promise<StoredModule | null> {
      if (version) {
        return versionContent.get(version) || null
      }
      return modules.get(name) || null
    },

    async write(name: string, data: StoredModule): Promise<{ version: string; name: string }> {
      const hash = `sha-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const storedData = { ...data, version: hash }

      // Track versions
      const versionList = versions.get(name) || []
      versionList.unshift(hash)
      versions.set(name, versionList)

      // Store content
      modules.set(name, storedData)
      versionContent.set(hash, storedData)

      return { version: hash, name }
    },

    async delete(name: string): Promise<void> {
      modules.delete(name)
      versions.delete(name)
    },

    async list(pattern?: string): Promise<string[]> {
      return Array.from(modules.keys())
    },

    async versions(name: string, limit?: number): Promise<Array<{
      version: string
      message: string
      timestamp: Date
      parent?: string
    }>> {
      const versionList = versions.get(name) || []
      return versionList.slice(0, limit || 100).map((v, i) => ({
        version: v,
        message: i === 0 ? `Create ${name}` : `Update ${name}`,
        timestamp: new Date(),
        parent: versionList[i + 1],
      }))
    },
  }
}

// =============================================================================
// GET /:scope/:name - Read Module Info
// =============================================================================
describe('GET /:scope/:name - Read Module', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleReadModule).toBe('function')
  })

  it('should return module content for existing module', async () => {
    await storage.write('@test/module', {
      name: '@test/module',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModule({
      scope: '@test',
      name: 'module',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('name', '@test/module')
    expect(result.data).toHaveProperty('module')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleReadModule({
      scope: '@nonexistent',
      name: 'module',
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('not found')
  })

  it('should include version information', async () => {
    await storage.write('@test/versioned', {
      name: '@test/versioned',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModule({
      scope: '@test',
      name: 'versioned',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('version')
    expect(typeof result.data.version).toBe('string')
  })

  it('should include file list', async () => {
    await storage.write('@test/files', {
      name: '@test/files',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: 'describe("x", () => {})',
      script: 'return x',
    })

    const result = await handleReadModule({
      scope: '@test',
      name: 'files',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('files')
    expect(result.data.files).toContain('index.d.ts')
    expect(result.data.files).toContain('index.mjs')
    expect(result.data.files).toContain('index.test.js')
    expect(result.data.files).toContain('index.script.js')
  })

  it('should support version query parameter', async () => {
    const v1 = await storage.write('@test/pinned', {
      name: '@test/pinned',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    await storage.write('@test/pinned', {
      name: '@test/pinned',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleReadModule({
      scope: '@test',
      name: 'pinned',
      version: v1.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('version', v1.version)
  })

  it('should accept request context for tracing', async () => {
    await storage.write('@test/traced', {
      name: '@test/traced',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModule({
      scope: '@test',
      name: 'traced',
      storage,
      requestId: 'req-123',
    })

    expect(result.status).toBe(200)
  })
})

// =============================================================================
// GET /:scope/:name.ext - Read with Format
// =============================================================================
describe('GET /:scope/:name.ext - Read with Format', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleReadModuleWithFormat).toBe('function')
  })

  it('should return .ts format with typescript content-type', async () => {
    await storage.write('@test/typed', {
      name: '@test/typed',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModuleWithFormat({
      scope: '@test',
      name: 'typed',
      format: 'ts',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.contentType).toContain('typescript')
    expect(result.content).toBe('export declare const x: number')
  })

  it('should return .js format with javascript content-type', async () => {
    await storage.write('@test/esm', {
      name: '@test/esm',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModuleWithFormat({
      scope: '@test',
      name: 'esm',
      format: 'js',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.contentType).toContain('javascript')
    expect(result.content).toBe('export const x = 1')
  })

  it('should return .json format with json content-type', async () => {
    await storage.write('@test/json', {
      name: '@test/json',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModuleWithFormat({
      scope: '@test',
      name: 'json',
      format: 'json',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.contentType).toContain('json')
    const parsed = JSON.parse(result.content)
    expect(parsed).toHaveProperty('name', '@test/json')
    expect(parsed).toHaveProperty('types')
    expect(parsed).toHaveProperty('module')
  })

  it('should return .d.ts format for type declarations', async () => {
    await storage.write('@test/dts', {
      name: '@test/dts',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModuleWithFormat({
      scope: '@test',
      name: 'dts',
      format: 'd.ts',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.contentType).toContain('typescript')
    expect(result.content).toBe('export declare const x: number')
  })

  it('should return .mjs format for ES modules', async () => {
    await storage.write('@test/mjs', {
      name: '@test/mjs',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModuleWithFormat({
      scope: '@test',
      name: 'mjs',
      format: 'mjs',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.contentType).toContain('javascript')
    expect(result.content).toBe('export const x = 1')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleReadModuleWithFormat({
      scope: '@nonexistent',
      name: 'module',
      format: 'ts',
      storage,
    })

    expect(result.status).toBe(404)
  })

  it('should return 400 for unsupported format', async () => {
    await storage.write('@test/badformat', {
      name: '@test/badformat',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModuleWithFormat({
      scope: '@test',
      name: 'badformat',
      format: 'yaml',
      storage,
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('format')
  })

  it('should include caching headers', async () => {
    await storage.write('@test/cached', {
      name: '@test/cached',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModuleWithFormat({
      scope: '@test',
      name: 'cached',
      format: 'js',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.headers).toHaveProperty('Cache-Control')
    expect(result.headers).toHaveProperty('ETag')
  })
})

// =============================================================================
// GET /:scope/:name/diff - Compare Versions
// =============================================================================
describe('GET /:scope/:name/diff - Compare Versions', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleDiffVersions).toBe('function')
  })

  it('should return diff between versions', async () => {
    const v1 = await storage.write('@test/diff', {
      name: '@test/diff',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const v2 = await storage.write('@test/diff', {
      name: '@test/diff',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleDiffVersions({
      scope: '@test',
      name: 'diff',
      from: v1.version,
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('changes')
    expect(result.data.changes).toContain('-')
    expect(result.data.changes).toContain('+')
  })

  it('should return 400 for missing from parameter', async () => {
    await storage.write('@test/missingfrom', {
      name: '@test/missingfrom',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDiffVersions({
      scope: '@test',
      name: 'missingfrom',
      to: 'some-sha',
      storage,
    } as any)

    expect(result.status).toBe(400)
    expect(result.error).toContain('from')
  })

  it('should return 400 for missing to parameter', async () => {
    await storage.write('@test/missingto', {
      name: '@test/missingto',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDiffVersions({
      scope: '@test',
      name: 'missingto',
      from: 'some-sha',
      storage,
    } as any)

    expect(result.status).toBe(400)
    expect(result.error).toContain('to')
  })

  it('should return 404 for non-existent from version', async () => {
    const v2 = await storage.write('@test/badfrom', {
      name: '@test/badfrom',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDiffVersions({
      scope: '@test',
      name: 'badfrom',
      from: 'nonexistent-sha',
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('nonexistent-sha')
  })

  it('should return 404 for non-existent to version', async () => {
    const v1 = await storage.write('@test/badto', {
      name: '@test/badto',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDiffVersions({
      scope: '@test',
      name: 'badto',
      from: v1.version,
      to: 'nonexistent-sha',
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('nonexistent-sha')
  })

  it('should include diff stats', async () => {
    const v1 = await storage.write('@test/stats', {
      name: '@test/stats',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const v2 = await storage.write('@test/stats', {
      name: '@test/stats',
      types: 'export declare const x: number',
      module: 'export const x = 2\nexport const y = 3',
      tests: '',
      script: '',
    })

    const result = await handleDiffVersions({
      scope: '@test',
      name: 'stats',
      from: v1.version,
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('additions')
    expect(result.data).toHaveProperty('deletions')
  })
})

// =============================================================================
// POST /:scope/:name - Write Module
// =============================================================================
describe('POST /:scope/:name - Write Module', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleWriteModule).toBe('function')
  })

  it('should create new module', async () => {
    const result = await handleWriteModule({
      scope: '@test',
      name: 'new-module',
      body: {
        types: 'export declare const x: number',
        module: 'export const x = 1',
      },
      storage,
    })

    expect(result.status).toBe(201)
    expect(result.data).toHaveProperty('version')
    expect(result.data).toHaveProperty('created', true)
  })

  it('should update existing module', async () => {
    await storage.write('@test/existing', {
      name: '@test/existing',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleWriteModule({
      scope: '@test',
      name: 'existing',
      body: {
        types: 'export declare const x: number',
        module: 'export const x = 2',
      },
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('updated', true)
  })

  it('should return 400 for missing types', async () => {
    const result = await handleWriteModule({
      scope: '@test',
      name: 'invalid',
      body: {
        module: 'export const x = 1',
      } as any,
      storage,
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('types')
  })

  it('should return 400 for missing module', async () => {
    const result = await handleWriteModule({
      scope: '@test',
      name: 'invalid',
      body: {
        types: 'export declare const x: number',
      } as any,
      storage,
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('module')
  })

  it('should include optional tests', async () => {
    const result = await handleWriteModule({
      scope: '@test',
      name: 'with-tests',
      body: {
        types: 'export declare const x: number',
        module: 'export const x = 1',
        tests: 'describe("x", () => { it("works", () => expect(x).toBe(1)) })',
      },
      storage,
    })

    expect(result.status).toBe(201)

    const stored = await storage.read('@test/with-tests')
    expect(stored).not.toBeNull()
    expect(stored!.tests).toContain('describe')
  })

  it('should include optional script', async () => {
    const result = await handleWriteModule({
      scope: '@test',
      name: 'with-script',
      body: {
        types: 'export declare const x: number',
        module: 'export const x = 1',
        script: 'return x * 2',
      },
      storage,
    })

    expect(result.status).toBe(201)

    const stored = await storage.read('@test/with-script')
    expect(stored).not.toBeNull()
    expect(stored!.script).toBe('return x * 2')
  })

  it('should validate TypeScript syntax when validating', async () => {
    const mockValidator = vi.fn().mockResolvedValue({
      valid: false,
      errors: ['Invalid TypeScript syntax'],
    })

    const result = await handleWriteModule({
      scope: '@test',
      name: 'invalid-ts',
      body: {
        types: 'export declare const x = number', // Invalid syntax
        module: 'export const x = 1',
      },
      storage,
      validator: mockValidator,
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('syntax')
  })
})

// =============================================================================
// POST /:scope/:name/test - Run Tests
// =============================================================================
describe('POST /:scope/:name/test - Run Tests', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleRunTests).toBe('function')
  })

  it('should run module tests', async () => {
    await storage.write('@test/testable', {
      name: '@test/testable',
      types: 'export declare function add(a: number, b: number): number',
      module: 'export function add(a, b) { return a + b }',
      tests: 'describe("add", () => { it("works", () => expect(add(1,2)).toBe(3)) })',
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
      scope: '@test',
      name: 'testable',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('passed', 1)
    expect(result.data).toHaveProperty('failed', 0)
  })

  it('should return test results with details', async () => {
    await storage.write('@test/detailed', {
      name: '@test/detailed',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: 'describe("x", () => { it("is 1", () => expect(x).toBe(1)) })',
      script: '',
    })

    const mockExecutor = {
      runTests: vi.fn().mockResolvedValue({
        passed: 1,
        failed: 0,
        total: 1,
        duration: 50,
        tests: [{ name: 'x > is 1', status: 'passed', duration: 5 }],
      }),
    }

    const result = await handleRunTests({
      scope: '@test',
      name: 'detailed',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('tests')
    expect(Array.isArray(result.data.tests)).toBe(true)
    expect(result.data.tests[0]).toHaveProperty('name')
    expect(result.data.tests[0]).toHaveProperty('status')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleRunTests({
      scope: '@nonexistent',
      name: 'module',
      storage,
      executor: { runTests: vi.fn() },
    })

    expect(result.status).toBe(404)
  })

  it('should return 400 for module without tests', async () => {
    await storage.write('@test/notests', {
      name: '@test/notests',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleRunTests({
      scope: '@test',
      name: 'notests',
      storage,
      executor: { runTests: vi.fn() },
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('no tests')
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
      runTests: vi.fn().mockResolvedValue({
        passed: 0,
        failed: 0,
        total: 0,
        duration: 0,
        tests: [],
      }),
    }

    await handleRunTests({
      scope: '@test',
      name: 'timeout',
      storage,
      executor: mockExecutor,
      timeout: 5000,
    })

    expect(mockExecutor.runTests).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      5000
    )
  })
})

// =============================================================================
// POST /:scope/:name/run - Execute Script
// =============================================================================
describe('POST /:scope/:name/run - Execute Script', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleRunScript).toBe('function')
  })

  it('should execute script', async () => {
    await storage.write('@test/runnable', {
      name: '@test/runnable',
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
      scope: '@test',
      name: 'runnable',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('value', 49)
  })

  it('should pass input arguments to script', async () => {
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
      scope: '@test',
      name: 'withinput',
      storage,
      executor: mockExecutor,
      args: { name: 'World' },
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('value', 'Hello World')
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
      scope: '@test',
      name: 'logs',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('logs')
    expect(result.data.logs).toHaveLength(1)
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleRunScript({
      scope: '@nonexistent',
      name: 'module',
      storage,
      executor: { runScript: vi.fn() },
    })

    expect(result.status).toBe(404)
  })

  it('should return 400 for module without script', async () => {
    await storage.write('@test/noscript', {
      name: '@test/noscript',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleRunScript({
      scope: '@test',
      name: 'noscript',
      storage,
      executor: { runScript: vi.fn() },
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('no script')
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
      scope: '@test',
      name: 'error',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(500)
    expect(result.error).toContain('Kaboom')
  })

  it('should include execution duration', async () => {
    await storage.write('@test/timed', {
      name: '@test/timed',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: 'return x',
    })

    const mockExecutor = {
      runScript: vi.fn().mockResolvedValue({
        success: true,
        value: 1,
        logs: [],
        duration: 42,
      }),
    }

    const result = await handleRunScript({
      scope: '@test',
      name: 'timed',
      storage,
      executor: mockExecutor,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('duration', 42)
  })
})

// =============================================================================
// DELETE /:scope/:name - Delete Module
// =============================================================================
describe('DELETE /:scope/:name - Delete Module', () => {
  let storage: ModuleStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleDeleteModule).toBe('function')
  })

  it('should delete module', async () => {
    await storage.write('@test/to-delete', {
      name: '@test/to-delete',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDeleteModule({
      scope: '@test',
      name: 'to-delete',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('deleted', true)

    // Verify module is deleted
    const stored = await storage.read('@test/to-delete')
    expect(stored).toBeNull()
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleDeleteModule({
      scope: '@nonexistent',
      name: 'module',
      storage,
    })

    expect(result.status).toBe(404)
  })

  it('should include deleted module name in response', async () => {
    await storage.write('@test/named', {
      name: '@test/named',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDeleteModule({
      scope: '@test',
      name: 'named',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('name', '@test/named')
  })

  it('should include commit info for deletion', async () => {
    await storage.write('@test/committed', {
      name: '@test/committed',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleDeleteModule({
      scope: '@test',
      name: 'committed',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('commit')
    expect(result.data.commit).toHaveProperty('sha')
    expect(result.data.commit).toHaveProperty('message')
  })
})

// =============================================================================
// CORS Headers
// =============================================================================
describe('CORS Headers', () => {
  it('should export handleOptionsRequest function', () => {
    expect(typeof handleOptionsRequest).toBe('function')
  })

  it('should return Access-Control-Allow-Origin header', async () => {
    const result = await handleOptionsRequest({
      origin: 'https://example.com',
    })

    expect(result.status).toBe(204)
    expect(result.headers).toHaveProperty('Access-Control-Allow-Origin')
  })

  it('should return Access-Control-Allow-Methods header', async () => {
    const result = await handleOptionsRequest({
      origin: 'https://example.com',
    })

    expect(result.headers).toHaveProperty('Access-Control-Allow-Methods')
    expect(result.headers['Access-Control-Allow-Methods']).toContain('GET')
    expect(result.headers['Access-Control-Allow-Methods']).toContain('POST')
    expect(result.headers['Access-Control-Allow-Methods']).toContain('DELETE')
  })

  it('should return Access-Control-Allow-Headers header', async () => {
    const result = await handleOptionsRequest({
      origin: 'https://example.com',
    })

    expect(result.headers).toHaveProperty('Access-Control-Allow-Headers')
    expect(result.headers['Access-Control-Allow-Headers']).toContain('Content-Type')
  })

  it('should return Access-Control-Max-Age header', async () => {
    const result = await handleOptionsRequest({
      origin: 'https://example.com',
    })

    expect(result.headers).toHaveProperty('Access-Control-Max-Age')
  })

  it('should handle wildcard origin when configured', async () => {
    const result = await handleOptionsRequest({
      origin: 'https://example.com',
      allowAllOrigins: true,
    })

    expect(result.headers['Access-Control-Allow-Origin']).toBe('*')
  })

  it('should reflect origin when not using wildcard', async () => {
    const result = await handleOptionsRequest({
      origin: 'https://example.com',
      allowAllOrigins: false,
    })

    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://example.com')
  })
})

// =============================================================================
// Security Headers
// =============================================================================
describe('Security Headers', () => {
  it('should export addSecurityHeaders function', () => {
    expect(typeof addSecurityHeaders).toBe('function')
  })

  it('should add X-Content-Type-Options header', () => {
    const headers = addSecurityHeaders({})

    expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff')
  })

  it('should add X-Frame-Options header', () => {
    const headers = addSecurityHeaders({})

    expect(headers).toHaveProperty('X-Frame-Options', 'DENY')
  })

  it('should add X-XSS-Protection header', () => {
    const headers = addSecurityHeaders({})

    expect(headers).toHaveProperty('X-XSS-Protection', '1; mode=block')
  })

  it('should add Strict-Transport-Security header', () => {
    const headers = addSecurityHeaders({})

    expect(headers).toHaveProperty('Strict-Transport-Security')
    expect(headers['Strict-Transport-Security']).toContain('max-age=')
  })

  it('should add Content-Security-Policy header', () => {
    const headers = addSecurityHeaders({})

    expect(headers).toHaveProperty('Content-Security-Policy')
  })

  it('should preserve existing headers', () => {
    const existingHeaders = {
      'Custom-Header': 'custom-value',
    }

    const headers = addSecurityHeaders(existingHeaders)

    expect(headers).toHaveProperty('Custom-Header', 'custom-value')
    expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff')
  })
})

// =============================================================================
// Route Handler Interface Tests
// =============================================================================
describe('Service Route Handler Interface', () => {
  it('should export all service route handlers from a single module', async () => {
    const handlers = await import('../../src/worker/routes/service.js')

    expect(handlers).toHaveProperty('handleReadModule')
    expect(handlers).toHaveProperty('handleReadModuleWithFormat')
    expect(handlers).toHaveProperty('handleDiffVersions')
    expect(handlers).toHaveProperty('handleWriteModule')
    expect(handlers).toHaveProperty('handleRunTests')
    expect(handlers).toHaveProperty('handleRunScript')
    expect(handlers).toHaveProperty('handleDeleteModule')
    expect(handlers).toHaveProperty('handleOptionsRequest')
    expect(handlers).toHaveProperty('addSecurityHeaders')
  })

  it('should have consistent return type across handlers', async () => {
    const storage = createMockStorage()

    await storage.write('@test/consistent', {
      name: '@test/consistent',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleReadModule({
      scope: '@test',
      name: 'consistent',
      storage,
    })

    expect(result).toHaveProperty('status')
    expect(typeof result.status).toBe('number')

    // Should have either data or error
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

    const result = await handleReadModule({
      scope: '@test',
      name: 'traced',
      storage,
      requestId: 'req-123',
    })

    expect(result.status).toBe(200)
  })
})

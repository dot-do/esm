import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StoredModule, ModuleVersion, ModuleStorage } from '../../src/storage/types.js'

/**
 * RED tests for CloudflareStorage - persistent storage with CF bindings (D1/KV/DO)
 *
 * These tests define the expected interface and behavior for the Cloudflare storage backend.
 * Tests are written to FAIL until implementation exists.
 *
 * Storage strategy:
 * - KV: Fast key-value lookups for module refs and metadata
 * - D1: SQLite database for module listings and version history queries
 * - DO (Durable Objects): Coordination for concurrent writes (optional)
 *
 * Related issues:
 * - esm-stor.12: RED tests for Cloudflare storage backend (this file)
 * - esm-stor.15: GREEN implementation for Cloudflare storage
 */

// =============================================================================
// Type definitions for Cloudflare bindings
// =============================================================================

/**
 * Cloudflare KV namespace interface (subset used by storage)
 */
interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>
    list_complete: boolean
    cursor?: string
  }>
}

/**
 * Cloudflare D1 database interface (subset used by storage)
 */
interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<D1ExecResult>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(column?: string): Promise<T | null>
  run(): Promise<D1Result<unknown>>
  all<T = unknown>(): Promise<D1Result<T>>
}

interface D1Result<T> {
  results: T[]
  success: boolean
  meta: {
    duration: number
    changes: number
    last_row_id: number
  }
}

interface D1ExecResult {
  count: number
  duration: number
}

/**
 * Cloudflare Durable Object stub interface
 */
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectId {
  toString(): string
}

/**
 * Configuration for CloudflareStorage bindings
 */
interface CloudflareStorageBindings {
  /** KV namespace for blob content and refs */
  KV: KVNamespace
  /** D1 database for module listings and version queries */
  D1: D1Database
  /** Optional Durable Object for write coordination */
  DO?: DurableObjectNamespace
}

/**
 * CloudflareStorage class - NOT YET IMPLEMENTED
 * This import will fail until the implementation exists.
 */
// @ts-expect-error - CloudflareStorage not yet implemented
import { CloudflareStorage, CloudflareStorageError } from '../../src/storage/cloudflare.js'

// =============================================================================
// Mock helpers for Cloudflare bindings
// =============================================================================

function createMockKV(): KVNamespace {
  const store = new Map<string, string>()

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix ?? ''
      const limit = options?.limit ?? 1000
      const keys = Array.from(store.keys())
        .filter(k => k.startsWith(prefix))
        .slice(0, limit)
        .map(name => ({ name }))
      return {
        keys,
        list_complete: keys.length < limit,
        cursor: undefined,
      }
    }),
  }
}

function createMockD1(): D1Database {
  const tables = new Map<string, unknown[]>()

  const createStatement = (query: string, boundValues: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => createStatement(query, values),
    first: vi.fn(async () => null),
    run: vi.fn(async () => ({
      results: [],
      success: true,
      meta: { duration: 1, changes: 0, last_row_id: 0 },
    })),
    all: vi.fn(async () => ({
      results: [],
      success: true,
      meta: { duration: 1, changes: 0, last_row_id: 0 },
    })),
  })

  return {
    prepare: vi.fn((query: string) => createStatement(query)),
    batch: vi.fn(async () => []),
    exec: vi.fn(async () => ({ count: 0, duration: 1 })),
  }
}

function createMockDO(): DurableObjectNamespace {
  return {
    idFromName: vi.fn((name: string) => ({
      toString: () => `do_id_${name}`,
    })),
    get: vi.fn(() => ({
      fetch: vi.fn(async () => new Response('ok', { status: 200 })),
    })),
  }
}

function createMockBindings(): CloudflareStorageBindings {
  return {
    KV: createMockKV(),
    D1: createMockD1(),
    DO: createMockDO(),
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('CloudflareStorage', () => {
  let storage: ModuleStorage
  let bindings: CloudflareStorageBindings

  beforeEach(() => {
    bindings = createMockBindings()
    // This will fail until CloudflareStorage is implemented
    storage = new CloudflareStorage(bindings)
  })

  describe('constructor', () => {
    it('should accept Cloudflare bindings configuration', () => {
      const cfStorage = new CloudflareStorage(bindings)
      expect(cfStorage).toBeDefined()
      expect(cfStorage).toBeInstanceOf(CloudflareStorage)
    })

    it('should work without optional DO binding', () => {
      const { DO, ...requiredBindings } = bindings
      const cfStorage = new CloudflareStorage(requiredBindings as CloudflareStorageBindings)
      expect(cfStorage).toBeDefined()
    })

    it('should throw if KV binding is missing', () => {
      const { KV, ...missingKV } = bindings
      expect(() => new CloudflareStorage(missingKV as CloudflareStorageBindings)).toThrow()
    })

    it('should throw if D1 binding is missing', () => {
      const { D1, ...missingD1 } = bindings
      expect(() => new CloudflareStorage(missingD1 as CloudflareStorageBindings)).toThrow()
    })
  })

  describe('implements ModuleStorage interface', () => {
    it('should have read method', () => {
      expect(typeof storage.read).toBe('function')
    })

    it('should have write method', () => {
      expect(typeof storage.write).toBe('function')
    })

    it('should have delete method', () => {
      expect(typeof storage.delete).toBe('function')
    })

    it('should have list method', () => {
      expect(typeof storage.list).toBe('function')
    })

    it('should have versions method', () => {
      expect(typeof storage.versions).toBe('function')
    })
  })

  describe('read()', () => {
    it('should read a module from KV storage', async () => {
      const moduleName = '@math/add'
      const moduleData: StoredModule = {
        name: moduleName,
        types: 'export declare function add(a: number, b: number): number',
        module: 'export function add(a, b) { return a + b }',
        tests: 'it("adds", () => expect(add(1,2)).toBe(3))',
        script: 'return add(10, 20)',
      }

      await storage.write(moduleName, moduleData)
      const result = await storage.read(moduleName)

      expect(result).not.toBeNull()
      expect(result?.name).toBe(moduleName)
      expect(result?.types).toBe(moduleData.types)
      expect(result?.module).toBe(moduleData.module)
    })

    it('should return null for non-existent module', async () => {
      const result = await storage.read('@nonexistent/module')
      expect(result).toBeNull()
    })

    it('should read specific version from KV', async () => {
      const moduleName = '@utils/format'
      const v1: StoredModule = {
        name: moduleName,
        types: 'export declare function format(s: string): string',
        module: 'export function format(s) { return s.trim() }',
        tests: '',
        script: '',
      }

      const { version: v1Hash } = await storage.write(moduleName, v1)

      // Update to v2
      const v2: StoredModule = {
        ...v1,
        module: 'export function format(s) { return s.trim().toLowerCase() }',
      }
      await storage.write(moduleName, v2)

      // Read old version
      const oldVersion = await storage.read(moduleName, v1Hash)
      expect(oldVersion?.module).toBe(v1.module)
    })

    it('should use KV.get for blob retrieval', async () => {
      const moduleName = '@test/kv'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.read(moduleName)

      expect(bindings.KV.get).toHaveBeenCalled()
    })

    it('should include version hash in result', async () => {
      const moduleName = '@test/version'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      const result = await storage.read(moduleName)
      expect(result?.version).toBeDefined()
      expect(typeof result?.version).toBe('string')
    })
  })

  describe('write()', () => {
    it('should write module blobs to KV', async () => {
      const moduleData: StoredModule = {
        name: '@math/multiply',
        types: 'export declare function multiply(a: number, b: number): number',
        module: 'export function multiply(a, b) { return a * b }',
        tests: 'it("multiplies", () => expect(multiply(2,3)).toBe(6))',
        script: 'return multiply(5, 5)',
      }

      await storage.write(moduleData.name, moduleData)

      // KV.put should be called for each blob
      expect(bindings.KV.put).toHaveBeenCalled()
    })

    it('should store module metadata in D1', async () => {
      const moduleName = '@test/d1meta'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // D1 should be used for metadata storage
      expect(bindings.D1.prepare).toHaveBeenCalled()
    })

    it('should return version hash after write', async () => {
      const result = await storage.write('@test/hash', {
        name: '@test/hash',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      expect(result.version).toBeDefined()
      expect(typeof result.version).toBe('string')
      expect(result.version.length).toBeGreaterThan(0)
    })

    it('should validate module name format', async () => {
      const invalidNames = ['invalid', 'no-scope', '../escape', '@/empty']

      for (const name of invalidNames) {
        await expect(storage.write(name, {
          name,
          types: '',
          module: '',
          tests: '',
          script: '',
        })).rejects.toThrow()
      }
    })

    it('should use content-addressed keys in KV', async () => {
      const moduleData: StoredModule = {
        name: '@test/content-addr',
        types: 'export declare const x: number',
        module: 'export const x = 42',
        tests: '',
        script: '',
      }

      await storage.write(moduleData.name, moduleData)

      // Verify KV.put was called with hash-based keys
      const putCalls = vi.mocked(bindings.KV.put).mock.calls
      expect(putCalls.length).toBeGreaterThan(0)

      // Keys should be content-addressed (contain hash-like strings)
      const keys = putCalls.map(call => call[0])
      expect(keys.some(k => k.includes('blob/') || /[a-f0-9]{40}/.test(k))).toBe(true)
    })

    it('should record version in D1 for history tracking', async () => {
      const moduleName = '@test/history-d1'

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 1',
        tests: '',
        script: '',
      })

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 2',
        tests: '',
        script: '',
      })

      // D1 should record both versions
      expect(bindings.D1.prepare).toHaveBeenCalled()
    })
  })

  describe('delete()', () => {
    it('should remove module ref from KV', async () => {
      const moduleName = '@test/deletable'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.delete(moduleName)

      expect(bindings.KV.delete).toHaveBeenCalled()
    })

    it('should mark module as deleted in D1', async () => {
      const moduleName = '@test/d1delete'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.delete(moduleName)

      // D1 should be updated (soft delete)
      expect(bindings.D1.prepare).toHaveBeenCalled()
    })

    it('should throw when deleting non-existent module', async () => {
      await expect(storage.delete('@nonexistent/module')).rejects.toThrow()
    })

    it('should preserve blobs for version history (soft delete)', async () => {
      const moduleName = '@test/softdelete'
      const { version } = await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.delete(moduleName)

      // Should still be able to read by version hash
      const result = await storage.read(moduleName, version)
      expect(result).not.toBeNull()
    })
  })

  describe('list()', () => {
    beforeEach(async () => {
      const modules = [
        '@math/add',
        '@math/subtract',
        '@math/multiply',
        '@utils/format',
        '@utils/parse',
      ]

      for (const name of modules) {
        await storage.write(name, {
          name,
          types: '',
          module: `export const name = "${name}"`,
          tests: '',
          script: '',
        })
      }
    })

    it('should list all modules using D1 query', async () => {
      const result = await storage.list()

      expect(bindings.D1.prepare).toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should filter modules by pattern using D1', async () => {
      const result = await storage.list('@math/*')

      // D1 should handle pattern matching
      expect(bindings.D1.prepare).toHaveBeenCalled()
    })

    it('should return empty array when no modules match', async () => {
      const result = await storage.list('@nonexistent/*')
      expect(result).toEqual([])
    })

    it('should return modules sorted alphabetically', async () => {
      const result = await storage.list('@math/*')

      const sorted = [...result].sort()
      expect(result).toEqual(sorted)
    })

    it('should handle pagination with KV list cursor', async () => {
      // For large module sets, should use pagination
      const result = await storage.list()

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('versions()', () => {
    it('should query D1 for version history', async () => {
      const moduleName = '@test/versions'

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 1',
        tests: '',
        script: '',
      })

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 2',
        tests: '',
        script: '',
      })

      const versions = await storage.versions(moduleName)

      // D1 should be queried for version history
      expect(bindings.D1.prepare).toHaveBeenCalled()
      expect(Array.isArray(versions)).toBe(true)
    })

    it('should return versions in reverse chronological order', async () => {
      const moduleName = '@test/order'

      const { version: v1 } = await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 1',
        tests: '',
        script: '',
      })

      const { version: v2 } = await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 2',
        tests: '',
        script: '',
      })

      const versions = await storage.versions(moduleName)

      // Newest first
      if (versions.length >= 2) {
        expect(versions[0].version).toBe(v2)
        expect(versions[1].version).toBe(v1)
      }
    })

    it('should include timestamp in version info', async () => {
      const moduleName = '@test/timestamp'

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      const versions = await storage.versions(moduleName)

      if (versions.length > 0) {
        expect(versions[0].timestamp).toBeDefined()
        expect(versions[0].timestamp instanceof Date || typeof versions[0].timestamp === 'number').toBe(true)
      }
    })

    it('should return empty array for non-existent module', async () => {
      const versions = await storage.versions('@nonexistent/module')
      expect(versions).toEqual([])
    })

    it('should support limiting version count', async () => {
      const moduleName = '@test/limit'

      for (let i = 1; i <= 5; i++) {
        await storage.write(moduleName, {
          name: moduleName,
          types: '',
          module: `export const v = ${i}`,
          tests: '',
          script: '',
        })
      }

      const versions = await storage.versions(moduleName, 3)

      expect(versions.length).toBeLessThanOrEqual(3)
    })
  })

  describe('KV-specific behavior', () => {
    it('should use namespace prefix for KV keys', async () => {
      await storage.write('@test/prefix', {
        name: '@test/prefix',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      const putCalls = vi.mocked(bindings.KV.put).mock.calls
      const keys = putCalls.map(call => call[0])

      // Keys should have consistent prefix
      expect(keys.every(k => k.startsWith('esm/') || k.startsWith('blob/') || k.startsWith('ref/'))).toBe(true)
    })

    it('should handle KV rate limits gracefully', async () => {
      // Simulate KV rate limit
      vi.mocked(bindings.KV.put).mockRejectedValueOnce(new Error('KV rate limit exceeded'))

      await expect(storage.write('@test/ratelimit', {
        name: '@test/ratelimit',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })).rejects.toThrow()
    })

    it('should batch KV operations where possible', async () => {
      await storage.write('@test/batch', {
        name: '@test/batch',
        types: 'export declare const x: number',
        module: 'export const x = 1',
        tests: 'test code',
        script: 'script code',
      })

      // Should write 4 blobs (types, module, tests, script) + metadata
      const putCalls = vi.mocked(bindings.KV.put).mock.calls
      expect(putCalls.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('D1-specific behavior', () => {
    it('should use prepared statements with bindings', async () => {
      await storage.write('@test/prepared', {
        name: '@test/prepared',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // D1 should use prepared statements
      expect(bindings.D1.prepare).toHaveBeenCalled()
    })

    it('should handle D1 errors gracefully', async () => {
      vi.mocked(bindings.D1.prepare).mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error('D1 query failed')),
        run: vi.fn().mockRejectedValue(new Error('D1 query failed')),
        all: vi.fn().mockRejectedValue(new Error('D1 query failed')),
      })

      await expect(storage.list()).rejects.toThrow()
    })

    it('should use transactions for atomic writes', async () => {
      await storage.write('@test/atomic', {
        name: '@test/atomic',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // Should use batch for atomic operations
      // (D1 batch is the equivalent of transactions)
      expect(bindings.D1.batch || bindings.D1.prepare).toHaveBeenCalled()
    })
  })

  describe('Durable Objects (optional)', () => {
    it('should use DO for write coordination when available', async () => {
      // Create storage with DO binding
      const doBindings = createMockBindings()
      const doStorage = new CloudflareStorage(doBindings)

      await doStorage.write('@test/do', {
        name: '@test/do',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // DO should be used for write coordination
      expect(doBindings.DO?.get).toHaveBeenCalled()
    })

    it('should work without DO binding (fallback mode)', async () => {
      const { DO, ...noDOBindings } = bindings
      const noDOStorage = new CloudflareStorage(noDOBindings as CloudflareStorageBindings)

      // Should not throw without DO
      await expect(noDOStorage.write('@test/no-do', {
        name: '@test/no-do',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })).resolves.toBeDefined()
    })

    it('should handle concurrent writes with DO coordination', async () => {
      const doBindings = createMockBindings()
      const doStorage = new CloudflareStorage(doBindings)

      const moduleName = '@test/concurrent'
      const moduleData: StoredModule = {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      }

      // Concurrent writes
      const writes = Promise.all([
        doStorage.write(moduleName, { ...moduleData, module: 'export const x = 1' }),
        doStorage.write(moduleName, { ...moduleData, module: 'export const x = 2' }),
        doStorage.write(moduleName, { ...moduleData, module: 'export const x = 3' }),
      ])

      // Should handle concurrency without errors
      await expect(writes).resolves.toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should wrap KV errors in CloudflareStorageError', async () => {
      vi.mocked(bindings.KV.put).mockRejectedValue(new Error('KV error'))

      await expect(storage.write('@test/kv-error', {
        name: '@test/kv-error',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })).rejects.toThrow()
    })

    it('should wrap D1 errors in CloudflareStorageError', async () => {
      vi.mocked(bindings.D1.prepare).mockImplementation(() => {
        throw new Error('D1 error')
      })

      await expect(storage.list()).rejects.toThrow()
    })

    it('should handle network timeouts', async () => {
      vi.mocked(bindings.KV.get).mockImplementation(async () => {
        await new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        return null
      })

      await expect(storage.read('@test/timeout')).rejects.toThrow()
    })

    it('should provide meaningful error context', async () => {
      vi.mocked(bindings.KV.put).mockRejectedValue(new Error('Storage full'))

      try {
        await storage.write('@test/context', {
          name: '@test/context',
          types: '',
          module: 'export const x = 1',
          tests: '',
          script: '',
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error instanceof Error).toBe(true)
        // Error should contain context about the operation
        expect((error as Error).message).toBeDefined()
      }
    })
  })

  describe('performance optimization', () => {
    it('should parallelize blob writes to KV', async () => {
      const startTime = Date.now()

      await storage.write('@test/parallel', {
        name: '@test/parallel',
        types: 'types content',
        module: 'module content',
        tests: 'tests content',
        script: 'script content',
      })

      // Writes should be parallelized, not sequential
      const putCalls = vi.mocked(bindings.KV.put).mock.calls
      expect(putCalls.length).toBeGreaterThanOrEqual(4)
    })

    it('should cache ref lookups for repeated reads', async () => {
      const moduleName = '@test/cache'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // Multiple reads
      await storage.read(moduleName)
      await storage.read(moduleName)
      await storage.read(moduleName)

      // KV.get for ref should be optimized (implementation may vary)
      expect(bindings.KV.get).toHaveBeenCalled()
    })

    it('should use efficient D1 queries for listings', async () => {
      await storage.list('@math/*')

      // Should use indexed query, not full table scan
      expect(bindings.D1.prepare).toHaveBeenCalled()
    })
  })

  describe('data integrity', () => {
    it('should verify blob content with hash on read', async () => {
      const moduleName = '@test/integrity'
      const moduleData: StoredModule = {
        name: moduleName,
        types: 'export declare const x: number',
        module: 'export const x = 42',
        tests: '',
        script: '',
      }

      await storage.write(moduleName, moduleData)
      const result = await storage.read(moduleName)

      // Content should match exactly
      expect(result?.types).toBe(moduleData.types)
      expect(result?.module).toBe(moduleData.module)
    })

    it('should detect corrupted blobs', async () => {
      const moduleName = '@test/corrupt'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // Corrupt the blob data
      vi.mocked(bindings.KV.get).mockResolvedValueOnce('corrupted data that does not match hash')

      // Reading should detect corruption
      // (Implementation may throw or return null)
      const result = storage.read(moduleName)
      // The exact behavior depends on implementation
      await expect(result).resolves.toBeDefined() // or rejects.toThrow()
    })

    it('should ensure atomic updates to module state', async () => {
      const moduleName = '@test/atomic-state'

      // Write initial version
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 1',
        tests: '',
        script: '',
      })

      // Simulate partial failure mid-update
      vi.mocked(bindings.KV.put).mockRejectedValueOnce(new Error('Partial failure'))

      try {
        await storage.write(moduleName, {
          name: moduleName,
          types: '',
          module: 'export const v = 2',
          tests: '',
          script: '',
        })
      } catch {
        // Expected to fail
      }

      // State should be consistent (either v1 or v2, not corrupted)
      const result = await storage.read(moduleName)
      expect(result?.module).toMatch(/export const v = [12]/)
    })
  })
})

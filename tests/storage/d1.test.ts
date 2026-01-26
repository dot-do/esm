import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StoredModule, ModuleVersion, ModuleStorage } from '../../src/storage/types.js'

/**
 * Tests for D1Storage - SQLite-based persistent storage for ESM modules
 *
 * D1Storage implements the ModuleStorage interface using Cloudflare D1 (SQLite).
 * Unlike CloudflareStorage (KV+D1), this stores everything in D1 for simpler
 * deployment and consistent transactional behavior.
 */

import { D1Storage, D1StorageError, InvalidModuleNameError, ModuleNotFoundError, D1_SCHEMA } from '../../src/storage/d1.js'

// =============================================================================
// Mock D1 Database
// =============================================================================

interface MockRow {
  id?: string
  name: string
  version: number
  types: string
  code: string
  tests: string
  script: string
  message?: string
  created_at: string
  updated_at?: string
  deleted?: number
}

function createMockD1() {
  const modules = new Map<string, MockRow>()
  const versions = new Map<string, MockRow[]>()
  let initialized = false

  const createStatement = (query: string, boundValues: unknown[] = []) => {
    const stmt = {
      bind: (...values: unknown[]) => createStatement(query, values),
      first: vi.fn(async <T>(): Promise<T | null> => {
        const [name, version] = boundValues

        if (query.includes('FROM modules')) {
          // Get latest non-deleted module
          if (typeof name === 'string') {
            const row = modules.get(name)
            if (row && !row.deleted) {
              return row as unknown as T
            }
          }
          return null
        }

        if (query.includes('FROM module_versions')) {
          // Get specific version
          if (typeof name === 'string' && typeof version === 'number') {
            const moduleVersions = versions.get(name) || []
            const found = moduleVersions.find(v => v.version === version)
            return (found || null) as T
          }
          return null
        }

        return null
      }),
      run: vi.fn(async () => {
        // Handle INSERT/UPDATE operations
        if (query.includes('INSERT INTO module_versions')) {
          const [name, version, types, code, tests, script, message, created_at] = boundValues as [string, number, string, string, string, string, string, string]
          const row: MockRow = { name, version, types, code, tests, script, message, created_at }

          const moduleVersions = versions.get(name) || []
          moduleVersions.push(row)
          versions.set(name, moduleVersions)
        }

        if (query.includes('INSERT INTO modules') && !query.includes('module_versions')) {
          const [id, name, version, types, code, tests, script, created_at, updated_at] = boundValues as [string, string, number, string, string, string, string, string, string]
          const row: MockRow = { id, name, version, types, code, tests, script, created_at, updated_at, deleted: 0 }
          modules.set(name, row)
        }

        if (query.includes('UPDATE modules SET deleted')) {
          const [_updated_at, name] = boundValues as [string, string]
          const existing = modules.get(name)
          if (existing) {
            existing.deleted = 1
            existing.updated_at = _updated_at
          }
        }

        return {
          results: [],
          success: true,
          meta: { duration: 1, changes: 1, last_row_id: 1 },
        }
      }),
      all: vi.fn(async <T>() => {
        if (query.includes('SELECT DISTINCT name FROM modules')) {
          const results = Array.from(modules.values())
            .filter(m => !m.deleted)
            .map(m => ({ name: m.name }))
          return { results: results as T[], success: true, meta: { duration: 1, changes: 0, last_row_id: 0 } }
        }

        if (query.includes('FROM module_versions')) {
          const [name, limit] = boundValues as [string, number | undefined]
          const moduleVersions = versions.get(name) || []
          const sorted = [...moduleVersions].sort((a, b) => b.version - a.version)
          const limited = limit ? sorted.slice(0, limit) : sorted
          return { results: limited as T[], success: true, meta: { duration: 1, changes: 0, last_row_id: 0 } }
        }

        return { results: [], success: true, meta: { duration: 1, changes: 0, last_row_id: 0 } }
      }),
    }
    return stmt
  }

  return {
    prepare: vi.fn((query: string) => createStatement(query)),
    batch: vi.fn(async (statements: any[]) => {
      const results = []
      for (const stmt of statements) {
        results.push(await stmt.run())
      }
      return results
    }),
    exec: vi.fn(async (query: string) => {
      if (query.includes('CREATE TABLE')) {
        initialized = true
      }
      return { count: 1, duration: 1 }
    }),
    // Test helpers
    _isInitialized: () => initialized,
    _getModules: () => modules,
    _getVersions: () => versions,
    _clear: () => {
      modules.clear()
      versions.clear()
    },
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('D1Storage', () => {
  let storage: D1Storage
  let mockD1: ReturnType<typeof createMockD1>

  beforeEach(() => {
    mockD1 = createMockD1()
    storage = new D1Storage(mockD1 as any)
  })

  describe('constructor', () => {
    it('should accept D1 database binding', () => {
      const d1Storage = new D1Storage(mockD1 as any)
      expect(d1Storage).toBeDefined()
      expect(d1Storage).toBeInstanceOf(D1Storage)
    })

    it('should throw if D1 binding is missing', () => {
      expect(() => new D1Storage(null as any)).toThrow(D1StorageError)
      expect(() => new D1Storage(undefined as any)).toThrow(D1StorageError)
    })
  })

  describe('initialize()', () => {
    it('should create tables on first operation', async () => {
      await storage.list()
      expect(mockD1.exec).toHaveBeenCalled()
    })

    it('should only initialize once', async () => {
      await storage.list()
      await storage.list()
      await storage.list()
      expect(mockD1.exec).toHaveBeenCalledTimes(1)
    })

    it('should be callable explicitly', async () => {
      await storage.initialize()
      expect(mockD1.exec).toHaveBeenCalledWith(D1_SCHEMA)
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
    it('should return null for non-existent module', async () => {
      const result = await storage.read('@nonexistent/module')
      expect(result).toBeNull()
    })

    it('should read a module after write', async () => {
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

    it('should include version in result', async () => {
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

    it('should read specific version', async () => {
      const moduleName = '@utils/format'
      const v1: StoredModule = {
        name: moduleName,
        types: 'export declare function format(s: string): string',
        module: 'export function format(s) { return s.trim() }',
        tests: '',
        script: '',
      }

      const { version: v1Version } = await storage.write(moduleName, v1)

      // Update to v2
      const v2: StoredModule = {
        ...v1,
        module: 'export function format(s) { return s.trim().toLowerCase() }',
      }
      await storage.write(moduleName, v2)

      // Read old version
      const oldVersion = await storage.read(moduleName, v1Version)
      expect(oldVersion?.module).toBe(v1.module)
    })
  })

  describe('write()', () => {
    it('should write module to D1', async () => {
      const moduleData: StoredModule = {
        name: '@math/multiply',
        types: 'export declare function multiply(a: number, b: number): number',
        module: 'export function multiply(a, b) { return a * b }',
        tests: 'it("multiplies", () => expect(multiply(2,3)).toBe(6))',
        script: 'return multiply(5, 5)',
      }

      await storage.write(moduleData.name, moduleData)

      expect(mockD1.batch).toHaveBeenCalled()
    })

    it('should return version after write', async () => {
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

    it('should return module name in result', async () => {
      const moduleName = '@test/name'
      const result = await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      expect(result.name).toBe(moduleName)
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
        })).rejects.toThrow(InvalidModuleNameError)
      }
    })

    it('should increment version for updates', async () => {
      const moduleName = '@test/increment'

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

      expect(parseInt(v2)).toBeGreaterThan(parseInt(v1))
    })

    it('should use batch for atomic writes', async () => {
      await storage.write('@test/atomic', {
        name: '@test/atomic',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      expect(mockD1.batch).toHaveBeenCalled()
    })
  })

  describe('delete()', () => {
    it('should mark module as deleted', async () => {
      const moduleName = '@test/deletable'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.delete(moduleName)

      // Verify module is no longer readable
      const result = await storage.read(moduleName)
      expect(result).toBeNull()
    })

    it('should throw when deleting non-existent module', async () => {
      await expect(storage.delete('@nonexistent/module')).rejects.toThrow(ModuleNotFoundError)
    })

    it('should preserve version history (soft delete)', async () => {
      const moduleName = '@test/softdelete'
      const { version } = await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.delete(moduleName)

      // Should still be able to read by version
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

    it('should list all modules', async () => {
      const result = await storage.list()

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(5)
    })

    it('should filter modules by pattern', async () => {
      const result = await storage.list('@math/*')

      expect(result.length).toBe(3)
      expect(result).toContain('@math/add')
      expect(result).toContain('@math/subtract')
      expect(result).toContain('@math/multiply')
    })

    it('should return empty array when no modules match', async () => {
      const result = await storage.list('@nonexistent/*')
      expect(result).toEqual([])
    })

    it('should return modules sorted alphabetically', async () => {
      const result = await storage.list()

      const sorted = [...result].sort()
      expect(result).toEqual(sorted)
    })

    it('should not list deleted modules', async () => {
      await storage.delete('@math/add')

      const result = await storage.list('@math/*')

      expect(result).not.toContain('@math/add')
      expect(result.length).toBe(2)
    })
  })

  describe('versions()', () => {
    it('should return version history', async () => {
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

      expect(Array.isArray(versions)).toBe(true)
      expect(versions.length).toBe(2)
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
      expect(versions[0].version).toBe(v2)
      expect(versions[1].version).toBe(v1)
    })

    it('should include timestamp', async () => {
      const moduleName = '@test/timestamp'

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      const versions = await storage.versions(moduleName)

      expect(versions[0].timestamp).toBeDefined()
      expect(versions[0].timestamp instanceof Date).toBe(true)
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

  describe('error handling', () => {
    it('should wrap D1 errors in D1StorageError', async () => {
      mockD1.exec.mockRejectedValueOnce(new Error('D1 connection failed'))

      await expect(storage.initialize()).rejects.toThrow(D1StorageError)
    })

    it('should provide meaningful error context', async () => {
      const brokenD1 = {
        ...mockD1,
        prepare: vi.fn(() => {
          throw new Error('Query failed')
        }),
      }

      const brokenStorage = new D1Storage(brokenD1 as any)
      // Initialize first to skip schema creation
      brokenD1.exec.mockResolvedValueOnce({ count: 1, duration: 1 })
      await brokenStorage.initialize()

      try {
        await brokenStorage.list()
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error instanceof D1StorageError).toBe(true)
        expect((error as D1StorageError).code).toBe('LIST_ERROR')
      }
    })
  })

  describe('schema', () => {
    it('should export D1_SCHEMA constant', () => {
      expect(D1_SCHEMA).toBeDefined()
      expect(typeof D1_SCHEMA).toBe('string')
    })

    it('should include modules table', () => {
      expect(D1_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS modules')
    })

    it('should include module_versions table', () => {
      expect(D1_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS module_versions')
    })

    it('should include indexes for fast lookups', () => {
      expect(D1_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS idx_modules_name')
    })
  })

  describe('data integrity', () => {
    it('should store and retrieve all module fields correctly', async () => {
      const moduleName = '@test/integrity'
      const moduleData: StoredModule = {
        name: moduleName,
        types: 'export declare const x: number',
        module: 'export const x = 42',
        tests: 'describe("x", () => it("is 42", () => expect(x).toBe(42)))',
        script: 'console.log(x)',
      }

      await storage.write(moduleName, moduleData)
      const result = await storage.read(moduleName)

      expect(result?.types).toBe(moduleData.types)
      expect(result?.module).toBe(moduleData.module)
      expect(result?.tests).toBe(moduleData.tests)
      expect(result?.script).toBe(moduleData.script)
    })

    it('should handle empty string fields', async () => {
      const moduleName = '@test/empty'
      const moduleData: StoredModule = {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      }

      await storage.write(moduleName, moduleData)
      const result = await storage.read(moduleName)

      expect(result?.types).toBe('')
      expect(result?.tests).toBe('')
      expect(result?.script).toBe('')
    })

    it('should handle unicode content', async () => {
      const moduleName = '@test/unicode'
      const moduleData: StoredModule = {
        name: moduleName,
        types: '// 日本語コメント',
        module: 'export const emoji = "🎉"',
        tests: '// тест на русском',
        script: '',
      }

      await storage.write(moduleName, moduleData)
      const result = await storage.read(moduleName)

      expect(result?.types).toBe(moduleData.types)
      expect(result?.module).toBe(moduleData.module)
      expect(result?.tests).toBe(moduleData.tests)
    })

    it('should handle large content', async () => {
      const moduleName = '@test/large'
      const largeContent = 'x'.repeat(100000) // 100KB

      await storage.write(moduleName, {
        name: moduleName,
        types: largeContent,
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      const result = await storage.read(moduleName)
      expect(result?.types).toBe(largeContent)
    })
  })
})

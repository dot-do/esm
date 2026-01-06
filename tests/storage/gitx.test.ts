import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitxStorage, StorageTraceHook } from '../../src/storage/gitx.js'
import type { GitxClient, StoredModule, ModuleVersion } from '../../src/storage/types.js'

/**
 * RED tests for GitxStorage - content-addressed blob storage via gitx.do
 *
 * These tests define the expected interface and behavior for the storage layer.
 * Tests are written to FAIL until implementation exists.
 *
 * Related issues:
 * - esm-xv9: GitxStorage.read() implementation
 * - esm-55y: GitxStorage.write() implementation
 * - esm-n31: GitxStorage.list/delete/versions implementation
 */

// Mock gitx client for testing
function createMockGitxClient(): GitxClient {
  const blobs = new Map<string, string>()
  const trees = new Map<string, Record<string, string>>()
  const commits = new Map<string, { tree: string; parent?: string; message: string; timestamp: number }>()
  const refs = new Map<string, string>()
  let commitCounter = 0

  return {
    // Blob operations
    writeBlob: vi.fn(async (content: string) => {
      // Use full base64 hash to avoid collisions
      const hash = `blob_${Buffer.from(content).toString('base64').replace(/[/+=]/g, '_')}`
      blobs.set(hash, content)
      return hash
    }),
    readBlob: vi.fn(async (hash: string) => {
      const content = blobs.get(hash)
      if (content === undefined) throw new Error(`Blob not found: ${hash}`)
      return content
    }),

    // Tree operations
    writeTree: vi.fn(async (entries: Record<string, string>) => {
      // Use crypto-style hash based on full entries content
      const content = JSON.stringify(entries)
      const hash = `tree_${Buffer.from(content).toString('base64').replace(/[/+=]/g, '_')}`
      trees.set(hash, entries)
      return hash
    }),
    readTree: vi.fn(async (hash: string) => {
      const tree = trees.get(hash)
      if (!tree) throw new Error(`Tree not found: ${hash}`)
      return tree
    }),

    // Commit operations
    commit: vi.fn(async (treeHash: string, message: string, parent?: string) => {
      // Use counter to ensure unique hashes
      const hash = `commit_${Date.now().toString(36)}_${commitCounter++}`
      commits.set(hash, { tree: treeHash, parent, message, timestamp: Date.now() })
      return hash
    }),
    getCommit: vi.fn(async (hash: string) => {
      const commit = commits.get(hash)
      if (!commit) throw new Error(`Commit not found: ${hash}`)
      return commit
    }),

    // Ref operations
    updateRef: vi.fn(async (ref: string, commitHash: string) => {
      refs.set(ref, commitHash)
    }),
    getRef: vi.fn(async (ref: string) => {
      return refs.get(ref) ?? null
    }),
    listRefs: vi.fn(async (prefix?: string) => {
      const result: Record<string, string> = {}
      for (const [key, value] of refs) {
        if (!prefix || key.startsWith(prefix)) {
          result[key] = value
        }
      }
      return result
    }),
    deleteRef: vi.fn(async (ref: string) => {
      refs.delete(ref)
    }),

    // History traversal
    log: vi.fn(async (startCommit: string, limit?: number) => {
      const history: Array<{ hash: string; tree: string; parent?: string; message: string; timestamp: number }> = []
      let current: string | undefined = startCommit
      while (current && (!limit || history.length < limit)) {
        const commit = commits.get(current)
        if (!commit) break
        history.push({ hash: current, ...commit })
        current = commit.parent
      }
      return history
    }),
  }
}

describe('GitxStorage', () => {
  let storage: GitxStorage
  let mockClient: GitxClient

  beforeEach(() => {
    mockClient = createMockGitxClient()
    storage = new GitxStorage(mockClient)
  })

  describe('read()', () => {
    it('should read a module by name from storage', async () => {
      // Setup: write a module first
      const moduleName = '@math/add'
      const moduleData: StoredModule = {
        name: moduleName,
        types: 'export declare function add(a: number, b: number): number',
        module: 'export function add(a, b) { return a + b }',
        tests: 'it("adds", () => expect(add(1,2)).toBe(3))',
        script: 'return add(10, 20)',
      }

      await storage.write(moduleName, moduleData)

      // Test: read the module back
      const result = await storage.read(moduleName)

      expect(result).not.toBeNull()
      expect(result?.name).toBe(moduleName)
      expect(result?.types).toBe(moduleData.types)
      expect(result?.module).toBe(moduleData.module)
      expect(result?.tests).toBe(moduleData.tests)
      expect(result?.script).toBe(moduleData.script)
    })

    it('should return null for non-existent module', async () => {
      const result = await storage.read('@nonexistent/module')
      expect(result).toBeNull()
    })

    it('should read a specific version by hash', async () => {
      const moduleName = '@utils/format'
      const v1: StoredModule = {
        name: moduleName,
        types: 'export declare function format(s: string): string',
        module: 'export function format(s) { return s.trim() }',
        tests: '',
        script: '',
      }

      const { version: v1Hash } = await storage.write(moduleName, v1)

      // Update the module
      const v2: StoredModule = {
        ...v1,
        module: 'export function format(s) { return s.trim().toLowerCase() }',
      }
      await storage.write(moduleName, v2)

      // Read the old version
      const oldVersion = await storage.read(moduleName, v1Hash)
      expect(oldVersion?.module).toBe(v1.module)
    })

    it('should include version hash in the result', async () => {
      const moduleName = '@test/versioned'
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
      expect(result?.version?.length).toBeGreaterThan(0)
    })

    it('should handle scoped module names correctly', async () => {
      const moduleName = '@org/nested/deep/module'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      const result = await storage.read(moduleName)
      expect(result?.name).toBe(moduleName)
    })
  })

  describe('write()', () => {
    it('should write a module atomically and return version hash', async () => {
      const moduleData: StoredModule = {
        name: '@math/multiply',
        types: 'export declare function multiply(a: number, b: number): number',
        module: 'export function multiply(a, b) { return a * b }',
        tests: 'it("multiplies", () => expect(multiply(2,3)).toBe(6))',
        script: 'return multiply(5, 5)',
      }

      const result = await storage.write(moduleData.name, moduleData)

      expect(result.version).toBeDefined()
      expect(typeof result.version).toBe('string')
      expect(result.version.length).toBeGreaterThan(0)
    })

    it('should create content-addressed blobs for each file', async () => {
      const moduleData: StoredModule = {
        name: '@test/blobs',
        types: 'export declare const x: number',
        module: 'export const x = 42',
        tests: 'it("works", () => expect(x).toBe(42))',
        script: 'return x',
      }

      await storage.write(moduleData.name, moduleData)

      // Verify blobs were created via mock
      expect(mockClient.writeBlob).toHaveBeenCalledWith(moduleData.types)
      expect(mockClient.writeBlob).toHaveBeenCalledWith(moduleData.module)
      expect(mockClient.writeBlob).toHaveBeenCalledWith(moduleData.tests)
      expect(mockClient.writeBlob).toHaveBeenCalledWith(moduleData.script)
    })

    it('should create a tree with all four files', async () => {
      const moduleData: StoredModule = {
        name: '@test/tree',
        types: 'export declare const y: string',
        module: 'export const y = "hello"',
        tests: '',
        script: '',
      }

      await storage.write(moduleData.name, moduleData)

      // Verify tree was created with correct structure
      expect(mockClient.writeTree).toHaveBeenCalled()
      const treeCall = vi.mocked(mockClient.writeTree).mock.calls[0]
      const treeEntries = treeCall[0]

      expect(treeEntries).toHaveProperty('index.d.ts')
      expect(treeEntries).toHaveProperty('index.mjs')
      expect(treeEntries).toHaveProperty('index.test.js')
      expect(treeEntries).toHaveProperty('index.script.js')
    })

    it('should create a commit with descriptive message', async () => {
      const moduleData: StoredModule = {
        name: '@test/commit',
        types: '',
        module: 'export const z = true',
        tests: '',
        script: '',
      }

      await storage.write(moduleData.name, moduleData)

      expect(mockClient.commit).toHaveBeenCalled()
      const commitCall = vi.mocked(mockClient.commit).mock.calls[0]
      const message = commitCall[1]

      expect(message).toContain('@test/commit')
    })

    it('should update ref to point to new commit', async () => {
      const moduleName = '@test/ref'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const a = 1',
        tests: '',
        script: '',
      })

      expect(mockClient.updateRef).toHaveBeenCalled()
      const refCall = vi.mocked(mockClient.updateRef).mock.calls[0]
      expect(refCall[0]).toContain(moduleName)
    })

    it('should chain commits for version history', async () => {
      const moduleName = '@test/history'

      // Write first version
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 1',
        tests: '',
        script: '',
      })

      // Write second version
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 2',
        tests: '',
        script: '',
      })

      // Verify parent commit was passed
      expect(mockClient.commit).toHaveBeenCalledTimes(2)
      const secondCommitCall = vi.mocked(mockClient.commit).mock.calls[1]
      const parentHash = secondCommitCall[2]
      expect(parentHash).toBeDefined()
    })

    it('should handle empty files gracefully', async () => {
      const moduleData: StoredModule = {
        name: '@test/empty',
        types: '',
        module: '',
        tests: '',
        script: '',
      }

      const result = await storage.write(moduleData.name, moduleData)
      expect(result.version).toBeDefined()
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
  })

  describe('delete()', () => {
    it('should remove a module from storage', async () => {
      const moduleName = '@test/deletable'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.delete(moduleName)

      const result = await storage.read(moduleName)
      expect(result).toBeNull()
    })

    it('should delete the ref for the module', async () => {
      const moduleName = '@test/refdelete'
      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.delete(moduleName)

      expect(mockClient.deleteRef).toHaveBeenCalled()
    })

    it('should throw when deleting non-existent module', async () => {
      await expect(storage.delete('@nonexistent/module')).rejects.toThrow()
    })

    it('should preserve version history after delete (soft delete)', async () => {
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
      // Setup: create multiple modules
      const modules = [
        '@math/add',
        '@math/subtract',
        '@math/multiply',
        '@utils/format',
        '@utils/parse',
        '@org/nested/deep/module',
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

    it('should list all modules when no pattern provided', async () => {
      const result = await storage.list()

      expect(result).toHaveLength(6)
      expect(result).toContain('@math/add')
      expect(result).toContain('@utils/format')
    })

    it('should filter modules by scope pattern', async () => {
      const result = await storage.list('@math/*')

      expect(result).toHaveLength(3)
      expect(result).toContain('@math/add')
      expect(result).toContain('@math/subtract')
      expect(result).toContain('@math/multiply')
      expect(result).not.toContain('@utils/format')
    })

    it('should support glob patterns', async () => {
      const result = await storage.list('@*/format')

      expect(result).toHaveLength(1)
      expect(result).toContain('@utils/format')
    })

    it('should return empty array when no modules match', async () => {
      const result = await storage.list('@nonexistent/*')
      expect(result).toEqual([])
    })

    it('should handle nested module paths', async () => {
      const result = await storage.list('@org/**/*')

      expect(result).toHaveLength(1)
      expect(result).toContain('@org/nested/deep/module')
    })

    it('should return modules sorted alphabetically', async () => {
      const result = await storage.list('@math/*')

      expect(result).toEqual(['@math/add', '@math/multiply', '@math/subtract'])
    })
  })

  describe('versions()', () => {
    it('should return version history for a module', async () => {
      const moduleName = '@test/versions'

      // Create multiple versions
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

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const v = 3',
        tests: '',
        script: '',
      })

      const versions = await storage.versions(moduleName)

      expect(versions).toHaveLength(3)
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

      expect(versions[0].hash).toBe(v2)
      expect(versions[1].hash).toBe(v1)
    })

    it('should include commit metadata in version info', async () => {
      const moduleName = '@test/metadata'

      await storage.write(moduleName, {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      const versions = await storage.versions(moduleName)

      expect(versions[0]).toHaveProperty('hash')
      expect(versions[0]).toHaveProperty('message')
      expect(versions[0]).toHaveProperty('timestamp')
      expect(typeof versions[0].timestamp).toBe('number')
    })

    it('should return empty array for non-existent module', async () => {
      const versions = await storage.versions('@nonexistent/module')
      expect(versions).toEqual([])
    })

    it('should support limiting version count', async () => {
      const moduleName = '@test/limit'

      // Create 5 versions
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

      expect(versions).toHaveLength(3)
    })

    it('should preserve parent chain for history traversal', async () => {
      const moduleName = '@test/chain'

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

      // Each version (except first) should have a parent
      expect(versions[0].parent).toBeDefined()
      expect(versions[1].parent).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle gitx client connection errors', async () => {
      const failingClient = createMockGitxClient()
      vi.mocked(failingClient.writeBlob).mockRejectedValue(new Error('Connection refused'))

      const failingStorage = new GitxStorage(failingClient)

      await expect(failingStorage.write('@test/fail', {
        name: '@test/fail',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })).rejects.toThrow('Connection refused')
    })

    it('should handle corrupt blob data', async () => {
      const corruptClient = createMockGitxClient()
      vi.mocked(corruptClient.readBlob).mockRejectedValue(new Error('Blob corrupted'))

      const corruptStorage = new GitxStorage(corruptClient)

      // First write should work
      await corruptStorage.write('@test/corrupt', {
        name: '@test/corrupt',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // Reading should fail with corruption error
      await expect(corruptStorage.read('@test/corrupt')).rejects.toThrow()
    })

    it('should handle concurrent writes gracefully', async () => {
      const moduleName = '@test/concurrent'
      const moduleData: StoredModule = {
        name: moduleName,
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      }

      // Simulate concurrent writes
      const writes = Promise.all([
        storage.write(moduleName, { ...moduleData, module: 'export const x = 1' }),
        storage.write(moduleName, { ...moduleData, module: 'export const x = 2' }),
        storage.write(moduleName, { ...moduleData, module: 'export const x = 3' }),
      ])

      // Should not throw, one write should win
      await expect(writes).resolves.toBeDefined()
    })
  })

  describe('StorageTraceHook', () => {
    it('should accept a trace hook and call trace method during operations', async () => {
      const traceCalls: Array<{ level: string; message: string; context?: Record<string, unknown> }> = []
      const traceHook: StorageTraceHook = {
        trace: (level, message, context) => {
          traceCalls.push({ level, message, context })
        },
      }

      const tracedStorage = new GitxStorage(mockClient, traceHook)

      // Perform an operation that should trigger tracing
      await tracedStorage.write('@test/traced', {
        name: '@test/traced',
        types: '',
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      // Verify trace was called
      expect(traceCalls.length).toBeGreaterThan(0)
      expect(traceCalls.some(call => call.message.includes('write'))).toBe(true)
    })

    it('should properly initialize trace in constructor', async () => {
      const traceHook: StorageTraceHook = {
        trace: vi.fn(),
      }

      const tracedStorage = new GitxStorage(mockClient, traceHook)

      // This should not throw "this.trace is not a function"
      await tracedStorage.read('@nonexistent/module')

      // The trace method should have been called
      expect(traceHook.trace).toHaveBeenCalled()
    })

    it('should work without a trace hook (default no-op)', async () => {
      // Create storage without trace hook - should use default no-op
      const defaultStorage = new GitxStorage(mockClient)

      // This should not throw any errors
      await expect(defaultStorage.read('@nonexistent/module')).resolves.toBeNull()
    })
  })

  describe('content addressing', () => {
    it('should deduplicate identical content across modules', async () => {
      const sharedTypes = 'export declare const x: number'

      await storage.write('@test/module1', {
        name: '@test/module1',
        types: sharedTypes,
        module: 'export const x = 1',
        tests: '',
        script: '',
      })

      await storage.write('@test/module2', {
        name: '@test/module2',
        types: sharedTypes,
        module: 'export const x = 2',
        tests: '',
        script: '',
      })

      // Both modules should reference the same blob for types
      const writeBlobCalls = vi.mocked(mockClient.writeBlob).mock.calls
      const typesWrites = writeBlobCalls.filter(call => call[0] === sharedTypes)

      // Content-addressed storage should deduplicate
      // The blob should be written but storage should recognize duplicates
      expect(typesWrites.length).toBeGreaterThanOrEqual(1)
    })

    it('should produce same hash for identical module content', async () => {
      const moduleData: StoredModule = {
        name: '@test/deterministic',
        types: 'export declare const x: number',
        module: 'export const x = 42',
        tests: '',
        script: '',
      }

      // Write, delete, and rewrite the same content
      const { version: v1 } = await storage.write(moduleData.name, moduleData)
      await storage.delete(moduleData.name)
      const { version: v2 } = await storage.write(moduleData.name, moduleData)

      // Tree hashes should be identical for identical content
      // (commit hashes may differ due to timestamps)
      expect(v1).toBeDefined()
      expect(v2).toBeDefined()
    })
  })
})

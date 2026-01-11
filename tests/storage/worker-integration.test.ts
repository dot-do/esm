import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ModuleStorage, StoredModule, WriteResult, ModuleVersion } from '../../src/storage/types.js'
import { createWorkerWithStorage, createWorker, InMemoryStorage } from '../../src/api/worker-factory.js'

/**
 * GREEN tests for wiring storage into worker - esm-stor.16
 *
 * These tests verify that storage is properly integrated with the worker
 * so that modules survive worker restart.
 *
 * Key requirements:
 * 1. Worker should accept external storage dependency injection
 * 2. Modules written before restart should be readable after restart
 * 3. Version history should survive restart
 * 4. Storage errors should propagate correctly to API responses
 */

// Mock storage implementation for testing dependency injection
function createMockStorage(): ModuleStorage & {
  _modules: Map<string, StoredModule>
  _versions: Map<string, ModuleVersion[]>
} {
  const modules = new Map<string, StoredModule>()
  const versions = new Map<string, ModuleVersion[]>()

  return {
    _modules: modules,
    _versions: versions,

    async read(name: string, version?: string): Promise<StoredModule | null> {
      const module = modules.get(name)
      if (!module) return null
      if (version && module.version !== version) {
        // Check version history
        const history = versions.get(name)
        const v = history?.find((h) => h.version === version)
        if (!v) return null
      }
      return module
    },

    async write(name: string, data: StoredModule): Promise<WriteResult> {
      const versionHash = `sha_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const storedModule = { ...data, version: versionHash }
      modules.set(name, storedModule)

      // Track version history
      const history = versions.get(name) || []
      history.unshift({
        version: versionHash,
        message: `Update ${name}`,
        timestamp: new Date(),
      })
      versions.set(name, history)

      return { version: versionHash, name }
    },

    async delete(name: string): Promise<void> {
      modules.delete(name)
    },

    async list(pattern?: string): Promise<string[]> {
      const names = Array.from(modules.keys())
      if (!pattern) return names.sort()
      return names.filter((n) => n.includes(pattern.replace(/\*/g, ''))).sort()
    },

    async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
      const history = versions.get(name) || []
      return limit ? history.slice(0, limit) : history
    },
  }
}

describe('Worker Storage Integration', () => {
  describe('storage injection', () => {
    it('should accept storage as constructor dependency', async () => {
      // This test verifies that the worker can be constructed with
      // an injected storage implementation instead of creating its own

      const mockStorage = createMockStorage()

      // Worker factory accepts storage parameter
      expect(() => {
        const worker = createWorkerWithStorage(mockStorage)
        expect(worker).toBeDefined()
        expect(worker.getStorage()).toBe(mockStorage)
      }).not.toThrow()
    })

    it('should use injected storage for module operations', async () => {
      const mockStorage = createMockStorage()

      // Pre-populate storage with a module
      await mockStorage.write('@test/injected', {
        name: '@test/injected',
        types: 'export declare const x: number',
        module: 'export const x = 42',
        tests: '',
        script: '',
      })

      // Create worker with injected storage
      const worker = createWorkerWithStorage(mockStorage)

      // Worker should read from injected storage
      const request = new Request('http://localhost/test/injected')
      const response = await worker.fetch(request)
      expect(response.status).toBe(200)

      // Verify the module exists in storage
      expect(mockStorage._modules.has('@test/injected')).toBe(true)

      // Worker uses injected storage
      expect(() => {
        expect(worker.getStorage()).toBe(mockStorage)
      }).not.toThrow()
    })
  })

  describe('persistence across worker restart', () => {
    it('should preserve modules when storage is shared between worker instances', async () => {
      // This tests the core requirement: modules survive worker restart
      // because they're stored in persistent storage, not worker memory

      const persistentStorage = createMockStorage()

      // Simulate first worker instance
      const worker1 = createWorkerWithStorage(persistentStorage)

      // Write a module through the first worker
      const writeRequest = new Request('http://localhost/test/persistent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const value: number',
          module: 'export const value = 123',
          tests: '',
          script: '',
        }),
      })

      const writeResponse = await worker1.fetch(writeRequest)
      expect(writeResponse.status).toBe(201)

      // Simulate worker restart - create new worker instance with same storage
      const worker2 = createWorkerWithStorage(persistentStorage)

      // Module should be readable from second worker
      const readRequest = new Request('http://localhost/test/persistent')
      const response = await worker2.fetch(readRequest)
      expect(response.status).toBe(200)

      // Verify the module exists in storage
      const module = await persistentStorage.read('@test/persistent')
      expect(module).not.toBeNull()
      expect(module?.module).toBe('export const value = 123')

      // Shared storage works between worker instances
      expect(() => {
        expect(worker1.getStorage()).toBe(worker2.getStorage())
      }).not.toThrow()
    })

    it('should preserve version history across worker restart', async () => {
      const persistentStorage = createMockStorage()
      const worker1 = createWorkerWithStorage(persistentStorage)

      // Write multiple versions
      const write1 = await worker1.fetch(new Request('http://localhost/test/versioned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export {}',
          module: 'export const v = 1',
          tests: '',
          script: '',
        }),
      }))
      expect(write1.status).toBe(201)

      const write2 = await worker1.fetch(new Request('http://localhost/test/versioned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export {}',
          module: 'export const v = 2',
          tests: '',
          script: '',
        }),
      }))
      expect(write2.status).toBe(201)

      // Simulate restart and check version history
      const worker2 = createWorkerWithStorage(persistentStorage)
      const response = await worker2.fetch(new Request('http://localhost/test/versioned'))
      expect(response.status).toBe(200)

      const versions = await persistentStorage.versions('@test/versioned')
      expect(versions.length).toBe(2)

      // Version history is preserved
      expect(() => {
        expect(versions.length).toBeGreaterThan(0)
      }).not.toThrow()
    })

    it('should not lose data during worker restart', async () => {
      const persistentStorage = createMockStorage()
      const worker1 = createWorkerWithStorage(persistentStorage)

      // Create multiple modules (use URL-friendly paths)
      const modules = [
        { name: '@test/mod1', path: 'test/mod1' },
        { name: '@test/mod2', path: 'test/mod2' },
        { name: '@test/mod3', path: 'test/mod3' },
      ]

      for (const { name, path } of modules) {
        const response = await worker1.fetch(new Request(`http://localhost/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: 'export {}',
            module: `export const name = "${name}"`,
            tests: '',
            script: '',
          }),
        }))
        expect(response.status).toBe(201)
      }

      // After "restart", all modules should still exist
      const worker2 = createWorkerWithStorage(persistentStorage)

      for (const { name } of modules) {
        const module = await persistentStorage.read(name)
        expect(module).not.toBeNull()
      }

      // Data persists across restart
      expect(() => {
        expect(persistentStorage._modules.size).toBe(3)
      }).not.toThrow()
    })
  })

  describe('storage error handling in worker', () => {
    it('should return 500 when storage read fails', async () => {
      // Create storage that fails on read
      const failingStorage: ModuleStorage = {
        async read(): Promise<StoredModule | null> {
          throw new Error('Storage read failure')
        },
        async write(): Promise<WriteResult> {
          return { version: 'test', name: 'test' }
        },
        async delete(): Promise<void> {},
        async list(): Promise<string[]> {
          return []
        },
        async versions(): Promise<ModuleVersion[]> {
          return []
        },
      }

      const worker = createWorkerWithStorage(failingStorage)
      const response = await worker.fetch(new Request('http://localhost/test/failing'))
      expect(response.status).toBe(500)

      // Error handling is implemented
      expect(() => {
        expect(response.status).toBe(500)
      }).not.toThrow()
    })

    it('should return 500 when storage write fails', async () => {
      const failingStorage: ModuleStorage = {
        async read(): Promise<StoredModule | null> {
          return null
        },
        async write(): Promise<WriteResult> {
          throw new Error('Storage write failure')
        },
        async delete(): Promise<void> {},
        async list(): Promise<string[]> {
          return []
        },
        async versions(): Promise<ModuleVersion[]> {
          return []
        },
      }

      const worker = createWorkerWithStorage(failingStorage)
      const response = await worker.fetch(new Request('http://localhost/test/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: 'export {}', module: 'export {}', tests: '', script: '' })
      }))
      expect(response.status).toBe(500)

      expect(() => {
        expect(response.status).toBe(500)
      }).not.toThrow()
    })

    it('should propagate storage errors with meaningful messages', async () => {
      const errorMessage = 'Connection to storage backend failed'
      const failingStorage: ModuleStorage = {
        async read(): Promise<StoredModule | null> {
          throw new Error(errorMessage)
        },
        async write(): Promise<WriteResult> {
          throw new Error(errorMessage)
        },
        async delete(): Promise<void> {
          throw new Error(errorMessage)
        },
        async list(): Promise<string[]> {
          throw new Error(errorMessage)
        },
        async versions(): Promise<ModuleVersion[]> {
          throw new Error(errorMessage)
        },
      }

      const worker = createWorkerWithStorage(failingStorage)
      const response = await worker.fetch(new Request('http://localhost/test/any'))
      const data = await response.json() as { error: string }
      expect(data.error).toContain(errorMessage)

      expect(() => {
        expect(data.error).toBeDefined()
      }).not.toThrow()
    })
  })

  describe('storage binding configuration', () => {
    it('should support Cloudflare Durable Object binding for storage', async () => {
      // When deployed to Cloudflare Workers, storage should be backed by
      // Durable Objects or KV for persistence

      // Worker accepts custom storage implementation (simulating DO binding)
      const customStorage = createMockStorage()
      const worker = createWorkerWithStorage(customStorage)

      // Write through the worker
      const writeResponse = await worker.fetch(new Request('http://localhost/test/do-backed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export {}',
          module: 'export const x = 1',
          tests: '',
          script: '',
        }),
      }))
      expect(writeResponse.status).toBe(201)

      // Verify storage was used
      expect(() => {
        expect(customStorage._modules.has('@test/do-backed')).toBe(true)
      }).not.toThrow()
    })

    it('should fall back to in-memory storage when no binding provided', async () => {
      // For local development or testing, worker should work without
      // external storage binding by using in-memory storage

      const worker = createWorker() // No storage provided - uses default in-memory
      const writeResponse = await worker.fetch(new Request('http://localhost/test/inmemory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export {}',
          module: 'export const fallback = true',
          tests: '',
          script: '',
        }),
      }))
      expect(writeResponse.status).toBe(201)

      // Read back the module
      const readResponse = await worker.fetch(new Request('http://localhost/test/inmemory'))
      expect(readResponse.status).toBe(200)

      expect(() => {
        expect(worker.getStorage()).toBeInstanceOf(InMemoryStorage)
      }).not.toThrow()
    })
  })

  describe('concurrent access to shared storage', () => {
    it('should handle concurrent writes from multiple worker instances', async () => {
      const sharedStorage = createMockStorage()

      // Create multiple workers sharing the same storage
      const workers = Array.from({ length: 3 }, () => createWorkerWithStorage(sharedStorage))

      // Simulate concurrent writes from multiple workers
      const writes = workers.flatMap((worker, workerIdx) =>
        Array.from({ length: 3 }, (_, i) => {
          const idx = workerIdx * 3 + i
          return worker.fetch(new Request(`http://localhost/test/concurrent${idx}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              types: 'export {}',
              module: `export const i = ${idx}`,
              tests: '',
              script: '',
            }),
          }))
        })
      )

      const responses = await Promise.all(writes)

      // All writes should succeed
      for (const response of responses) {
        expect(response.status).toBe(201)
      }

      // All modules should exist
      const modules = await sharedStorage.list('@test/concurrent')
      expect(modules.length).toBe(9)

      // Concurrent access through workers works
      expect(() => {
        expect(modules.length).toBeGreaterThan(0)
      }).not.toThrow()
    })

    it('should maintain consistency during concurrent read-write', async () => {
      const sharedStorage = createMockStorage()
      const worker1 = createWorkerWithStorage(sharedStorage)
      const worker2 = createWorkerWithStorage(sharedStorage)

      // Initial write
      const initialWrite = await worker1.fetch(new Request('http://localhost/test/consistency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export {}',
          module: 'export const value = "initial"',
          tests: '',
          script: '',
        }),
      }))
      expect(initialWrite.status).toBe(201)

      // Simulate concurrent operations
      const operations = [
        worker1.fetch(new Request('http://localhost/test/consistency')),
        worker2.fetch(new Request('http://localhost/test/consistency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: 'export {}',
            module: 'export const value = "updated"',
            tests: '',
            script: '',
          }),
        })),
        worker1.fetch(new Request('http://localhost/test/consistency')),
      ]

      const responses = await Promise.all(operations)

      // All responses should be successful
      expect(responses[0].status).toBe(200)
      expect(responses[1].status).toBe(201)
      expect(responses[2].status).toBe(200)

      // Final read should have consistent value
      const finalModule = await sharedStorage.read('@test/consistency')
      expect(finalModule).not.toBeNull()
      expect(
        finalModule?.module === 'export const value = "initial"' || finalModule?.module === 'export const value = "updated"'
      ).toBe(true)

      // Concurrent read-write consistency works
      expect(() => {
        expect(finalModule).not.toBeNull()
      }).not.toThrow()
    })
  })
})

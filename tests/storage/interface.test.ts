import { describe, it, expect } from 'vitest'

describe('ModuleStorage Interface', () => {
  describe('interface definition', () => {
    it('should export ModuleStorage interface from core', async () => {
      // This will fail until core/storage/types.ts exists
      const { ModuleStorage } = await import('../../core/storage/types.js')
      expect(ModuleStorage).toBeDefined()
    })
  })

  describe('InMemoryStorage implementation', () => {
    it('should implement ModuleStorage interface', async () => {
      const { InMemoryStorage } = await import('../../core/storage/memory.js')
      const storage = new InMemoryStorage()

      // Verify interface methods exist
      expect(typeof storage.read).toBe('function')
      expect(typeof storage.write).toBe('function')
      expect(typeof storage.delete).toBe('function')
      expect(typeof storage.list).toBe('function')
      expect(typeof storage.versions).toBe('function')
    })

    it('should store and retrieve modules', async () => {
      const { InMemoryStorage } = await import('../../core/storage/memory.js')
      const storage = new InMemoryStorage()

      const module = {
        name: '@test/storage',
        types: 'export declare const x: number',
        module: 'export const x = 1',
        version: 'v1'
      }

      await storage.write('@test/storage', module)
      const result = await storage.read('@test/storage')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('@test/storage')
    })
  })

  describe('GitxStorage implementation', () => {
    it('should implement ModuleStorage interface', async () => {
      const { GitxStorage } = await import('../../core/storage/gitx.js')

      expect(GitxStorage).toBeDefined()
      // Verify it can be instantiated
      const storage = new GitxStorage({} as any)
      expect(typeof storage.read).toBe('function')
    })
  })

  describe('custom storage injection', () => {
    it('should allow injecting custom storage into ESM', async () => {
      const { ESM } = await import('../../core/index.js')

      // Create mock storage
      const mockStorage = {
        read: async () => null,
        write: async () => ({ version: 'v1', created: false }),
        delete: async () => {},
        list: async () => [],
        versions: async () => []
      }

      const esm = new ESM({ storage: mockStorage })
      expect(esm).toBeDefined()
    })
  })

  describe('optional tier management', () => {
    it('should support optional getTier method', async () => {
      const { CloudflareStorage } = await import('../../src/storage/cloudflare.js')

      // Create mock bindings for CloudflareStorage
      const mockBindings = {
        KV: {
          get: async () => null,
          put: async () => {},
          delete: async () => {},
          list: async () => ({ keys: [], list_complete: true }),
        },
        D1: {
          prepare: () => ({
            bind: () => ({
              first: async () => null,
              run: async () => ({ meta: { changes: 0 } }),
              all: async () => ({ results: [] }),
            }),
          }),
          batch: async () => [],
          exec: async () => ({ count: 0, duration: 0 }),
        },
      }

      const storage = new CloudflareStorage(mockBindings as any)

      // Tier methods are optional but should exist for Cloudflare impl
      expect(typeof storage.getTier).toBe('function')
      expect(typeof storage.setTier).toBe('function')
    })
  })
})

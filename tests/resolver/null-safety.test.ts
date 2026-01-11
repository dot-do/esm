import { describe, it, expect } from 'vitest'
import { DependencyResolver } from '../../src/resolver/dependency.js'

describe('Dependency Resolver Null Safety', () => {
  describe('parent chain traversal', () => {
    it('should handle missing parent gracefully', async () => {
      const resolver = new DependencyResolver(async (name) => {
        // Return module that depends on non-existent module
        if (name === '@test/child') {
          return { module: `import { x } from 'esm.do/@test/missing'` }
        }
        return null // Parent doesn't exist
      })

      // Should not crash with undefined access
      await expect(resolver.resolve('@test/child',
        `import { x } from 'esm.do/@test/missing'`
      )).rejects.toThrow() // Should throw proper error, not undefined crash
    })

    it('should not infinite loop on broken parent chain', async () => {
      const resolver = new DependencyResolver(async () => null)

      // Create circular reference scenario
      const code = `
        import { a } from 'esm.do/@circular/a'
        import { b } from 'esm.do/@circular/b'
      `

      // Should detect cycle and throw, not hang
      const promise = resolver.resolve('@test/main', code)

      // Set timeout to ensure it doesn't hang
      const result = await Promise.race([
        promise.catch(e => ({ error: e })),
        new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 5000))
      ])

      expect(result).not.toHaveProperty('timeout')
    })
  })

  describe('queue operations', () => {
    it('should handle empty queue gracefully', async () => {
      const resolver = new DependencyResolver(async () => null)

      // Code with no dependencies
      const code = `export const x = 1`

      // Should not crash when queue is empty
      const result = await resolver.resolve('@test/simple', code)
      expect(result.source).toBeDefined()
    })

    it('should handle rapid consecutive resolves', async () => {
      const resolver = new DependencyResolver(async (name) => ({
        module: `export const ${name.split('/').pop()} = 1`
      }))

      // Multiple rapid resolves shouldn't corrupt internal state
      const promises = [
        resolver.resolve('@test/a', `import { x } from 'esm.do/@dep/x'`),
        resolver.resolve('@test/b', `import { y } from 'esm.do/@dep/y'`),
        resolver.resolve('@test/c', `import { z } from 'esm.do/@dep/z'`)
      ]

      const results = await Promise.all(promises)
      expect(results).toHaveLength(3)
      results.forEach(r => expect(r.source).toBeDefined())
    })
  })

  describe('non-null assertion audit', () => {
    it('should handle undefined values at line 341', async () => {
      // This tests the specific bug at dependency.ts:341
      // current = parent.get(current)!
      const resolver = new DependencyResolver(async () => null)

      // Should not crash due to undefined parent.get()
      try {
        await resolver.resolve('@test/orphan',
          `import { orphan } from 'esm.do/@nonexistent/module'`
        )
      } catch (e) {
        // Should be a proper error, not "Cannot read property of undefined"
        expect(e).toBeInstanceOf(Error)
        expect((e as Error).message).not.toContain('undefined')
      }
    })

    it('should handle undefined at line 251 queue.shift', async () => {
      // This tests the specific bug at dependency.ts:251
      // const current = queue.shift()!
      const resolver = new DependencyResolver(async () => ({
        module: 'export const x = 1'
      }))

      // Should handle gracefully when queue empties
      const result = await resolver.resolve('@test/simple', 'export const y = 2')
      expect(result).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle null fetcher response', async () => {
      const resolver = new DependencyResolver(async () => null)

      const code = `import { missing } from 'esm.do/@missing/module'`

      await expect(resolver.resolve('@test/main', code))
        .rejects.toThrow(/not found|missing/i)
    })

    it('should handle fetcher throwing error', async () => {
      const resolver = new DependencyResolver(async () => {
        throw new Error('Network error')
      })

      const code = `import { x } from 'esm.do/@network/fail'`

      await expect(resolver.resolve('@test/main', code))
        .rejects.toThrow('Network error')
    })
  })
})

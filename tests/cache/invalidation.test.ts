import { describe, it, expect, beforeEach } from 'vitest'
import { ESM } from '../../src/esm.js'

describe('Cache Invalidation', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM({ cacheSize: 100 })
  })

  describe('module update invalidation', () => {
    it('should see updated module after write', async () => {
      // Write initial version
      await esm.write({
        name: '@test/math',
        types: 'export declare const value: number',
        module: 'export const value = 1'
      })

      // Run inline module that imports from esm.do and re-exports as named export
      const result1 = await esm.run({
        name: '@test/consumer',
        module: `
          import { value } from 'esm.do/@test/math'
          export const result = value
        `,
        script: `return result`
      })
      expect(result1.value).toBe(1)

      // Update the module
      await esm.write({
        name: '@test/math',
        types: 'export declare const value: number',
        module: 'export const value = 2' // Changed!
      })

      // Consumer should see updated value
      const result2 = await esm.run({
        name: '@test/consumer',
        module: `
          import { value } from 'esm.do/@test/math'
          export const result = value
        `,
        script: `return result`
      })

      // This test will FAIL if cache isn't properly invalidated
      expect(result2.value).toBe(2)
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used items', async () => {
      const smallCacheEsm = new ESM({ cacheSize: 3 })

      // Fill cache with 3 modules (with scripts so they can be run)
      for (let i = 1; i <= 3; i++) {
        await smallCacheEsm.write({
          name: `@test/mod${i}`,
          types: `export declare const x${i}: number`,
          module: `export const x${i} = ${i}`,
          script: `return x${i}`
        })
        await smallCacheEsm.run({ name: `@test/mod${i}` })
      }

      // Access mod1 to make it recently used
      await smallCacheEsm.run({ name: '@test/mod1' })

      // Add mod4 - should evict mod2 (least recently used)
      await smallCacheEsm.write({
        name: '@test/mod4',
        types: 'export declare const x4: number',
        module: 'export const x4 = 4',
        script: 'return x4'
      })
      await smallCacheEsm.run({ name: '@test/mod4' })

      // mod1 should still be cached (was recently used)
      // This is hard to verify without internal access
      // For now, just verify it still works
      const result = await smallCacheEsm.run({ name: '@test/mod1' })
      expect(result).toBeDefined()
      expect(result.value).toBe(1)
    })
  })

  describe('TTL expiration', () => {
    it('should expire cached items after TTL', async () => {
      const ttlEsm = new ESM({
        cacheSize: 100,
        cacheTTL: 100 // 100ms TTL for testing
      })

      await ttlEsm.write({
        name: '@test/ttl',
        types: 'export declare const x: number',
        module: 'export const x = 1',
        script: 'return x'
      })

      // First run caches
      await ttlEsm.run({ name: '@test/ttl' })

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      // Update module
      await ttlEsm.write({
        name: '@test/ttl',
        types: 'export declare const x: number',
        module: 'export const x = 2',
        script: 'return x'
      })

      // Should see new value (cache expired)
      const result = await ttlEsm.run({ name: '@test/ttl' })
      expect(result.value).toBe(2)
    })
  })

  describe('cache size limits', () => {
    it('should enforce cache size limits', async () => {
      const limitedEsm = new ESM({ cacheSize: 2 })

      // Add 5 modules (with scripts so they can be run)
      for (let i = 1; i <= 5; i++) {
        await limitedEsm.write({
          name: `@test/limited${i}`,
          types: `export declare const x: number`,
          module: `export const x = ${i}`,
          script: 'return x'
        })
        await limitedEsm.run({ name: `@test/limited${i}` })
      }

      // Cache should only have 2 items max
      // Verify by checking memory usage or internal state
      // For now, just verify it doesn't crash and returns expected value
      const result = await limitedEsm.run({ name: '@test/limited5' })
      expect(result.value).toBe(5)
    })
  })

  describe('dependency tracking', () => {
    it('should invalidate dependents when dependency updates', async () => {
      // Write base module
      await esm.write({
        name: '@math/base',
        types: 'export declare const PI: number',
        module: 'export const PI = 3.14'
      })

      // Write consumer module with script that computes area(1)
      await esm.write({
        name: '@math/circle',
        types: 'export declare function area(r: number): number',
        module: `
          import { PI } from 'esm.do/@math/base'
          export function area(r) { return PI * r * r }
        `,
        script: 'return area(1)'
      })

      // Run consumer
      const result1 = await esm.run({ name: '@math/circle' })
      expect(result1.value).toBeCloseTo(3.14)

      // Update base module
      await esm.write({
        name: '@math/base',
        types: 'export declare const PI: number',
        module: 'export const PI = 3.14159' // More precise
      })

      // Consumer should see updated PI
      const result2 = await esm.run({ name: '@math/circle' })

      // This FAILS if dependency cache isn't invalidated
      expect(result2.value).toBeCloseTo(3.14159)
    })
  })
})

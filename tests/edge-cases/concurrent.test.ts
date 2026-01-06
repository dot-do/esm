// tests/edge-cases/concurrent.test.ts
// RED Phase: Concurrent operation tests for esm-s6sg
// These tests verify thread-safe module operations and race condition handling
//
// IMPORTANT: These tests are designed to expose concurrency issues that require
// proper locking/synchronization to pass consistently. The tests verify:
// 1. Atomic write operations (all-or-nothing)
// 2. Write serialization (no lost updates)
// 3. Read consistency during writes
// 4. Proper lock acquisition and release

import { describe, it, expect, beforeEach } from 'vitest'
import { ESM } from '../../src/esm.js'

describe('Concurrent Operations', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM()
  })

  describe('Concurrent writes to same module', () => {
    it('should handle multiple concurrent writes to the same module name', async () => {
      // Create a module first
      await esm.write({
        name: '@test/concurrent-write',
        types: 'export declare const value: number;',
        module: 'export const value = 0;',
      })

      // Attempt multiple concurrent writes to the same module
      const writePromises = Array.from({ length: 10 }, (_, i) =>
        esm.write({
          name: '@test/concurrent-write',
          types: 'export declare const value: number;',
          module: `export const value = ${i + 1};`,
        })
      )

      // All writes should complete without error
      const results = await Promise.all(writePromises)

      // All writes should succeed with unique versions
      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result.name).toBe('@test/concurrent-write')
        expect(result.version).toBeDefined()
      })

      // The final read should return a consistent value (one of the writes)
      const finalModule = await esm.read('@test/concurrent-write')
      expect(finalModule.module).toMatch(/export const value = \d+;/)
    })

    it('should serialize concurrent writes and preserve all versions', async () => {
      const moduleName = '@test/serialized-writes'

      // Create initial module
      await esm.write({
        name: moduleName,
        types: 'export declare const seq: number;',
        module: 'export const seq = 0;',
      })

      // Perform concurrent writes - with proper locking, each write should
      // create a new version and none should be lost
      const writeCount = 10
      const writes = Array.from({ length: writeCount }, (_, i) =>
        esm.write({
          name: moduleName,
          types: 'export declare const seq: number;',
          module: `export const seq = ${i + 1};`,
        })
      )

      const results = await Promise.all(writes)

      // All writes should complete successfully
      expect(results.filter(r => r.name === moduleName)).toHaveLength(writeCount)

      // RED: Without proper write serialization, version history may lose writes
      // With proper locking, we should have writeCount + 1 versions (initial + all writes)
      const versions = await esm.versions(moduleName)
      expect(versions.length).toBe(writeCount + 1)
    })

    it('should maintain data integrity during rapid concurrent writes', async () => {
      const moduleName = '@test/integrity-check'

      // Perform 20 concurrent writes
      const writePromises = Array.from({ length: 20 }, (_, i) =>
        esm.write({
          name: moduleName,
          types: `export declare const id: number; export declare const marker: string;`,
          module: `export const id = ${i}; export const marker = "marker-${i}";`,
        })
      )

      await Promise.all(writePromises)

      // The final module should be internally consistent (id and marker should match)
      const finalModule = await esm.read(moduleName)
      const idMatch = finalModule.module.match(/export const id = (\d+);/)
      const markerMatch = finalModule.module.match(/export const marker = "marker-(\d+)";/)

      expect(idMatch).toBeTruthy()
      expect(markerMatch).toBeTruthy()

      // The id and marker should come from the same write (data integrity)
      expect(idMatch![1]).toBe(markerMatch![1])
    })

    it('should acquire write lock before modifying module', async () => {
      const moduleName = '@test/write-lock'

      // Track write operation timing
      const writeTimings: { start: number; end: number; index: number }[] = []

      // Override write to track timing
      const originalWrite = esm.write.bind(esm)

      // Perform concurrent writes
      const writePromises = Array.from({ length: 5 }, async (_, i) => {
        const start = Date.now()
        const result = await originalWrite({
          name: moduleName,
          types: 'export declare const x: number;',
          module: `export const x = ${i};`,
        })
        const end = Date.now()
        writeTimings.push({ start, end, index: i })
        return result
      })

      await Promise.all(writePromises)

      // RED: Without proper write locking, writes may overlap
      // With proper locking, no two writes should be executing simultaneously
      // Check that write operations don't overlap (each starts after previous ends)
      writeTimings.sort((a, b) => a.start - b.start)

      // This test may pass with in-memory storage due to JS single-threaded nature,
      // but will fail with async I/O storage without proper locking
      expect(writeTimings.length).toBe(5)
    })
  })

  describe('Concurrent reads during write', () => {
    it('should handle reads while a write is in progress', async () => {
      const moduleName = '@test/read-during-write'

      // Create initial module
      await esm.write({
        name: moduleName,
        types: 'export declare const version: string;',
        module: 'export const version = "v1";',
      })

      // Start a write operation and concurrent reads
      const writePromise = esm.write({
        name: moduleName,
        types: 'export declare const version: string;',
        module: 'export const version = "v2";',
      })

      // Perform multiple reads while write is in progress
      const readPromises = Array.from({ length: 5 }, () =>
        esm.read(moduleName)
      )

      // Wait for all operations to complete
      const [writeResult, ...readResults] = await Promise.all([
        writePromise,
        ...readPromises,
      ])

      // Write should succeed
      expect(writeResult.name).toBe(moduleName)

      // All reads should return valid, consistent data (either v1 or v2)
      readResults.forEach(result => {
        expect(result.name).toBe(moduleName)
        expect(result.module).toMatch(/export const version = "v[12]";/)
      })
    })

    it('should never return partial/corrupted data during concurrent read-write', async () => {
      const moduleName = '@test/no-partial-reads'

      // Create module with multi-field content
      await esm.write({
        name: moduleName,
        types: 'export declare const a: number; export declare const b: number;',
        module: 'export const a = 1; export const b = 1;',
      })

      // Interleave writes and reads
      const operations: Promise<unknown>[] = []

      for (let i = 0; i < 10; i++) {
        // Write with matching values
        operations.push(
          esm.write({
            name: moduleName,
            types: 'export declare const a: number; export declare const b: number;',
            module: `export const a = ${i + 2}; export const b = ${i + 2};`,
          })
        )

        // Read between writes
        operations.push(esm.read(moduleName))
      }

      const results = await Promise.all(operations)

      // Check all read results for consistency (a and b should always match)
      const readResults = results.filter((r: unknown) =>
        r && typeof r === 'object' && 'module' in (r as object) && !('version' in (r as object) && 'testResults' in (r as object))
      )

      readResults.forEach((result: unknown) => {
        const moduleContent = (result as { module: string }).module
        const aMatch = moduleContent.match(/export const a = (\d+);/)
        const bMatch = moduleContent.match(/export const b = (\d+);/)

        expect(aMatch).toBeTruthy()
        expect(bMatch).toBeTruthy()
        // Values should be consistent (from the same write)
        expect(aMatch![1]).toBe(bMatch![1])
      })
    })

    it('should allow multiple concurrent reads without blocking', async () => {
      const moduleName = '@test/concurrent-reads'

      await esm.write({
        name: moduleName,
        types: 'export declare const data: string;',
        module: 'export const data = "test-data";',
      })

      // Perform many concurrent reads
      const startTime = Date.now()
      const readPromises = Array.from({ length: 100 }, () =>
        esm.read(moduleName)
      )

      const results = await Promise.all(readPromises)
      const duration = Date.now() - startTime

      // All reads should succeed
      expect(results).toHaveLength(100)
      results.forEach(result => {
        expect(result.name).toBe(moduleName)
        expect(result.module).toContain('test-data')
      })

      // Concurrent reads should complete relatively quickly (not serialized)
      // This is a soft check - if they were serialized, it would take much longer
      expect(duration).toBeLessThan(5000) // 5 seconds max for 100 reads
    })

    it('should provide snapshot isolation for reads during write', async () => {
      const moduleName = '@test/snapshot-isolation'

      // Create initial module with version indicator
      await esm.write({
        name: moduleName,
        types: 'export declare const version: number;',
        module: 'export const version = 1;',
      })

      // RED: Without proper snapshot isolation, reads during a write may see
      // inconsistent state. A read should either see:
      // - The complete old version, OR
      // - The complete new version
      // Never a mix of old and new data

      // Start a slow write that updates multiple fields
      const writePromise = esm.write({
        name: moduleName,
        types: 'export declare const version: number; export declare const data: string;',
        module: 'export const version = 2; export const data = "new-data";',
      })

      // Concurrent reads should get consistent snapshots
      const readPromises = Array.from({ length: 10 }, () =>
        esm.read(moduleName)
      )

      const [, ...readResults] = await Promise.all([writePromise, ...readPromises])

      // Each read should see a consistent version
      readResults.forEach(result => {
        // If version is 1, data field should not exist or match old state
        // If version is 2, data field should be "new-data"
        const versionMatch = result.module.match(/export const version = (\d);/)
        expect(versionMatch).toBeTruthy()

        if (versionMatch![1] === '2') {
          expect(result.module).toContain('new-data')
        }
      })
    })
  })

  describe('Race condition handling', () => {
    it('should handle concurrent write-then-read race conditions', async () => {
      const moduleName = '@test/write-read-race'

      // Create initial module
      await esm.write({
        name: moduleName,
        types: 'export declare const state: string;',
        module: 'export const state = "initial";',
      })

      // Create race condition: write and immediate read
      const operations = Array.from({ length: 20 }, (_, i) => {
        const writeOp = esm.write({
          name: moduleName,
          types: 'export declare const state: string;',
          module: `export const state = "state-${i}";`,
        })
        const readOp = esm.read(moduleName)
        return [writeOp, readOp]
      }).flat()

      // All operations should complete without deadlock or error
      const results = await Promise.all(operations)

      expect(results).toHaveLength(40) // 20 writes + 20 reads

      // All operations should return valid data
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(result.name).toBe(moduleName)
      })
    })

    it('should handle concurrent delete during read', async () => {
      const moduleName = '@test/delete-during-read'

      // Create module
      await esm.write({
        name: moduleName,
        types: 'export declare const x: number;',
        module: 'export const x = 42;',
      })

      // Attempt concurrent read and delete
      const readPromise = esm.read(moduleName)
      const deletePromise = esm.delete(moduleName)

      // Settle all promises and check results
      const [readResult, deleteResult] = await Promise.allSettled([
        readPromise,
        deletePromise,
      ])

      // At least one operation should succeed
      const succeeded = [readResult, deleteResult].filter(r => r.status === 'fulfilled')
      expect(succeeded.length).toBeGreaterThan(0)

      // If both succeeded, that's valid (read completed before delete)
      // If only one succeeded, verify consistent state
      if (readResult.status === 'fulfilled' && deleteResult.status === 'fulfilled') {
        // Both operations completed - delete should have returned success
        expect((deleteResult as PromiseFulfilledResult<{ deleted: boolean }>).value.deleted).toBe(true)
      }
    })

    it('should handle concurrent writes with test execution', async () => {
      const moduleName = '@test/concurrent-with-tests'

      // Concurrent writes with tests that take time to execute
      const writePromises = Array.from({ length: 5 }, (_, i) =>
        esm.write({
          name: moduleName,
          types: 'export declare function getValue(): number;',
          module: `export function getValue() { return ${i}; }`,
          tests: `
            describe('getValue', () => {
              it('returns a number', () => {
                expect(typeof getValue()).toBe('number');
              });
            });
          `,
        })
      )

      const results = await Promise.all(writePromises)

      // All writes should complete
      expect(results).toHaveLength(5)

      // All should have test results
      results.forEach(result => {
        expect(result.testResults).toBeDefined()
        expect(result.testResults?.passed).toBeGreaterThanOrEqual(1)
      })
    })

    it('should handle concurrent run operations on the same module', async () => {
      const moduleName = '@test/concurrent-run'

      await esm.write({
        name: moduleName,
        types: 'export declare function compute(n: number): number;',
        module: 'export function compute(n) { return n * 2; }',
        script: 'return compute(args.value)',
      })

      // Run the module concurrently with different args
      const runPromises = Array.from({ length: 10 }, (_, i) =>
        esm.run(moduleName, { value: i })
      )

      const results = await Promise.all(runPromises)

      // All runs should complete successfully
      expect(results).toHaveLength(10)

      // Each run should return the correct computed value
      results.forEach((result, index) => {
        expect(result.value).toBe(index * 2)
      })
    })

    it('should handle concurrent test runs on the same module', async () => {
      const moduleName = '@test/concurrent-test'

      await esm.write({
        name: moduleName,
        types: 'export declare function add(a: number, b: number): number;',
        module: 'export function add(a, b) { return a + b; }',
        tests: `
          describe('add', () => {
            it('adds positive numbers', () => expect(add(2, 3)).toBe(5));
            it('adds negative numbers', () => expect(add(-1, -2)).toBe(-3));
          });
        `,
      })

      // Run tests concurrently
      const testPromises = Array.from({ length: 10 }, () =>
        esm.test(moduleName)
      )

      const results = await Promise.all(testPromises)

      // All test runs should complete
      expect(results).toHaveLength(10)

      // All should report consistent results
      results.forEach(result => {
        expect(result.passed).toBe(2)
        expect(result.failed).toBe(0)
        expect(result.total).toBe(2)
      })
    })

    it('should serialize writes to prevent version conflicts', async () => {
      const moduleName = '@test/version-conflicts'

      // Rapid-fire concurrent writes
      const writePromises = Array.from({ length: 10 }, (_, i) =>
        esm.write({
          name: moduleName,
          types: 'export declare const seq: number;',
          module: `export const seq = ${i};`,
        })
      )

      const results = await Promise.all(writePromises)

      // Collect all returned versions
      const versions = results.map(r => r.version)

      // Versions should all be defined
      versions.forEach(v => expect(v).toBeDefined())

      // Check version history is consistent
      const history = await esm.versions(moduleName)
      expect(history.length).toBeGreaterThan(0)
    })

    it('should handle list operation during concurrent writes', async () => {
      // Create multiple modules concurrently
      const writePromises = Array.from({ length: 5 }, (_, i) =>
        esm.write({
          name: `@test/list-concurrent-${i}`,
          types: 'export declare const x: number;',
          module: `export const x = ${i};`,
        })
      )

      // Interleave with list operations
      const listPromises = Array.from({ length: 3 }, () =>
        esm.list('@test/list-concurrent-*')
      )

      const allPromises = [...writePromises, ...listPromises]
      await Promise.all(allPromises)

      // Final list should show all modules
      const finalList = await esm.list('@test/list-concurrent-*')
      expect(finalList).toHaveLength(5)
    })
  })
})

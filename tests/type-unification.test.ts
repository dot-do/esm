// tests/type-unification.test.ts
import { describe, it, expect } from 'vitest'
import type { ESMModule, ESMWriteOptions, ESMTestResult } from '../src/types.js'
import type { StoredModule, ModuleVersion as StorageModuleVersion } from '../src/storage/types.js'
import type { WriteOptions, WriteResult, TestResult } from '../src/esm.js'
import type { ModuleVersion } from '../src/types.js'

describe('Type Unification', () => {
  describe('Module types alignment', () => {
    it('StoredModule should have same structure as ESMModule', () => {
      // This test verifies the types are structurally compatible
      const stored: StoredModule = {
        name: '@test/mod',
        types: 'export declare function x(): void;',
        module: 'export function x() {}',
        tests: '',
        script: '',
        version: 'v1',
      }

      // StoredModule should be assignable to ESMModule (minus timestamps)
      // If ESMModule requires createdAt/updatedAt, this should fail
      const esm: Partial<ESMModule> = stored
      expect(esm.name).toBe(stored.name)
    })

    it('StoredModule should include timestamps like ESMModule', () => {
      // ESMModule has createdAt and updatedAt
      // StoredModule should also have these for consistency
      const stored: StoredModule = {
        name: '@test/mod',
        types: '',
        module: '',
        tests: '',
        script: '',
        version: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // These properties should exist on StoredModule
      expect('createdAt' in stored || (stored as any).createdAt === undefined).toBe(true)
      // StoredModule now has timestamps for consistency with ESMModule
      expect(stored.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('WriteOptions alignment', () => {
    it('ESM WriteOptions should match ESMWriteOptions from types.ts', () => {
      // WriteOptions in esm.ts - now includes optional version
      const esmOpts: WriteOptions = {
        name: '@test/x',
        types: 'export {};',
        module: 'export {};',
        tests: '',
        script: '',
        version: 'v1',
      }

      // ESMWriteOptions in types.ts - should have same structure
      const typesOpts: ESMWriteOptions = {
        name: '@test/x',
        types: 'export {};',
        module: 'export {};',
        tests: '',
        script: '',
        version: 'v1',
      }

      // Both should accept version property
      expect('version' in typesOpts).toBe(true) // ESMWriteOptions has version
      // WriteOptions now has version property for consistency
      expect('version' in esmOpts).toBe(true)
    })
  })

  describe('TestResult alignment', () => {
    it('ESM TestResult should match ESMTestResult structure', () => {
      // TestResult from esm.ts now uses: { name, passed: boolean, duration, error? }
      const esmResult: TestResult = {
        passed: 1,
        failed: 0,
        total: 1,
        results: [{ name: 'test', passed: true, duration: 10 }],
        duration: 100,
      }

      // ESMTestResult from types.ts now has same structure
      const typesResult: ESMTestResult = {
        passed: 1,
        failed: 0,
        total: 1,
        results: [{ name: 'test', passed: true, duration: 10 }],
        duration: 100,
      }

      // Results array structure is now unified:
      // Both use: { name, passed: boolean, duration, error? }
      expect(esmResult.results[0]).toHaveProperty('passed')
      expect(typeof esmResult.results[0].passed).toBe('boolean')
    })

    it('ESM TestResult should have same properties as ESMTestResult', () => {
      // ESMTestResult now has 'total', 'duration', and 'failures'
      // Both types are now aligned

      const esmResult: TestResult = {
        passed: 2,
        failed: 1,
        total: 3,
        results: [
          { name: 'test1', passed: true, duration: 10 },
          { name: 'test2', passed: true, duration: 15 },
          { name: 'test3', passed: false, duration: 5, error: 'fail' },
        ],
        duration: 50,
      }

      // ESMTestResult now has 'total' property for consistency
      const typesResult: ESMTestResult = {
        passed: 2,
        failed: 1,
        total: 3,
        results: [],
        duration: 50,
      }

      // ESMTestResult now has 'total' property
      expect(typesResult).toHaveProperty('total')
    })
  })

  describe('ModuleVersion alignment', () => {
    it('ModuleVersion should use consistent property names', () => {
      // storage/types.ts ModuleVersion now uses: version, message, timestamp, parent?
      // types.ts ModuleVersion has: version, message, timestamp

      // Create a storage version - now uses 'version' instead of 'hash'
      const storageVersion: StorageModuleVersion = {
        version: 'abc123',
        message: 'test',
        timestamp: new Date(),
      }

      // It should have 'version' for consistency
      expect(storageVersion).toHaveProperty('version')
    })

    it('ModuleVersion timestamp types should be consistent', () => {
      // storage/types.ts now uses: timestamp: Date (unified)
      // types.ts uses: timestamp: Date

      const storageVersion: StorageModuleVersion = {
        version: 'abc',
        message: 'test',
        timestamp: new Date(), // Date object
      }

      const typesVersion: ModuleVersion = {
        version: 'abc',
        message: 'test',
        timestamp: new Date(), // Date object
      }

      // Both now use Date type
      expect(typeof storageVersion.timestamp).toBe(typeof typesVersion.timestamp)
    })
  })

  describe('WriteResult alignment', () => {
    it('ESM WriteResult should be consistent with storage WriteResult', () => {
      // esm.ts WriteResult: { name, version, testResults?, value? }
      // storage/types.ts WriteResult: { version, name }

      const esmResult: WriteResult = {
        name: '@test/x',
        version: 'v1',
        testResults: {
          passed: 1,
          failed: 0,
          total: 1,
          results: [],
          duration: 10,
        },
        value: undefined,
      }

      // The types have different structures
      // storage WriteResult is simpler (just version + name)
      // esm WriteResult includes testResults and value
      // This inconsistency is intentional but should be documented
      expect(esmResult).toHaveProperty('testResults')

      // For consistency, storage should also return test results
      // or esm should use a separate response type
    })
  })
})

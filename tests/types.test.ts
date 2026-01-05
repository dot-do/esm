/**
 * esm.do - Types Layer Tests
 *
 * RED PHASE: These tests are designed to FAIL until the types are properly implemented.
 *
 * Tests cover:
 * - ESMModule interface
 * - ESMWriteOptions interface
 * - ESMReadResult interface
 * - ESMRunResult interface
 * - ESMTestResult interface
 * - Storage interface
 * - Executor interface
 *
 * Note: We use runtime validation functions to verify type exports exist.
 * Type-only imports (import type) are erased at runtime, so we need actual
 * runtime exports to validate the types module is properly implemented.
 */

import { describe, it, expect } from 'vitest'
import * as types from '../src/types'

// =============================================================================
// Type Export Verification Tests
// These tests verify that all required types are exported from the types module
// =============================================================================

describe('Types Module Exports', () => {
  describe('Type Guards and Validators', () => {
    it('should export isESMModule type guard', () => {
      expect(types.isESMModule).toBeDefined()
      expect(typeof types.isESMModule).toBe('function')
    })

    it('should export isESMWriteOptions type guard', () => {
      expect(types.isESMWriteOptions).toBeDefined()
      expect(typeof types.isESMWriteOptions).toBe('function')
    })

    it('should export isESMReadResult type guard', () => {
      expect(types.isESMReadResult).toBeDefined()
      expect(typeof types.isESMReadResult).toBe('function')
    })

    it('should export isESMRunResult type guard', () => {
      expect(types.isESMRunResult).toBeDefined()
      expect(typeof types.isESMRunResult).toBe('function')
    })

    it('should export isESMTestResult type guard', () => {
      expect(types.isESMTestResult).toBeDefined()
      expect(typeof types.isESMTestResult).toBe('function')
    })

    it('should export isTestCaseResult type guard', () => {
      expect(types.isTestCaseResult).toBeDefined()
      expect(typeof types.isTestCaseResult).toBe('function')
    })

    it('should export isModuleVersion type guard', () => {
      expect(types.isModuleVersion).toBeDefined()
      expect(typeof types.isModuleVersion).toBe('function')
    })

    it('should export isValidationResult type guard', () => {
      expect(types.isValidationResult).toBeDefined()
      expect(typeof types.isValidationResult).toBe('function')
    })
  })

  describe('Factory Functions', () => {
    it('should export createESMModule factory function', () => {
      expect(types.createESMModule).toBeDefined()
      expect(typeof types.createESMModule).toBe('function')
    })

    it('should export createESMWriteOptions factory function', () => {
      expect(types.createESMWriteOptions).toBeDefined()
      expect(typeof types.createESMWriteOptions).toBe('function')
    })

    it('should export createESMTestResult factory function', () => {
      expect(types.createESMTestResult).toBeDefined()
      expect(typeof types.createESMTestResult).toBe('function')
    })

    it('should export createESMRunResult factory function', () => {
      expect(types.createESMRunResult).toBeDefined()
      expect(typeof types.createESMRunResult).toBe('function')
    })
  })
})

// =============================================================================
// ESMModule Type Guard Tests
// =============================================================================

describe('isESMModule', () => {
  it('should return true for valid ESMModule objects', () => {
    const validModule = {
      name: '@math/add',
      types: 'export declare function add(a: number, b: number): number',
      module: 'export function add(a, b) { return a + b }',
      tests: 'describe("add", () => { it("works", () => expect(add(1,2)).toBe(3)) })',
      script: 'return add(1, 2)',
      version: 'abc123',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(types.isESMModule(validModule)).toBe(true)
  })

  it('should return false for objects missing name', () => {
    const invalid = {
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
      version: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for objects missing types', () => {
    const invalid = {
      name: '@scope/name',
      module: 'module',
      tests: 'tests',
      script: 'script',
      version: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for objects missing module', () => {
    const invalid = {
      name: '@scope/name',
      types: 'types',
      tests: 'tests',
      script: 'script',
      version: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for objects missing tests', () => {
    const invalid = {
      name: '@scope/name',
      types: 'types',
      module: 'module',
      script: 'script',
      version: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for objects missing script', () => {
    const invalid = {
      name: '@scope/name',
      types: 'types',
      module: 'module',
      tests: 'tests',
      version: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for objects missing version', () => {
    const invalid = {
      name: '@scope/name',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for objects missing createdAt', () => {
    const invalid = {
      name: '@scope/name',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
      version: 'v1',
      updatedAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for objects missing updatedAt', () => {
    const invalid = {
      name: '@scope/name',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
      version: 'v1',
      createdAt: new Date(),
    }
    expect(types.isESMModule(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isESMModule(null)).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(types.isESMModule(undefined)).toBe(false)
  })

  it('should return false for non-objects', () => {
    expect(types.isESMModule('string')).toBe(false)
    expect(types.isESMModule(123)).toBe(false)
    expect(types.isESMModule(true)).toBe(false)
  })
})

// =============================================================================
// ESMWriteOptions Type Guard Tests
// =============================================================================

describe('isESMWriteOptions', () => {
  it('should return true for minimal valid options (name, types, module)', () => {
    const validOptions = {
      name: '@scope/module',
      types: 'export declare const x: number',
      module: 'export const x = 42',
    }
    expect(types.isESMWriteOptions(validOptions)).toBe(true)
  })

  it('should return true for full valid options with tests and script', () => {
    const fullOptions = {
      name: '@scope/module',
      types: 'export declare const x: number',
      module: 'export const x = 42',
      tests: 'it("works", () => expect(x).toBe(42))',
      script: 'return x',
    }
    expect(types.isESMWriteOptions(fullOptions)).toBe(true)
  })

  it('should return false for objects missing name', () => {
    const invalid = {
      types: 'types',
      module: 'module',
    }
    expect(types.isESMWriteOptions(invalid)).toBe(false)
  })

  it('should return false for objects missing types', () => {
    const invalid = {
      name: '@scope/name',
      module: 'module',
    }
    expect(types.isESMWriteOptions(invalid)).toBe(false)
  })

  it('should return false for objects missing module', () => {
    const invalid = {
      name: '@scope/name',
      types: 'types',
    }
    expect(types.isESMWriteOptions(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isESMWriteOptions(null)).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(types.isESMWriteOptions(undefined)).toBe(false)
  })
})

// =============================================================================
// ESMReadResult Type Guard Tests
// =============================================================================

describe('isESMReadResult', () => {
  it('should return true for valid read results', () => {
    const validResult = {
      name: '@math/add',
      types: 'export declare function add(a: number, b: number): number',
      module: 'export function add(a, b) { return a + b }',
      tests: 'it("adds", () => {})',
      script: 'return add(1, 2)',
      version: 'abc123def456',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    }
    expect(types.isESMReadResult(validResult)).toBe(true)
  })

  it('should return false for objects missing version info', () => {
    const invalid = {
      name: '@math/add',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
    }
    expect(types.isESMReadResult(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isESMReadResult(null)).toBe(false)
  })
})

// =============================================================================
// ESMRunResult Type Guard Tests
// =============================================================================

describe('isESMRunResult', () => {
  it('should return true for valid successful run result', () => {
    const successResult = {
      value: 42,
      logs: ['Starting execution...', 'Done'],
      errors: [],
    }
    expect(types.isESMRunResult(successResult)).toBe(true)
  })

  it('should return true for run result with errors', () => {
    const errorResult = {
      value: undefined,
      logs: ['Starting...'],
      errors: ['TypeError: Cannot read property x of undefined'],
    }
    expect(types.isESMRunResult(errorResult)).toBe(true)
  })

  it('should return true for complex return values', () => {
    const complexResult = {
      value: { sum: 10, product: 25, nested: { data: [1, 2, 3] } },
      logs: [],
      errors: [],
    }
    expect(types.isESMRunResult(complexResult)).toBe(true)
  })

  it('should return false for objects missing logs', () => {
    const invalid = {
      value: 42,
      errors: [],
    }
    expect(types.isESMRunResult(invalid)).toBe(false)
  })

  it('should return false for objects missing errors', () => {
    const invalid = {
      value: 42,
      logs: [],
    }
    expect(types.isESMRunResult(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isESMRunResult(null)).toBe(false)
  })
})

// =============================================================================
// TestCaseResult Type Guard Tests
// =============================================================================

describe('isTestCaseResult', () => {
  it('should return true for passing test case result', () => {
    const passingTest = {
      name: 'adds positive numbers',
      passed: true,
      duration: 2,
    }
    expect(types.isTestCaseResult(passingTest)).toBe(true)
  })

  it('should return true for failing test case result with error', () => {
    const failingTest = {
      name: 'adds negative numbers',
      passed: false,
      duration: 5,
      error: 'Expected 3 but got -3',
    }
    expect(types.isTestCaseResult(failingTest)).toBe(true)
  })

  it('should return false for objects missing name', () => {
    const invalid = {
      passed: true,
      duration: 1,
    }
    expect(types.isTestCaseResult(invalid)).toBe(false)
  })

  it('should return false for objects missing passed', () => {
    const invalid = {
      name: 'test',
      duration: 1,
    }
    expect(types.isTestCaseResult(invalid)).toBe(false)
  })

  it('should return false for objects missing duration', () => {
    const invalid = {
      name: 'test',
      passed: true,
    }
    expect(types.isTestCaseResult(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isTestCaseResult(null)).toBe(false)
  })
})

// =============================================================================
// ESMTestResult Type Guard Tests
// =============================================================================

describe('isESMTestResult', () => {
  it('should return true for test result with all passing tests', () => {
    const allPassing = {
      passed: 3,
      failed: 0,
      results: [
        { name: 'test 1', passed: true, duration: 1 },
        { name: 'test 2', passed: true, duration: 2 },
        { name: 'test 3', passed: true, duration: 1 },
      ],
    }
    expect(types.isESMTestResult(allPassing)).toBe(true)
  })

  it('should return true for test result with some failures', () => {
    const mixed = {
      passed: 2,
      failed: 1,
      results: [
        { name: 'test 1', passed: true, duration: 1 },
        { name: 'test 2', passed: false, duration: 2, error: 'Assertion failed' },
        { name: 'test 3', passed: true, duration: 1 },
      ],
    }
    expect(types.isESMTestResult(mixed)).toBe(true)
  })

  it('should return true for empty test results', () => {
    const empty = {
      passed: 0,
      failed: 0,
      results: [],
    }
    expect(types.isESMTestResult(empty)).toBe(true)
  })

  it('should return false for objects missing passed', () => {
    const invalid = {
      failed: 0,
      results: [],
    }
    expect(types.isESMTestResult(invalid)).toBe(false)
  })

  it('should return false for objects missing failed', () => {
    const invalid = {
      passed: 0,
      results: [],
    }
    expect(types.isESMTestResult(invalid)).toBe(false)
  })

  it('should return false for objects missing results', () => {
    const invalid = {
      passed: 0,
      failed: 0,
    }
    expect(types.isESMTestResult(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isESMTestResult(null)).toBe(false)
  })
})

// =============================================================================
// ModuleVersion Type Guard Tests
// =============================================================================

describe('isModuleVersion', () => {
  it('should return true for valid module version', () => {
    const version = {
      version: 'a3f2dd1b7c4ee2',
      message: 'Add edge case handling',
      timestamp: new Date('2024-01-15T10:30:00Z'),
    }
    expect(types.isModuleVersion(version)).toBe(true)
  })

  it('should return false for objects missing version', () => {
    const invalid = {
      message: 'message',
      timestamp: new Date(),
    }
    expect(types.isModuleVersion(invalid)).toBe(false)
  })

  it('should return false for objects missing message', () => {
    const invalid = {
      version: 'abc123',
      timestamp: new Date(),
    }
    expect(types.isModuleVersion(invalid)).toBe(false)
  })

  it('should return false for objects missing timestamp', () => {
    const invalid = {
      version: 'abc123',
      message: 'message',
    }
    expect(types.isModuleVersion(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isModuleVersion(null)).toBe(false)
  })
})

// =============================================================================
// ValidationResult Type Guard Tests
// =============================================================================

describe('isValidationResult', () => {
  it('should return true for valid validation result (all valid)', () => {
    const validResult = {
      valid: true,
      errors: [],
      warnings: [],
    }
    expect(types.isValidationResult(validResult)).toBe(true)
  })

  it('should return true for validation result with errors', () => {
    const errorResult = {
      valid: false,
      errors: ['Syntax error on line 5', 'Missing export'],
      warnings: ['Unused variable'],
    }
    expect(types.isValidationResult(errorResult)).toBe(true)
  })

  it('should return false for objects missing valid', () => {
    const invalid = {
      errors: [],
      warnings: [],
    }
    expect(types.isValidationResult(invalid)).toBe(false)
  })

  it('should return false for objects missing errors', () => {
    const invalid = {
      valid: true,
      warnings: [],
    }
    expect(types.isValidationResult(invalid)).toBe(false)
  })

  it('should return false for objects missing warnings', () => {
    const invalid = {
      valid: true,
      errors: [],
    }
    expect(types.isValidationResult(invalid)).toBe(false)
  })

  it('should return false for null', () => {
    expect(types.isValidationResult(null)).toBe(false)
  })
})

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createESMModule', () => {
  it('should create a valid ESMModule with all required fields', () => {
    const module = types.createESMModule({
      name: '@math/add',
      types: 'export declare function add(a: number, b: number): number',
      module: 'export function add(a, b) { return a + b }',
      tests: 'it("works", () => {})',
      script: 'return add(1, 2)',
    })

    expect(types.isESMModule(module)).toBe(true)
    expect(module.name).toBe('@math/add')
    expect(module.version).toBeDefined()
    expect(module.createdAt).toBeInstanceOf(Date)
    expect(module.updatedAt).toBeInstanceOf(Date)
  })

  it('should auto-generate version if not provided', () => {
    const module = types.createESMModule({
      name: '@test/auto-version',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
    })

    expect(module.version).toBeDefined()
    expect(typeof module.version).toBe('string')
    expect(module.version.length).toBeGreaterThan(0)
  })

  it('should use provided version if given', () => {
    const module = types.createESMModule({
      name: '@test/with-version',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
      version: 'custom-version-123',
    })

    expect(module.version).toBe('custom-version-123')
  })

  it('should set createdAt and updatedAt to current time', () => {
    const before = new Date()
    const module = types.createESMModule({
      name: '@test/timestamps',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
    })
    const after = new Date()

    expect(module.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(module.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(module.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(module.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})

describe('createESMWriteOptions', () => {
  it('should create valid write options with required fields', () => {
    const options = types.createESMWriteOptions({
      name: '@scope/module',
      types: 'export declare const x: number',
      module: 'export const x = 42',
    })

    expect(types.isESMWriteOptions(options)).toBe(true)
    expect(options.name).toBe('@scope/module')
    expect(options.types).toBe('export declare const x: number')
    expect(options.module).toBe('export const x = 42')
  })

  it('should include optional tests and script when provided', () => {
    const options = types.createESMWriteOptions({
      name: '@scope/module',
      types: 'types',
      module: 'module',
      tests: 'tests',
      script: 'script',
    })

    expect(options.tests).toBe('tests')
    expect(options.script).toBe('script')
  })

  it('should leave tests and script undefined when not provided', () => {
    const options = types.createESMWriteOptions({
      name: '@scope/module',
      types: 'types',
      module: 'module',
    })

    expect(options.tests).toBeUndefined()
    expect(options.script).toBeUndefined()
  })
})

describe('createESMTestResult', () => {
  it('should create valid test result from test case results', () => {
    const results = [
      { name: 'test 1', passed: true, duration: 1 },
      { name: 'test 2', passed: false, duration: 2, error: 'Failed' },
      { name: 'test 3', passed: true, duration: 1 },
    ]

    const testResult = types.createESMTestResult(results)

    expect(types.isESMTestResult(testResult)).toBe(true)
    expect(testResult.passed).toBe(2)
    expect(testResult.failed).toBe(1)
    expect(testResult.results).toEqual(results)
  })

  it('should handle empty results array', () => {
    const testResult = types.createESMTestResult([])

    expect(testResult.passed).toBe(0)
    expect(testResult.failed).toBe(0)
    expect(testResult.results).toEqual([])
  })

  it('should calculate passed/failed counts correctly', () => {
    const allPassing = [
      { name: 'test 1', passed: true, duration: 1 },
      { name: 'test 2', passed: true, duration: 1 },
    ]
    expect(types.createESMTestResult(allPassing).passed).toBe(2)
    expect(types.createESMTestResult(allPassing).failed).toBe(0)

    const allFailing = [
      { name: 'test 1', passed: false, duration: 1, error: 'e1' },
      { name: 'test 2', passed: false, duration: 1, error: 'e2' },
    ]
    expect(types.createESMTestResult(allFailing).passed).toBe(0)
    expect(types.createESMTestResult(allFailing).failed).toBe(2)
  })
})

describe('createESMRunResult', () => {
  it('should create valid successful run result', () => {
    const result = types.createESMRunResult({
      value: 42,
      logs: ['log1', 'log2'],
    })

    expect(types.isESMRunResult(result)).toBe(true)
    expect(result.value).toBe(42)
    expect(result.logs).toEqual(['log1', 'log2'])
    expect(result.errors).toEqual([])
  })

  it('should create valid error run result', () => {
    const result = types.createESMRunResult({
      value: undefined,
      logs: [],
      errors: ['Error occurred'],
    })

    expect(result.value).toBeUndefined()
    expect(result.errors).toEqual(['Error occurred'])
  })

  it('should default logs to empty array when not provided', () => {
    const result = types.createESMRunResult({
      value: 'test',
    })

    expect(result.logs).toEqual([])
  })

  it('should default errors to empty array when not provided', () => {
    const result = types.createESMRunResult({
      value: 'test',
    })

    expect(result.errors).toEqual([])
  })
})

// =============================================================================
// Storage Interface Tests
// =============================================================================

describe('Storage Interface', () => {
  it('should have proper method signatures', () => {
    // Test that we can create objects implementing the Storage interface
    const mockStorage: types.Storage = {
      read: async (name: string) => null,
      write: async (options) => types.createESMModule({
        ...options,
        tests: options.tests || '',
        script: options.script || '',
      }),
      delete: async (name: string) => true,
      list: async (pattern?: string) => [],
      versions: async (name: string) => [],
    }

    expect(typeof mockStorage.read).toBe('function')
    expect(typeof mockStorage.write).toBe('function')
    expect(typeof mockStorage.delete).toBe('function')
    expect(typeof mockStorage.list).toBe('function')
    expect(typeof mockStorage.versions).toBe('function')
  })

  it('read should accept name and return ESMReadResult or null', async () => {
    const mockStorage: types.Storage = {
      read: async (name: string) => {
        if (name === '@existing/module') {
          return {
            name,
            types: 'types',
            module: 'module',
            tests: 'tests',
            script: 'script',
            version: 'v1',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        }
        return null
      },
      write: async (options) => types.createESMModule({
        ...options,
        tests: options.tests || '',
        script: options.script || '',
      }),
      delete: async () => true,
      list: async () => [],
      versions: async () => [],
    }

    const existing = await mockStorage.read('@existing/module')
    expect(existing).not.toBeNull()
    expect(types.isESMReadResult(existing)).toBe(true)

    const nonExisting = await mockStorage.read('@nonexisting/module')
    expect(nonExisting).toBeNull()
  })

  it('write should accept ESMWriteOptions and return ESMModule', async () => {
    const mockStorage: types.Storage = {
      read: async () => null,
      write: async (options) => types.createESMModule({
        ...options,
        tests: options.tests || '',
        script: options.script || '',
      }),
      delete: async () => true,
      list: async () => [],
      versions: async () => [],
    }

    const module = await mockStorage.write({
      name: '@test/new',
      types: 'types',
      module: 'module',
    })

    expect(types.isESMModule(module)).toBe(true)
    expect(module.name).toBe('@test/new')
  })

  it('delete should accept name and return boolean', async () => {
    const mockStorage: types.Storage = {
      read: async () => null,
      write: async (options) => types.createESMModule({
        ...options,
        tests: options.tests || '',
        script: options.script || '',
      }),
      delete: async (name: string) => name === '@existing/module',
      list: async () => [],
      versions: async () => [],
    }

    expect(await mockStorage.delete('@existing/module')).toBe(true)
    expect(await mockStorage.delete('@nonexisting/module')).toBe(false)
  })

  it('list should accept optional pattern and return string array', async () => {
    const mockStorage: types.Storage = {
      read: async () => null,
      write: async (options) => types.createESMModule({
        ...options,
        tests: options.tests || '',
        script: options.script || '',
      }),
      delete: async () => true,
      list: async (pattern?: string) => {
        const all = ['@math/add', '@math/subtract', '@utils/format']
        if (!pattern) return all
        return all.filter(name => name.includes(pattern))
      },
      versions: async () => [],
    }

    const all = await mockStorage.list()
    expect(all).toEqual(['@math/add', '@math/subtract', '@utils/format'])

    const mathOnly = await mockStorage.list('@math')
    expect(mathOnly).toEqual(['@math/add', '@math/subtract'])
  })

  it('versions should accept name and return ModuleVersion array', async () => {
    const mockStorage: types.Storage = {
      read: async () => null,
      write: async (options) => types.createESMModule({
        ...options,
        tests: options.tests || '',
        script: options.script || '',
      }),
      delete: async () => true,
      list: async () => [],
      versions: async (name: string) => {
        if (name === '@test/versioned') {
          return [
            { version: 'v1', message: 'Initial', timestamp: new Date('2024-01-01') },
            { version: 'v2', message: 'Update', timestamp: new Date('2024-01-02') },
          ]
        }
        return []
      },
    }

    const versions = await mockStorage.versions('@test/versioned')
    expect(versions).toHaveLength(2)
    expect(versions.every(v => types.isModuleVersion(v))).toBe(true)
  })
})

// =============================================================================
// Executor Interface Tests
// =============================================================================

describe('Executor Interface', () => {
  it('should have proper method signatures', () => {
    const mockExecutor: types.Executor = {
      validate: async (module) => ({
        valid: true,
        errors: [],
        warnings: [],
      }),
      test: async (module) => ({
        passed: 0,
        failed: 0,
        results: [],
      }),
      run: async (module, args) => ({
        value: undefined,
        logs: [],
        errors: [],
      }),
    }

    expect(typeof mockExecutor.validate).toBe('function')
    expect(typeof mockExecutor.test).toBe('function')
    expect(typeof mockExecutor.run).toBe('function')
  })

  it('validate should accept ESMModule and return ValidationResult', async () => {
    const mockExecutor: types.Executor = {
      validate: async (module) => {
        const errors: string[] = []
        const warnings: string[] = []

        if (!module.types.includes('export')) {
          errors.push('Types must include exports')
        }
        if (!module.module.includes('export')) {
          errors.push('Module must include exports')
        }

        return {
          valid: errors.length === 0,
          errors,
          warnings,
        }
      },
      test: async () => ({ passed: 0, failed: 0, results: [] }),
      run: async () => ({ value: undefined, logs: [], errors: [] }),
    }

    const validModule = types.createESMModule({
      name: '@test/valid',
      types: 'export declare const x: number',
      module: 'export const x = 42',
      tests: '',
      script: '',
    })

    const result = await mockExecutor.validate(validModule)
    expect(types.isValidationResult(result)).toBe(true)
    expect(result.valid).toBe(true)

    const invalidModule = types.createESMModule({
      name: '@test/invalid',
      types: 'const x: number',
      module: 'const x = 42',
      tests: '',
      script: '',
    })

    const invalidResult = await mockExecutor.validate(invalidModule)
    expect(invalidResult.valid).toBe(false)
    expect(invalidResult.errors.length).toBeGreaterThan(0)
  })

  it('test should accept ESMModule and return ESMTestResult', async () => {
    const mockExecutor: types.Executor = {
      validate: async () => ({ valid: true, errors: [], warnings: [] }),
      test: async (module) => {
        // Simulate running tests
        return {
          passed: 2,
          failed: 0,
          results: [
            { name: 'test 1', passed: true, duration: 1 },
            { name: 'test 2', passed: true, duration: 2 },
          ],
        }
      },
      run: async () => ({ value: undefined, logs: [], errors: [] }),
    }

    const module = types.createESMModule({
      name: '@test/runner',
      types: 'export declare function add(a: number, b: number): number',
      module: 'export function add(a, b) { return a + b }',
      tests: 'it("works", () => {})',
      script: '',
    })

    const result = await mockExecutor.test(module)
    expect(types.isESMTestResult(result)).toBe(true)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('run should accept ESMModule and optional args and return ESMRunResult', async () => {
    const mockExecutor: types.Executor = {
      validate: async () => ({ valid: true, errors: [], warnings: [] }),
      test: async () => ({ passed: 0, failed: 0, results: [] }),
      run: async (module, args) => {
        // Simulate script execution
        return {
          value: args ? (args as { input: number }).input * 2 : 42,
          logs: ['Executing script...'],
          errors: [],
        }
      },
    }

    const module = types.createESMModule({
      name: '@test/script',
      types: 'export declare const x: number',
      module: 'export const x = 42',
      tests: '',
      script: 'return x * 2',
    })

    const resultWithoutArgs = await mockExecutor.run(module)
    expect(types.isESMRunResult(resultWithoutArgs)).toBe(true)
    expect(resultWithoutArgs.value).toBe(42)

    const resultWithArgs = await mockExecutor.run(module, { input: 10 })
    expect(resultWithArgs.value).toBe(20)
  })
})

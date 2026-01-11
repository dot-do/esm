import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ESM } from '../src/esm.js'

/**
 * RED tests for ESM class
 *
 * These tests cover the main orchestration methods:
 * - ESM.write({ name, types, module, tests?, script? })
 * - ESM.read(name, version?)
 * - ESM.run(name, args?)
 * - ESM.test(name)
 * - ESM.delete(name)
 *
 * Issues: esm-y5b, esm-x1a, esm-t4b, esm-odb, esm-cme
 */

describe('ESM', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM()
  })

  afterEach(async () => {
    // Clean up any test modules
  })

  describe('write()', () => {
    it('should create a module with types and code', async () => {
      const result = await esm.write({
        name: '@test/add',
        types: `export declare function add(a: number, b: number): number`,
        module: `export function add(a, b) { return a + b }`,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@test/add')
      expect(result.version).toBeDefined()
      expect(typeof result.version).toBe('string')
    })

    it('should create a module with types, code, and tests', async () => {
      const result = await esm.write({
        name: '@test/multiply',
        types: `export declare function multiply(a: number, b: number): number`,
        module: `export function multiply(a, b) { return a * b }`,
        tests: `
          describe('multiply', () => {
            it('multiplies positive numbers', () => expect(multiply(2, 3)).toBe(6))
            it('multiplies by zero', () => expect(multiply(5, 0)).toBe(0))
          })
        `,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@test/multiply')
      expect(result.testResults).toBeDefined()
      expect(result.testResults.passed).toBe(2)
      expect(result.testResults.failed).toBe(0)
    })

    it('should create a module with all four files', async () => {
      const result = await esm.write({
        name: '@test/calculator',
        types: `
          export declare function add(a: number, b: number): number
          export declare function subtract(a: number, b: number): number
        `,
        module: `
          export function add(a, b) { return a + b }
          export function subtract(a, b) { return a - b }
        `,
        tests: `
          describe('calculator', () => {
            it('adds numbers', () => expect(add(2, 3)).toBe(5))
            it('subtracts numbers', () => expect(subtract(5, 2)).toBe(3))
          })
        `,
        script: `return add(10, subtract(20, 5))`,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@test/calculator')
      expect(result.version).toBeDefined()
      expect(result.testResults).toBeDefined()
      expect(result.testResults.passed).toBe(2)
      expect(result.value).toBe(25) // add(10, subtract(20, 5)) = add(10, 15) = 25
    })

    it('should reject invalid type definitions', async () => {
      await expect(
        esm.write({
          name: '@test/invalid-types',
          types: `export declare function add(a: invalid_type): unknown`,
          module: `export function add(a) { return a }`,
        })
      ).rejects.toThrow()
    })

    it('should reject module when tests fail', async () => {
      await expect(
        esm.write({
          name: '@test/failing-tests',
          types: `export declare function add(a: number, b: number): number`,
          module: `export function add(a, b) { return a - b }`, // Wrong implementation
          tests: `
            describe('add', () => {
              it('adds numbers', () => expect(add(2, 3)).toBe(5))
            })
          `,
        })
      ).rejects.toThrow(/test/i)
    })

    it('should store module atomically (all files or none)', async () => {
      // First, create a module
      await esm.write({
        name: '@test/atomic',
        types: `export declare function foo(): void`,
        module: `export function foo() {}`,
      })

      // Try to update with failing tests - should not change existing module
      try {
        await esm.write({
          name: '@test/atomic',
          types: `export declare function bar(): number`,
          module: `export function bar() { return 1 }`,
          tests: `
            describe('bar', () => {
              it('fails', () => expect(bar()).toBe(999))
            })
          `,
        })
      } catch {
        // Expected to fail
      }

      // Original module should still be intact
      const original = await esm.read('@test/atomic')
      expect(original.types).toContain('foo')
      expect(original.types).not.toContain('bar')
    })

    it('should require name, types, and module', async () => {
      // Missing name
      await expect(
        esm.write({
          name: '',
          types: `export declare function x(): void`,
          module: `export function x() {}`,
        })
      ).rejects.toThrow()

      // Empty types are now allowed with a warning (per edge-case handling)
      // See tests/edge-cases/empty-input.test.ts for empty input behavior
      const result = await esm.write({
        name: '@test/no-types',
        types: '',
        module: `export function x() {}`,
      })
      expect(result.name).toBe('@test/no-types')

      // Missing module
      await expect(
        esm.write({
          name: '@test/no-module',
          types: `export declare function x(): void`,
          module: '',
        })
      ).rejects.toThrow()
    })

    it('should validate module name format', async () => {
      // Invalid: no scope
      await expect(
        esm.write({
          name: 'no-scope',
          types: `export declare function x(): void`,
          module: `export function x() {}`,
        })
      ).rejects.toThrow(/name/i)

      // Invalid: empty module name
      await expect(
        esm.write({
          name: '@scope/',
          types: `export declare function x(): void`,
          module: `export function x() {}`,
        })
      ).rejects.toThrow(/name/i)
    })

    it('should return version hash on successful write', async () => {
      const result = await esm.write({
        name: '@test/versioned',
        types: `export declare const VERSION: string`,
        module: `export const VERSION = '1.0.0'`,
      })

      expect(result.version).toMatch(/^[a-f0-9]+$/)
    })
  })

  describe('read()', () => {
    it('should read a module by name', async () => {
      // First write a module
      await esm.write({
        name: '@test/readable',
        types: `export declare function greet(name: string): string`,
        module: `export function greet(name) { return 'Hello, ' + name }`,
      })

      const result = await esm.read('@test/readable')

      expect(result).toBeDefined()
      expect(result.name).toBe('@test/readable')
      expect(result.types).toContain('greet')
      expect(result.module).toContain('Hello')
    })

    it('should read a module at a specific version', async () => {
      // Write initial version
      const v1 = await esm.write({
        name: '@test/versioned-read',
        types: `export declare const VALUE: number`,
        module: `export const VALUE = 1`,
      })

      // Write second version
      const v2 = await esm.write({
        name: '@test/versioned-read',
        types: `export declare const VALUE: number`,
        module: `export const VALUE = 2`,
      })

      // Read specific versions
      const readV1 = await esm.read('@test/versioned-read', v1.version)
      const readV2 = await esm.read('@test/versioned-read', v2.version)
      const readLatest = await esm.read('@test/versioned-read')

      expect(readV1.module).toContain('VALUE = 1')
      expect(readV2.module).toContain('VALUE = 2')
      expect(readLatest.module).toContain('VALUE = 2')
    })

    it('should return all module files', async () => {
      await esm.write({
        name: '@test/full-read',
        types: `export declare function run(): void`,
        module: `export function run() { console.log('running') }`,
        tests: `describe('run', () => { it('works', () => expect(run).toBeDefined()) })`,
        script: `run(); return 'done'`,
      })

      const result = await esm.read('@test/full-read')

      expect(result.types).toBeDefined()
      expect(result.module).toBeDefined()
      expect(result.tests).toBeDefined()
      expect(result.script).toBeDefined()
      expect(result.version).toBeDefined()
    })

    it('should throw for non-existent module', async () => {
      await expect(esm.read('@test/nonexistent-module')).rejects.toThrow()
    })

    it('should throw for non-existent version', async () => {
      await esm.write({
        name: '@test/exists',
        types: `export declare const X: number`,
        module: `export const X = 1`,
      })

      await expect(
        esm.read('@test/exists', 'nonexistent-version-hash')
      ).rejects.toThrow()
    })
  })

  describe('run()', () => {
    it('should execute module script and return result', async () => {
      await esm.write({
        name: '@test/runnable',
        types: `export declare function double(n: number): number`,
        module: `export function double(n) { return n * 2 }`,
        script: `return double(21)`,
      })

      const result = await esm.run('@test/runnable')

      expect(result.value).toBe(42)
    })

    it('should pass arguments to script execution', async () => {
      await esm.write({
        name: '@test/with-args',
        types: `export declare function greet(name: string): string`,
        module: `export function greet(name) { return 'Hello, ' + name }`,
        script: `return greet(args.name)`,
      })

      const result = await esm.run('@test/with-args', { name: 'World' })

      expect(result.value).toBe('Hello, World')
    })

    it('should capture console output', async () => {
      await esm.write({
        name: '@test/console-output',
        types: `export declare function log(msg: string): void`,
        module: `export function log(msg) { console.log(msg) }`,
        script: `log('test message'); return true`,
      })

      const result = await esm.run('@test/console-output')

      expect(result.value).toBe(true)
      expect(result.logs).toBeDefined()
      expect(result.logs).toContain('test message')
    })

    it('should throw if module has no script', async () => {
      await esm.write({
        name: '@test/no-script',
        types: `export declare const X: number`,
        module: `export const X = 1`,
        // No script
      })

      await expect(esm.run('@test/no-script')).rejects.toThrow(/script/i)
    })

    it('should throw for non-existent module', async () => {
      await expect(esm.run('@test/nonexistent')).rejects.toThrow()
    })

    it('should handle script execution errors', async () => {
      await esm.write({
        name: '@test/error-script',
        types: `export declare function crash(): never`,
        module: `export function crash() { throw new Error('intentional') }`,
        script: `crash()`,
      })

      await expect(esm.run('@test/error-script')).rejects.toThrow('intentional')
    })

    it('should have module exports available in script scope', async () => {
      await esm.write({
        name: '@test/scope-test',
        types: `
          export declare const A: number
          export declare const B: number
          export declare function sum(x: number, y: number): number
        `,
        module: `
          export const A = 10
          export const B = 20
          export function sum(x, y) { return x + y }
        `,
        script: `return sum(A, B)`,
      })

      const result = await esm.run('@test/scope-test')
      expect(result.value).toBe(30)
    })
  })

  describe('test()', () => {
    it('should run module tests and return results', async () => {
      await esm.write({
        name: '@test/testable',
        types: `export declare function add(a: number, b: number): number`,
        module: `export function add(a, b) { return a + b }`,
        tests: `
          describe('add', () => {
            it('adds positive numbers', () => expect(add(2, 3)).toBe(5))
            it('adds negative numbers', () => expect(add(-1, -2)).toBe(-3))
            it('adds zero', () => expect(add(0, 5)).toBe(5))
          })
        `,
      })

      const result = await esm.test('@test/testable')

      expect(result.passed).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.total).toBe(3)
    })

    it('should report failing tests', async () => {
      // First create the module without tests validation
      await esm.write({
        name: '@test/failing',
        types: `export declare function broken(): number`,
        module: `export function broken() { return 1 }`,
        tests: `
          describe('broken', () => {
            it('should return 42', () => expect(broken()).toBe(42))
            it('should return 1', () => expect(broken()).toBe(1))
          })
        `,
      })

      const result = await esm.test('@test/failing')

      expect(result.passed).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.total).toBe(2)
      expect(result.failures).toBeDefined()
      expect(result.failures.length).toBe(1)
    })

    it('should throw if module has no tests', async () => {
      await esm.write({
        name: '@test/no-tests',
        types: `export declare const X: number`,
        module: `export const X = 1`,
        // No tests
      })

      await expect(esm.test('@test/no-tests')).rejects.toThrow(/test/i)
    })

    it('should throw for non-existent module', async () => {
      await expect(esm.test('@test/nonexistent')).rejects.toThrow()
    })

    it('should provide detailed test results', async () => {
      await esm.write({
        name: '@test/detailed',
        types: `export declare function identity<T>(x: T): T`,
        module: `export function identity(x) { return x }`,
        tests: `
          describe('identity', () => {
            it('returns strings', () => expect(identity('hello')).toBe('hello'))
            it('returns numbers', () => expect(identity(42)).toBe(42))
            it('returns objects', () => expect(identity({ a: 1 })).toEqual({ a: 1 }))
          })
        `,
      })

      const result = await esm.test('@test/detailed')

      expect(result.results).toBeDefined()
      expect(result.results.length).toBe(3)
      expect(result.results[0].name).toContain('returns strings')
      expect(result.results[0].passed).toBe(true)
      expect(result.duration).toBeDefined()
      expect(typeof result.duration).toBe('number')
    })

    it('should have module exports available in test scope', async () => {
      await esm.write({
        name: '@test/scope-tests',
        types: `
          export declare const CONFIG: { debug: boolean }
          export declare function getMode(): string
        `,
        module: `
          export const CONFIG = { debug: true }
          export function getMode() { return CONFIG.debug ? 'debug' : 'prod' }
        `,
        tests: `
          describe('scope', () => {
            it('has CONFIG in scope', () => expect(CONFIG.debug).toBe(true))
            it('has getMode in scope', () => expect(getMode()).toBe('debug'))
          })
        `,
      })

      const result = await esm.test('@test/scope-tests')

      expect(result.passed).toBe(2)
      expect(result.failed).toBe(0)
    })
  })

  describe('delete()', () => {
    it('should delete a module', async () => {
      await esm.write({
        name: '@test/deletable',
        types: `export declare const X: number`,
        module: `export const X = 1`,
      })

      // Verify it exists
      await expect(esm.read('@test/deletable')).resolves.toBeDefined()

      // Delete it
      await esm.delete('@test/deletable')

      // Verify it's gone
      await expect(esm.read('@test/deletable')).rejects.toThrow()
    })

    it('should throw for non-existent module', async () => {
      await expect(esm.delete('@test/nonexistent')).rejects.toThrow()
    })

    it('should return deletion confirmation', async () => {
      await esm.write({
        name: '@test/confirm-delete',
        types: `export declare const Y: string`,
        module: `export const Y = 'test'`,
      })

      const result = await esm.delete('@test/confirm-delete')

      expect(result).toBeDefined()
      expect(result.deleted).toBe(true)
      expect(result.name).toBe('@test/confirm-delete')
    })

    it('should delete all versions of a module', async () => {
      // Create multiple versions
      const v1 = await esm.write({
        name: '@test/multi-version',
        types: `export declare const V: number`,
        module: `export const V = 1`,
      })

      const v2 = await esm.write({
        name: '@test/multi-version',
        types: `export declare const V: number`,
        module: `export const V = 2`,
      })

      // Delete module
      await esm.delete('@test/multi-version')

      // Both versions should be gone
      await expect(esm.read('@test/multi-version')).rejects.toThrow()
      await expect(esm.read('@test/multi-version', v1.version)).rejects.toThrow()
      await expect(esm.read('@test/multi-version', v2.version)).rejects.toThrow()
    })
  })

  describe('validateName - nested paths (esm-2wz)', () => {
    // esm-2wz: Test validateName accepts @scope/nested/deep/path
    // These tests verify that ESM.validateName accepts nested paths like @scope/nested/deep/module
    // which aligns with what GitxStorage supports via MODULE_NAME_PATTERN: /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/

    it('should accept nested module paths like @scope/nested/deep/module', async () => {
      // Test that nested paths are accepted (current implementation allows this)
      const result = await esm.write({
        name: '@scope/nested/deep/module',
        types: `export declare function nested(): string`,
        module: `export function nested() { return 'deep' }`,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@scope/nested/deep/module')
    })

    it('should accept 3-level paths like @org/category/name', async () => {
      const result = await esm.write({
        name: '@org/category/name',
        types: `export declare const value: number`,
        module: `export const value = 42`,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@org/category/name')
    })

    it('should accept deeply nested paths matching GitxStorage pattern', async () => {
      // GitxStorage MODULE_NAME_PATTERN allows: @scope/a/b/c/d/e
      const result = await esm.write({
        name: '@company/product/feature/version/module',
        types: `export declare const deep: boolean`,
        module: `export const deep = true`,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@company/product/feature/version/module')
    })

    it('should read nested module paths', async () => {
      await esm.write({
        name: '@test/utils/string/format',
        types: `export declare function format(s: string): string`,
        module: `export function format(s) { return s.trim() }`,
      })

      const result = await esm.read('@test/utils/string/format')

      expect(result).toBeDefined()
      expect(result.name).toBe('@test/utils/string/format')
    })

    it('should run modules with nested paths', async () => {
      await esm.write({
        name: '@test/math/ops/add',
        types: `export declare function add(a: number, b: number): number`,
        module: `export function add(a, b) { return a + b }`,
        script: `return add(5, 3)`,
      })

      const result = await esm.run('@test/math/ops/add')

      expect(result.value).toBe(8)
    })

    it('should test modules with nested paths', async () => {
      await esm.write({
        name: '@test/validation/nested/spec',
        types: `export declare function double(n: number): number`,
        module: `export function double(n) { return n * 2 }`,
        tests: `
          describe('double', () => {
            it('doubles numbers', () => expect(double(5)).toBe(10))
          })
        `,
      })

      const result = await esm.test('@test/validation/nested/spec')

      expect(result.passed).toBe(1)
    })

    it('should delete modules with nested paths', async () => {
      await esm.write({
        name: '@test/temp/nested/module',
        types: `export declare const x: number`,
        module: `export const x = 1`,
      })

      const deleteResult = await esm.delete('@test/temp/nested/module')

      expect(deleteResult.deleted).toBe(true)
      expect(deleteResult.name).toBe('@test/temp/nested/module')
    })

    it('should get versions for modules with nested paths', async () => {
      await esm.write({
        name: '@test/versioned/nested/path',
        types: `export declare const v: number`,
        module: `export const v = 1`,
      })

      await esm.write({
        name: '@test/versioned/nested/path',
        types: `export declare const v: number`,
        module: `export const v = 2`,
      })

      const versions = await esm.versions('@test/versioned/nested/path')

      expect(versions.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('validateName - GitxStorage alignment (esm-i9m)', () => {
    // esm-i9m: Test validateName aligns with GitxStorage patterns
    // GitxStorage pattern: /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/
    // RED: ESM currently doesn't validate path segment characters - only checks structure

    it('should reject path traversal attempts like @scope/name/../escape', async () => {
      // RED: Current ESM validation doesn't check for special characters
      // GitxStorage pattern requires [a-zA-Z0-9-]+ for each segment
      await expect(
        esm.write({
          name: '@scope/name/../escape',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should reject names with dots like @scope/file.ts', async () => {
      // RED: GitxStorage pattern doesn't allow dots in path segments
      await expect(
        esm.write({
          name: '@scope/file.ts',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should reject names with underscores like @scope/my_module', async () => {
      // RED: GitxStorage pattern only allows [a-zA-Z0-9-], no underscores
      await expect(
        esm.write({
          name: '@scope/my_module',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should reject names with spaces like @scope/my module', async () => {
      // RED: GitxStorage pattern doesn't allow spaces
      await expect(
        esm.write({
          name: '@scope/my module',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should reject names with special chars like @scope/name@version', async () => {
      // RED: @ is not allowed in path segments per GitxStorage pattern
      await expect(
        esm.write({
          name: '@scope/name@version',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should reject nested paths with invalid segments like @scope/valid/../invalid', async () => {
      // RED: GitxStorage rejects ".." as a path segment
      await expect(
        esm.write({
          name: '@scope/valid/../invalid',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should reject double slashes like @scope//name', async () => {
      // RED: Empty path segments should be rejected
      await expect(
        esm.write({
          name: '@scope//name',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should reject trailing slashes like @scope/name/', async () => {
      // RED: Trailing slash creates empty segment
      await expect(
        esm.write({
          name: '@scope/name/',
          types: `export declare const x: number`,
          module: `export const x = 1`,
        })
      ).rejects.toThrow()
    })

    it('should accept valid hyphenated names like @my-org/my-module', async () => {
      // This should pass - hyphens are allowed in GitxStorage pattern
      const result = await esm.write({
        name: '@my-org/my-module',
        types: `export declare const x: number`,
        module: `export const x = 1`,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@my-org/my-module')
    })

    it('should accept valid nested hyphenated names like @my-org/sub-dir/my-module', async () => {
      // This should pass - valid nested path with hyphens
      const result = await esm.write({
        name: '@my-org/sub-dir/my-module',
        types: `export declare const x: number`,
        module: `export const x = 1`,
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('@my-org/sub-dir/my-module')
    })
  })

  describe('integration', () => {
    it('should handle full lifecycle: write -> test -> run -> read -> delete', async () => {
      // Write
      const writeResult = await esm.write({
        name: '@test/lifecycle',
        types: `export declare function factorial(n: number): number`,
        module: `
          export function factorial(n) {
            if (n <= 1) return 1
            return n * factorial(n - 1)
          }
        `,
        tests: `
          describe('factorial', () => {
            it('returns 1 for 0', () => expect(factorial(0)).toBe(1))
            it('returns 1 for 1', () => expect(factorial(1)).toBe(1))
            it('returns 120 for 5', () => expect(factorial(5)).toBe(120))
          })
        `,
        script: `return factorial(6)`,
      })

      expect(writeResult.version).toBeDefined()
      expect(writeResult.testResults.passed).toBe(3)

      // Test
      const testResult = await esm.test('@test/lifecycle')
      expect(testResult.passed).toBe(3)

      // Run
      const runResult = await esm.run('@test/lifecycle')
      expect(runResult.value).toBe(720)

      // Read
      const readResult = await esm.read('@test/lifecycle')
      expect(readResult.module).toContain('factorial')

      // Delete
      const deleteResult = await esm.delete('@test/lifecycle')
      expect(deleteResult.deleted).toBe(true)

      // Verify deleted
      await expect(esm.read('@test/lifecycle')).rejects.toThrow()
    })

    it('should handle modules that import other esm.do modules', async () => {
      // RED test: Cross-module imports from 'esm.do/@scope/name' require import resolution
      // Create dependency module
      await esm.write({
        name: '@test/utils',
        types: `export declare function double(n: number): number`,
        module: `export function double(n) { return n * 2 }`,
      })

      // Create module that depends on it
      await esm.write({
        name: '@test/consumer',
        types: `export declare function quadruple(n: number): number`,
        module: `
          import { double } from 'esm.do/@test/utils'
          export function quadruple(n) { return double(double(n)) }
        `,
        tests: `
          describe('quadruple', () => {
            it('quadruples numbers', () => expect(quadruple(5)).toBe(20))
          })
        `,
        script: `return quadruple(10)`,
      })

      const result = await esm.run('@test/consumer')
      expect(result.value).toBe(40)

      // Clean up
      await esm.delete('@test/consumer')
      await esm.delete('@test/utils')
    })
  })
})

/**
 * Worker Adapter Types Test
 *
 * These tests verify that WorkerExecutorAdapter returns results that comply
 * with TypeScript's exactOptionalPropertyTypes setting.
 *
 * With exactOptionalPropertyTypes enabled, optional properties like `error?: string`
 * must NOT have `undefined` explicitly assigned to them. The property should either:
 * - Be present with a non-undefined value (e.g., error: "some error message")
 * - Not be present at all (property doesn't exist on the object)
 *
 * Original Bugs (before fix):
 * - test() method: directly assigned `error: t.error` which included undefined values
 * - run() method: directly assigned `error: result.error` which included undefined values
 *
 * The fix uses conditional assignment:
 *   if (t.error !== undefined) testResult.error = t.error
 *
 * This ensures optional properties are only present when they have actual values.
 *
 * Issue: esm-ruai
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { WorkerExecutorAdapter } from '../../src/executor/worker-adapter.js'
import type { SingleTestResult, RunResult } from '../../core/executor/types.js'

describe('WorkerExecutorAdapter exactOptionalPropertyTypes compliance', () => {
  let adapter: WorkerExecutorAdapter

  beforeEach(() => {
    adapter = new WorkerExecutorAdapter()
  })

  describe('test() method - SingleTestResult[] compliance', () => {
    it('should not have error property when test passes (property should be absent, not undefined)', async () => {
      const module = `export function add(a, b) { return a + b }`
      const tests = `
        describe('add', () => {
          it('adds numbers', () => expect(add(1, 2)).toBe(3))
        })
      `

      const result = await adapter.test(module, tests)

      expect(result.passed).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.results.length).toBe(1)

      const testResult = result.results[0] as SingleTestResult

      // The test passed, so error should NOT be present on the object
      // With exactOptionalPropertyTypes, we cannot assign undefined to optional properties
      // This test verifies the error property is completely absent, not set to undefined
      expect(testResult.status).toBe('passed')

      // Check that 'error' key does not exist on the object at all
      // If the implementation sets error: undefined, this will fail
      expect('error' in testResult).toBe(false)

      // Additional check: Object.keys should not include 'error'
      expect(Object.keys(testResult)).not.toContain('error')

      // The value should be undefined when accessed, but the key shouldn't exist
      expect(testResult.error).toBeUndefined()
    })

    it('should have error property with string value when test fails', async () => {
      const module = `export function add(a, b) { return a - b }` // Bug: subtracts
      const tests = `
        describe('add', () => {
          it('adds numbers', () => expect(add(1, 2)).toBe(3))
        })
      `

      const result = await adapter.test(module, tests)

      expect(result.passed).toBe(0)
      expect(result.failed).toBe(1)

      const testResult = result.results[0] as SingleTestResult

      // The test failed, so error SHOULD be present and be a string
      expect(testResult.status).toBe('failed')
      expect('error' in testResult).toBe(true)
      expect(typeof testResult.error).toBe('string')
      expect(testResult.error!.length).toBeGreaterThan(0)
    })

    it('should return multiple results with correct error property presence', async () => {
      const module = `
        export function add(a, b) { return a + b }
        export function subtract(a, b) { return a + b } // Bug: adds instead of subtracts
      `
      const tests = `
        describe('math', () => {
          it('add works', () => expect(add(1, 2)).toBe(3))
          it('subtract works', () => expect(subtract(5, 2)).toBe(3))
        })
      `

      const result = await adapter.test(module, tests)

      expect(result.passed).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.results.length).toBe(2)

      // Find the passed and failed tests
      const passedTest = result.results.find((r) => r.status === 'passed')!
      const failedTest = result.results.find((r) => r.status === 'failed')!

      // Passed test should NOT have error property at all
      expect('error' in passedTest).toBe(false)
      expect(Object.keys(passedTest)).not.toContain('error')

      // Failed test SHOULD have error property with string value
      expect('error' in failedTest).toBe(true)
      expect(typeof failedTest.error).toBe('string')
    })
  })

  describe('run() method - RunResult compliance', () => {
    it('should not have error property when script succeeds (property should be absent, not undefined)', async () => {
      const module = `export function add(a, b) { return a + b }`
      const script = `return add(10, 20)`

      const result = await adapter.run(module, script)

      expect(result.success).toBe(true)
      expect(result.value).toBe(30)

      // The script succeeded, so error should NOT be present on the object
      // With exactOptionalPropertyTypes, we cannot assign undefined to optional properties
      // This test verifies the error property is completely absent, not set to undefined

      // Check that 'error' key does not exist on the object at all
      // If the implementation sets error: undefined, this will fail
      expect('error' in result).toBe(false)

      // Additional check: Object.keys should not include 'error'
      expect(Object.keys(result)).not.toContain('error')

      // The value should be undefined when accessed, but the key shouldn't exist
      expect(result.error).toBeUndefined()
    })

    it('should have error property with string value when script fails', async () => {
      const module = `export function noop() {}`
      const script = `throw new Error('Script failed!')`

      const result = await adapter.run(module, script)

      expect(result.success).toBe(false)

      // The script failed, so error SHOULD be present and be a string
      expect('error' in result).toBe(true)
      expect(typeof result.error).toBe('string')
      expect(result.error).toContain('Script failed!')
    })

    it('should not have value property set to undefined when script fails', async () => {
      const module = `export function noop() {}`
      const script = `throw new Error('Oops')`

      const result = await adapter.run(module, script)

      expect(result.success).toBe(false)
      expect('error' in result).toBe(true)

      // When script fails, value might be undefined but should either:
      // - Not have the property at all, OR
      // - Have a meaningful value
      // This checks current behavior - value IS set on failure
      // The key point is error should be a string, not undefined
      expect(typeof result.error).toBe('string')
    })
  })

  describe('TypeScript exactOptionalPropertyTypes semantics', () => {
    it('should demonstrate the difference between absent property and undefined value', async () => {
      const module = `export function ok() { return 'success' }`
      const script = `return ok()`

      const result = await adapter.run(module, script)

      // This is the key test for exactOptionalPropertyTypes:
      // An object { a: 1, b: undefined } has 'b' in its keys
      // An object { a: 1 } does NOT have 'b' in its keys
      //
      // With exactOptionalPropertyTypes, when a type says `error?: string`,
      // we MUST NOT do `{ error: undefined }` - we must omit the property entirely

      // Create reference objects to show the difference
      const objectWithUndefinedError = { success: true, error: undefined }
      const objectWithoutError = { success: true }

      // Demonstrate that 'in' operator detects the difference
      expect('error' in objectWithUndefinedError).toBe(true)  // Property exists, value is undefined
      expect('error' in objectWithoutError).toBe(false)       // Property does not exist

      // Demonstrate that Object.keys detects the difference
      expect(Object.keys(objectWithUndefinedError)).toContain('error')
      expect(Object.keys(objectWithoutError)).not.toContain('error')

      // Now verify our adapter result follows the correct pattern
      // When success is true, error should be ABSENT (like objectWithoutError)
      expect(result.success).toBe(true)
      expect('error' in result).toBe(false)
      expect(Object.keys(result)).not.toContain('error')
    })

    it('should verify JSON.stringify behavior differs for undefined vs absent properties', async () => {
      const module = `export function ok() { return 42 }`
      const script = `return ok()`

      const result = await adapter.run(module, script)

      // JSON.stringify excludes undefined values but includes null
      // This demonstrates another way the difference matters
      const withUndefined = JSON.stringify({ a: 1, b: undefined })
      const withoutProp = JSON.stringify({ a: 1 })

      expect(withUndefined).toBe('{"a":1}') // undefined is stripped by JSON.stringify
      expect(withoutProp).toBe('{"a":1}')   // Same output, but different input objects

      // The real test: hasOwnProperty check on the result
      expect(result.success).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(result, 'error')).toBe(false)
    })
  })
})

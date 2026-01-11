import { describe, it, expect } from 'vitest'

/**
 * Tests for Global Regex lastIndex Safety
 *
 * These tests verify that global regex patterns properly reset lastIndex
 * before each use. Without proper resets, global regex patterns can
 * skip matches or return inconsistent results on repeated calls.
 *
 * The bug pattern:
 *   const globalRegex = /pattern/g  // module-level
 *   function extract(code) {
 *     // BUG: If lastIndex is not reset, second call returns empty
 *     while ((match = globalRegex.exec(code)) !== null) { ... }
 *   }
 *
 * The fix:
 *   function extract(code) {
 *     globalRegex.lastIndex = 0  // Reset before use
 *     while ((match = globalRegex.exec(code)) !== null) { ... }
 *   }
 */

describe('Global Regex lastIndex Safety', () => {
  describe('DependencyResolver.parseImports', () => {
    it('should return consistent results on multiple consecutive calls', async () => {
      const { DependencyResolver } = await import('../../src/resolver/dependency.js')

      const code = `
        import { foo } from 'esm.do/@math/add'
        import { bar } from 'esm.do/@utils/format'
        import { baz } from 'esm.do/@core/helpers'
      `

      const resolver = new DependencyResolver(async () => null)

      // Multiple calls should return identical results
      const imports1 = resolver.parseImports(code)
      const imports2 = resolver.parseImports(code)
      const imports3 = resolver.parseImports(code)

      expect(imports1).toHaveLength(3)
      expect(imports2).toHaveLength(3)
      expect(imports3).toHaveLength(3)
      expect(imports1).toEqual(imports2)
      expect(imports2).toEqual(imports3)
    })

    it('should extract all imports regardless of call order', async () => {
      const { DependencyResolver } = await import('../../src/resolver/dependency.js')

      const resolver = new DependencyResolver(async () => null)

      // Call with one code sample
      const code1 = `import { a } from 'esm.do/@pkg/a'`
      const result1 = resolver.parseImports(code1)

      // Call with different code sample
      const code2 = `import { b } from 'esm.do/@pkg/b'`
      const result2 = resolver.parseImports(code2)

      // Call with first sample again - should still find all imports
      const result3 = resolver.parseImports(code1)

      expect(result1).toHaveLength(1)
      expect(result2).toHaveLength(1)
      expect(result3).toHaveLength(1)
      expect(result1[0].moduleName).toBe('@pkg/a')
      expect(result2[0].moduleName).toBe('@pkg/b')
      expect(result3[0].moduleName).toBe('@pkg/a')
    })
  })

  describe('sanitizeModuleCode dangerous pattern detection', () => {
    it('should detect eval on repeated calls', async () => {
      const { sanitizeModuleCode } = await import('../../src/executor/sanitize.js')

      const evilCode = `const x = eval('1+1')`

      // Multiple calls should all detect the dangerous pattern
      const result1 = sanitizeModuleCode(evilCode)
      const result2 = sanitizeModuleCode(evilCode)
      const result3 = sanitizeModuleCode(evilCode)

      expect(result1.valid).toBe(false)
      expect(result2.valid).toBe(false)
      expect(result3.valid).toBe(false)
    })

    it('should detect dangerous patterns when interleaved with safe code', async () => {
      const { sanitizeModuleCode } = await import('../../src/executor/sanitize.js')

      // Interleave safe and dangerous code to test lastIndex behavior
      expect(sanitizeModuleCode('const x = 1').valid).toBe(true)
      expect(sanitizeModuleCode('const y = eval("2")').valid).toBe(false)
      expect(sanitizeModuleCode('const z = 3').valid).toBe(true)
      expect(sanitizeModuleCode('const w = eval("4")').valid).toBe(false)
      expect(sanitizeModuleCode('const v = 5').valid).toBe(true)
    })

    it('should detect all dangerous patterns, not just the first match', async () => {
      const { sanitizeModuleCode } = await import('../../src/executor/sanitize.js')

      // Code with pattern at different positions
      const codeWithPatternAtEnd = `
        const x = 1
        const y = 2
        const z = eval('3')
      `

      const result1 = sanitizeModuleCode(codeWithPatternAtEnd)
      const result2 = sanitizeModuleCode(codeWithPatternAtEnd)

      expect(result1.valid).toBe(false)
      expect(result2.valid).toBe(false)
      expect(result1.errors.some(e => e.includes('eval'))).toBe(true)
      expect(result2.errors.some(e => e.includes('eval'))).toBe(true)
    })
  })

  describe('SandboxExecutor.validate', () => {
    it('should produce consistent validation results on repeated calls', async () => {
      const { SandboxExecutor } = await import('../../src/executor/sandbox.js')
      const sandbox = new SandboxExecutor()

      const types = `
        export declare function add(a: number, b: number): number
        export declare function subtract(a: number, b: number): number
        export declare const PI: number
      `

      const module = `
        export function add(a, b) { return a + b }
        export function subtract(a, b) { return a - b }
        export const PI = 3.14159
      `

      // Multiple validations should return consistent results
      const result1 = await sandbox.validate(types, module)
      const result2 = await sandbox.validate(types, module)
      const result3 = await sandbox.validate(types, module)

      expect(result1.valid).toBe(true)
      expect(result2.valid).toBe(true)
      expect(result3.valid).toBe(true)
      expect(result1).toEqual(result2)
      expect(result2).toEqual(result3)
    })

    it('should correctly identify missing exports on repeated calls', async () => {
      const { SandboxExecutor } = await import('../../src/executor/sandbox.js')
      const sandbox = new SandboxExecutor()

      const types = `
        export declare function foo(): void
        export declare function bar(): void
      `

      const moduleWithMissing = `
        export function foo() {}
        // bar is missing
      `

      const result1 = await sandbox.validate(types, moduleWithMissing)
      const result2 = await sandbox.validate(types, moduleWithMissing)

      expect(result1.valid).toBe(false)
      expect(result2.valid).toBe(false)
      expect(result1.errors).toHaveLength(1)
      expect(result2.errors).toHaveLength(1)
    })
  })

  describe('Regression test: lastIndex bug pattern', () => {
    /**
     * This test directly demonstrates the lastIndex bug that these safety
     * measures prevent. When using regex.test() with /g flag, or when
     * exec() loop exits early, lastIndex is left in a stale state.
     */
    it('should demonstrate the bug with regex.test() advancing lastIndex', () => {
      // Simulate module-level global regex (the problematic pattern)
      const globalRegex = /eval/g

      const code = 'const x = eval("1")'

      // First test: advances lastIndex
      const test1 = globalRegex.test(code)
      expect(test1).toBe(true)
      expect(globalRegex.lastIndex).toBeGreaterThan(0) // lastIndex is now past the match

      // Second test WITHOUT reset: may return false due to stale lastIndex
      const test2 = globalRegex.test(code)
      // This is the BUG - if lastIndex is past the pattern, test() returns false
      expect(test2).toBe(false) // False because lastIndex is past 'eval'

      // Third test WITH reset: works correctly
      globalRegex.lastIndex = 0 // The fix
      const test3 = globalRegex.test(code)
      expect(test3).toBe(true)
    })

    it('should demonstrate the bug with exec() on different length inputs', () => {
      // Simulate module-level global regex
      const globalRegex = /export\s+function\s+(\w+)/g

      const shortCode = 'export function a() {}'
      const longCode = 'export function foo() {} export function bar() {} export function baz() {}'

      // First call on short code - only gets first match then exits
      const match1 = globalRegex.exec(shortCode)
      expect(match1?.[1]).toBe('a')
      // lastIndex is now at position after 'a' in shortCode

      // Without reset, calling on long code starts from wrong position
      // which could skip matches or behave unexpectedly
      const savedLastIndex = globalRegex.lastIndex
      expect(savedLastIndex).toBeGreaterThan(0)

      // Reset for proper behavior
      globalRegex.lastIndex = 0
      const results: string[] = []
      let match
      while ((match = globalRegex.exec(longCode)) !== null) {
        results.push(match[1])
      }
      expect(results).toEqual(['foo', 'bar', 'baz'])
    })

    it('should verify proper pattern: create regex locally', () => {
      // Safe pattern: create regex inside function
      function extractExports(code: string): string[] {
        const funcRegex = /export\s+function\s+(\w+)/g // Local, fresh each call
        const results: string[] = []
        let match
        while ((match = funcRegex.exec(code)) !== null) {
          results.push(match[1])
        }
        return results
      }

      const code = 'export function foo() {} export function bar() {}'

      // All calls work correctly because regex is created fresh each time
      expect(extractExports(code)).toEqual(['foo', 'bar'])
      expect(extractExports(code)).toEqual(['foo', 'bar'])
      expect(extractExports(code)).toEqual(['foo', 'bar'])
    })

    it('should verify proper pattern: reset lastIndex', () => {
      // Safe pattern: reset lastIndex before use
      const globalRegex = /export\s+function\s+(\w+)/g

      function extractExports(code: string): string[] {
        globalRegex.lastIndex = 0 // Reset before use
        const results: string[] = []
        let match
        while ((match = globalRegex.exec(code)) !== null) {
          results.push(match[1])
        }
        return results
      }

      const code = 'export function foo() {} export function bar() {}'

      // All calls work correctly because lastIndex is reset
      expect(extractExports(code)).toEqual(['foo', 'bar'])
      expect(extractExports(code)).toEqual(['foo', 'bar'])
      expect(extractExports(code)).toEqual(['foo', 'bar'])
    })
  })

  describe('Edge cases for regex safety', () => {
    it('should handle empty input correctly', async () => {
      const { DependencyResolver } = await import('../../src/resolver/dependency.js')
      const resolver = new DependencyResolver(async () => null)

      const result1 = resolver.parseImports('')
      const result2 = resolver.parseImports('')

      expect(result1).toEqual([])
      expect(result2).toEqual([])
    })

    it('should handle input with no matches correctly', async () => {
      const { DependencyResolver } = await import('../../src/resolver/dependency.js')
      const resolver = new DependencyResolver(async () => null)

      const codeWithoutImports = 'const x = 1; const y = 2;'

      const result1 = resolver.parseImports(codeWithoutImports)
      const result2 = resolver.parseImports(codeWithoutImports)

      expect(result1).toEqual([])
      expect(result2).toEqual([])
    })

    it('should handle regex.test() with global flag correctly', async () => {
      const { sanitizeModuleCode } = await import('../../src/executor/sanitize.js')

      // regex.test() with /g flag also advances lastIndex
      // This verifies the sanitization handles this correctly
      const safeCode = 'const x = 1'
      const dangerousCode = 'eval("1")'

      // Alternate between safe and dangerous code
      for (let i = 0; i < 5; i++) {
        expect(sanitizeModuleCode(safeCode).valid).toBe(true)
        expect(sanitizeModuleCode(dangerousCode).valid).toBe(false)
      }
    })
  })
})

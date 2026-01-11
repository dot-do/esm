import { describe, it, expect } from 'vitest'
import { extractExportNames } from '../../src/utils/exports.js'

describe('extractExportNames', () => {

  describe('named exports', () => {
    it('should extract simple named exports', () => {
      const code = `export const foo = 1; export const bar = 2;`
      expect(extractExportNames(code)).toContain('foo')
      expect(extractExportNames(code)).toContain('bar')
    })

    it('should extract function exports', () => {
      const code = `export function myFunc() {} export async function asyncFunc() {}`
      expect(extractExportNames(code)).toContain('myFunc')
      expect(extractExportNames(code)).toContain('asyncFunc')
    })

    it('should extract class exports', () => {
      const code = `export class MyClass {}`
      expect(extractExportNames(code)).toContain('MyClass')
    })
  })

  describe('default exports', () => {
    it('should detect default export', () => {
      const code = `export default function() {}`
      expect(extractExportNames(code)).toContain('default')
    })
  })

  describe('re-exports', () => {
    it('should extract re-exports', () => {
      const code = `export { foo, bar } from './other'`
      expect(extractExportNames(code)).toContain('foo')
      expect(extractExportNames(code)).toContain('bar')
    })

    it('should handle renamed re-exports', () => {
      const code = `export { foo as renamed } from './other'`
      expect(extractExportNames(code)).toContain('renamed')
    })
  })

  describe('edge cases', () => {
    it('should ignore exports in comments', () => {
      const code = `// export const commented = 1\nexport const real = 2`
      expect(extractExportNames(code)).not.toContain('commented')
      expect(extractExportNames(code)).toContain('real')
    })

    it('should ignore exports in strings', () => {
      const code = `const str = "export const fake = 1"; export const real = 2`
      expect(extractExportNames(code)).not.toContain('fake')
      expect(extractExportNames(code)).toContain('real')
    })

    it('should handle multiline exports', () => {
      const code = `export {\n  foo,\n  bar,\n  baz\n}`
      expect(extractExportNames(code)).toEqual(expect.arrayContaining(['foo', 'bar', 'baz']))
    })
  })

  describe('consistency with existing implementations', () => {
    it('should match behavior of src/esm.ts implementation', () => {
      // Test case from src/esm.ts:410-433
      const code = `export const add = (a, b) => a + b`
      expect(extractExportNames(code)).toContain('add')
    })
  })
})

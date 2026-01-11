// tests/utils/exports.test.ts
import { describe, it, expect } from 'vitest'

describe('extractExportNames utility', () => {
  describe('named exports', () => {
    it('should extract named function exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export function foo() {}`
      const exports = extractExportNames(code)
      expect(exports).toContain('foo')
    })

    it('should extract multiple named function exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `
        export function foo() {}
        export function bar() {}
      `
      const exports = extractExportNames(code)
      expect(exports).toContain('foo')
      expect(exports).toContain('bar')
    })

    it('should extract named const exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export const myConst = 42;`
      const exports = extractExportNames(code)
      expect(exports).toContain('myConst')
    })

    it('should extract named let exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export let myLet = 'hello';`
      const exports = extractExportNames(code)
      expect(exports).toContain('myLet')
    })

    it('should extract named var exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export var myVar = true;`
      const exports = extractExportNames(code)
      expect(exports).toContain('myVar')
    })

    it('should extract async function exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export async function asyncFoo() {}`
      const exports = extractExportNames(code)
      expect(exports).toContain('asyncFoo')
    })
  })

  describe('default exports', () => {
    it('should extract default export from identifier', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export default x`
      const exports = extractExportNames(code)
      expect(exports).toContain('default')
    })

    it('should extract default export from function', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export default function myFunc() {}`
      const exports = extractExportNames(code)
      expect(exports).toContain('default')
    })

    it('should extract default export from class', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export default class MyClass {}`
      const exports = extractExportNames(code)
      expect(exports).toContain('default')
    })

    it('should extract default export from expression', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export default { a: 1, b: 2 }`
      const exports = extractExportNames(code)
      expect(exports).toContain('default')
    })
  })

  describe('re-exports', () => {
    it('should extract named re-exports from another module', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export { a, b } from './x'`
      const exports = extractExportNames(code)
      expect(exports).toContain('a')
      expect(exports).toContain('b')
    })

    it('should extract renamed re-exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export { foo as bar } from './module'`
      const exports = extractExportNames(code)
      expect(exports).toContain('bar')
      expect(exports).not.toContain('foo')
    })

    it('should extract namespace re-exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export * as utils from './utils'`
      const exports = extractExportNames(code)
      expect(exports).toContain('utils')
    })

    it('should handle export all without namespace (export *)', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export * from './other'`
      // export * doesn't create named exports, just passes through
      const exports = extractExportNames(code)
      expect(exports).toEqual([])
    })
  })

  describe('class exports', () => {
    it('should extract named class exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export class X {}`
      const exports = extractExportNames(code)
      expect(exports).toContain('X')
    })

    it('should extract class with extends', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export class Child extends Parent {}`
      const exports = extractExportNames(code)
      expect(exports).toContain('Child')
    })

    it('should extract abstract class exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export abstract class AbstractBase {}`
      const exports = extractExportNames(code)
      expect(exports).toContain('AbstractBase')
    })
  })

  describe('mixed exports', () => {
    it('should extract all export types from a mixed module', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `
        export function foo() {}
        export class Bar {}
        export const baz = 1;
        export { x, y } from './other';
        export default main;
      `
      const exports = extractExportNames(code)
      expect(exports).toContain('foo')
      expect(exports).toContain('Bar')
      expect(exports).toContain('baz')
      expect(exports).toContain('x')
      expect(exports).toContain('y')
      expect(exports).toContain('default')
    })
  })

  describe('edge cases', () => {
    it('should return empty array for code with no exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `const internal = 'not exported';`
      const exports = extractExportNames(code)
      expect(exports).toEqual([])
    })

    it('should handle empty string input', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const exports = extractExportNames('')
      expect(exports).toEqual([])
    })

    it('should handle destructured const exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export const { a, b } = obj;`
      const exports = extractExportNames(code)
      expect(exports).toContain('a')
      expect(exports).toContain('b')
    })

    it('should handle array destructured const exports', async () => {
      const { extractExportNames } = await import('../../src/utils/exports.js')
      const code = `export const [first, second] = arr;`
      const exports = extractExportNames(code)
      expect(exports).toContain('first')
      expect(exports).toContain('second')
    })
  })
})

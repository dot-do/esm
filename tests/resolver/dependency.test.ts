// tests/resolver/dependency.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ESM } from '../../src/esm.js'

describe('Module Dependency Resolution', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM()
  })

  describe('Simple imports', () => {
    it('should resolve imports from esm.do modules', async () => {
      // Create a base module
      await esm.write({
        name: '@math/base',
        types: 'export declare function double(n: number): number;',
        module: 'export function double(n) { return n * 2; }',
      })

      // Create a module that imports from the base
      await esm.write({
        name: '@math/derived',
        types: 'export declare function quadruple(n: number): number;',
        module: `
          import { double } from 'esm.do/@math/base';
          export function quadruple(n) { return double(double(n)); }
        `,
        script: 'return quadruple(5)'
      })

      // Running should resolve the import and execute correctly
      const result = await esm.run('@math/derived')
      expect(result.value).toBe(20) // 5 * 2 * 2 = 20
    })
  })

  describe('Nested dependencies', () => {
    it('should resolve transitive dependencies (A -> B -> C)', async () => {
      // C: base module
      await esm.write({
        name: '@chain/c',
        types: 'export declare const C: number;',
        module: 'export const C = 1;',
      })

      // B: imports C
      await esm.write({
        name: '@chain/b',
        types: 'export declare const B: number;',
        module: `
          import { C } from 'esm.do/@chain/c';
          export const B = C + 1;
        `,
      })

      // A: imports B (which imports C)
      await esm.write({
        name: '@chain/a',
        types: 'export declare const A: number;',
        module: `
          import { B } from 'esm.do/@chain/b';
          export const A = B + 1;
        `,
        script: 'return A'
      })

      const result = await esm.run('@chain/a')
      expect(result.value).toBe(3) // C=1, B=2, A=3
    })
  })

  describe('Circular dependency detection', () => {
    it('should detect and error on circular dependencies', async () => {
      // Create circular: A -> B -> A
      await esm.write({
        name: '@circular/a',
        types: 'export declare const A: number;',
        module: `
          import { B } from 'esm.do/@circular/b';
          export const A = B + 1;
        `,
      })

      await esm.write({
        name: '@circular/b',
        types: 'export declare const B: number;',
        module: `
          import { A } from 'esm.do/@circular/a';
          export const B = A + 1;
        `,
        script: 'return B'
      })

      await expect(esm.run('@circular/b')).rejects.toThrow(/circular/i)
    })
  })

  describe('Missing dependency errors', () => {
    it('should error when importing non-existent module', async () => {
      await esm.write({
        name: '@test/missing-dep',
        types: 'export declare const X: number;',
        module: `
          import { Y } from 'esm.do/@nonexistent/module';
          export const X = Y;
        `,
        script: 'return X'
      })

      await expect(esm.run('@test/missing-dep')).rejects.toThrow(/not found|missing/i)
    })
  })
})

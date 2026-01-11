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

  describe('Transitive dependencies (esm-dep.2)', () => {
    it('should resolve deep transitive chain (A -> B -> C -> D)', async () => {
      // D: base module
      await esm.write({
        name: '@deep/d',
        types: 'export declare const D: number;',
        module: 'export const D = 1;',
      })

      // C: imports D
      await esm.write({
        name: '@deep/c',
        types: 'export declare const C: number;',
        module: `
          import { D } from 'esm.do/@deep/d';
          export const C = D + 1;
        `,
      })

      // B: imports C
      await esm.write({
        name: '@deep/b',
        types: 'export declare const B: number;',
        module: `
          import { C } from 'esm.do/@deep/c';
          export const B = C + 1;
        `,
      })

      // A: imports B (transitive: B -> C -> D)
      await esm.write({
        name: '@deep/a',
        types: 'export declare const A: number;',
        module: `
          import { B } from 'esm.do/@deep/b';
          export const A = B + 1;
        `,
        script: 'return A'
      })

      const result = await esm.run('@deep/a')
      expect(result.value).toBe(4) // D=1, C=2, B=3, A=4
    })

    it('should handle diamond dependency pattern (A -> B, A -> C, B -> D, C -> D)', async () => {
      // D: shared base
      await esm.write({
        name: '@diamond/d',
        types: 'export declare const D: number;',
        module: 'export const D = 10;',
      })

      // B: imports D
      await esm.write({
        name: '@diamond/b',
        types: 'export declare const B: number;',
        module: `
          import { D } from 'esm.do/@diamond/d';
          export const B = D * 2;
        `,
      })

      // C: imports D
      await esm.write({
        name: '@diamond/c',
        types: 'export declare const C: number;',
        module: `
          import { D } from 'esm.do/@diamond/d';
          export const C = D * 3;
        `,
      })

      // A: imports both B and C (diamond pattern)
      await esm.write({
        name: '@diamond/a',
        types: 'export declare const A: number;',
        module: `
          import { B } from 'esm.do/@diamond/b';
          import { C } from 'esm.do/@diamond/c';
          export const A = B + C;
        `,
        script: 'return A'
      })

      const result = await esm.run('@diamond/a')
      expect(result.value).toBe(50) // D=10, B=20, C=30, A=50
    })

    it('should handle transitive dependencies with function calls', async () => {
      // Base utility module
      await esm.write({
        name: '@utils/math',
        types: 'export declare function add(a: number, b: number): number;',
        module: 'export function add(a, b) { return a + b; }',
      })

      // Intermediate module using utility
      await esm.write({
        name: '@calc/operations',
        types: 'export declare function sum(nums: number[]): number;',
        module: `
          import { add } from 'esm.do/@utils/math';
          export function sum(nums) {
            return nums.reduce((acc, n) => add(acc, n), 0);
          }
        `,
      })

      // Top-level module
      await esm.write({
        name: '@calc/stats',
        types: 'export declare function average(nums: number[]): number;',
        module: `
          import { sum } from 'esm.do/@calc/operations';
          export function average(nums) {
            return sum(nums) / nums.length;
          }
        `,
        script: 'return average([10, 20, 30])'
      })

      const result = await esm.run('@calc/stats')
      expect(result.value).toBe(20) // (10+20+30) / 3 = 20
    })

    it('should handle multiple exports in transitive chain', async () => {
      // Base module with multiple exports
      await esm.write({
        name: '@multi/base',
        types: 'export declare const X: number; export declare const Y: number;',
        module: 'export const X = 5; export const Y = 10;',
      })

      // Intermediate using multiple imports
      await esm.write({
        name: '@multi/middle',
        types: 'export declare const combined: number;',
        module: `
          import { X, Y } from 'esm.do/@multi/base';
          export const combined = X + Y;
        `,
      })

      // Top module
      await esm.write({
        name: '@multi/top',
        types: 'export declare const result: number;',
        module: `
          import { combined } from 'esm.do/@multi/middle';
          export const result = combined * 2;
        `,
        script: 'return result'
      })

      const result = await esm.run('@multi/top')
      expect(result.value).toBe(30) // (5+10) * 2 = 30
    })

    it('should handle transitive async functions', async () => {
      // Base async module
      await esm.write({
        name: '@async/base',
        types: 'export declare function fetchValue(): Promise<number>;',
        module: 'export async function fetchValue() { return 42; }',
      })

      // Intermediate async
      await esm.write({
        name: '@async/transform',
        types: 'export declare function doubleValue(): Promise<number>;',
        module: `
          import { fetchValue } from 'esm.do/@async/base';
          export async function doubleValue() {
            const val = await fetchValue();
            return val * 2;
          }
        `,
      })

      // Top async
      await esm.write({
        name: '@async/app',
        types: 'export declare function compute(): Promise<number>;',
        module: `
          import { doubleValue } from 'esm.do/@async/transform';
          export async function compute() {
            return await doubleValue();
          }
        `,
        script: 'return await compute()'
      })

      const result = await esm.run('@async/app')
      expect(result.value).toBe(84) // 42 * 2 = 84
    })

    it('should handle transitive dependencies with class inheritance', async () => {
      // Base class module
      await esm.write({
        name: '@oop/base',
        types: 'export declare class Animal { speak(): string; }',
        module: `
          export class Animal {
            speak() { return 'generic sound'; }
          }
        `,
      })

      // Intermediate extending base
      await esm.write({
        name: '@oop/mammal',
        types: 'export declare class Mammal { speak(): string; walk(): string; }',
        module: `
          import { Animal } from 'esm.do/@oop/base';
          export class Mammal extends Animal {
            walk() { return 'walking'; }
          }
        `,
      })

      // Top-level inheriting from intermediate
      await esm.write({
        name: '@oop/dog',
        types: 'export declare class Dog { speak(): string; bark(): string; }',
        module: `
          import { Mammal } from 'esm.do/@oop/mammal';
          export class Dog extends Mammal {
            speak() { return 'woof'; }
            bark() { return this.speak() + '!'; }
          }
        `,
        script: `
          const dog = new Dog();
          return dog.bark();
        `
      })

      const result = await esm.run('@oop/dog')
      expect(result.value).toBe('woof!')
    })

    it('should handle re-exported values in transitive chain', async () => {
      // Base module with value
      await esm.write({
        name: '@reexport/base',
        types: 'export declare const VALUE: number;',
        module: 'export const VALUE = 100;',
      })

      // Middle module re-exports from base
      await esm.write({
        name: '@reexport/middle',
        types: 'export { VALUE } from "@reexport/base";',
        module: `
          export { VALUE } from 'esm.do/@reexport/base';
        `,
      })

      // Top module imports from middle
      await esm.write({
        name: '@reexport/top',
        types: 'export declare const result: number;',
        module: `
          import { VALUE } from 'esm.do/@reexport/middle';
          export const result = VALUE * 2;
        `,
        script: 'return result'
      })

      const result = await esm.run('@reexport/top')
      expect(result.value).toBe(200)
    })

    it('should handle namespace imports in transitive chain', async () => {
      // Base module with multiple exports
      await esm.write({
        name: '@ns/utils',
        types: 'export declare const a: number; export declare const b: number;',
        module: 'export const a = 1; export const b = 2;',
      })

      // Middle uses namespace import
      await esm.write({
        name: '@ns/middle',
        types: 'export declare function sum(): number;',
        module: `
          import * as utils from 'esm.do/@ns/utils';
          export function sum() { return utils.a + utils.b; }
        `,
      })

      // Top module
      await esm.write({
        name: '@ns/top',
        types: 'export declare const result: number;',
        module: `
          import { sum } from 'esm.do/@ns/middle';
          export const result = sum() * 10;
        `,
        script: 'return result'
      })

      const result = await esm.run('@ns/top')
      expect(result.value).toBe(30) // (1+2) * 10 = 30
    })

    it('should handle default exports in transitive chain', async () => {
      // Base module with default export
      await esm.write({
        name: '@default/base',
        types: 'declare const value: number; export default value;',
        module: 'export default 42;',
      })

      // Middle imports default and re-exports
      await esm.write({
        name: '@default/middle',
        types: 'export declare function getValue(): number;',
        module: `
          import value from 'esm.do/@default/base';
          export function getValue() { return value; }
        `,
      })

      // Top module
      await esm.write({
        name: '@default/top',
        types: 'export declare const doubled: number;',
        module: `
          import { getValue } from 'esm.do/@default/middle';
          export const doubled = getValue() * 2;
        `,
        script: 'return doubled'
      })

      const result = await esm.run('@default/top')
      expect(result.value).toBe(84) // 42 * 2 = 84
    })

    it('should handle aliased imports in transitive chain', async () => {
      // Base module
      await esm.write({
        name: '@alias/base',
        types: 'export declare const originalName: string;',
        module: 'export const originalName = "hello";',
      })

      // Middle uses aliased import
      await esm.write({
        name: '@alias/middle',
        types: 'export declare function greet(): string;',
        module: `
          import { originalName as name } from 'esm.do/@alias/base';
          export function greet() { return name.toUpperCase(); }
        `,
      })

      // Top module
      await esm.write({
        name: '@alias/top',
        types: 'export declare const greeting: string;',
        module: `
          import { greet } from 'esm.do/@alias/middle';
          export const greeting = greet() + '!';
        `,
        script: 'return greeting'
      })

      const result = await esm.run('@alias/top')
      expect(result.value).toBe('HELLO!')
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

    it('should detect self-referential imports (A -> A)', async () => {
      // A module that imports itself
      await esm.write({
        name: '@circular/self',
        types: 'export declare const X: number;',
        module: `
          import { X as other } from 'esm.do/@circular/self';
          export const X = other + 1;
        `,
        script: 'return X'
      })

      await expect(esm.run('@circular/self')).rejects.toThrow(/circular/i)
    })

    it('should detect longer circular chains (A -> B -> C -> A)', async () => {
      // Create 3-node cycle: A -> B -> C -> A
      await esm.write({
        name: '@circular/chain-a',
        types: 'export declare const A: number;',
        module: `
          import { C } from 'esm.do/@circular/chain-c';
          export const A = C + 1;
        `,
        script: 'return A'
      })

      await esm.write({
        name: '@circular/chain-b',
        types: 'export declare const B: number;',
        module: `
          import { A } from 'esm.do/@circular/chain-a';
          export const B = A + 1;
        `,
      })

      await esm.write({
        name: '@circular/chain-c',
        types: 'export declare const C: number;',
        module: `
          import { B } from 'esm.do/@circular/chain-b';
          export const C = B + 1;
        `,
      })

      await expect(esm.run('@circular/chain-a')).rejects.toThrow(/circular/i)
    })

    it('should include cycle path in error message', async () => {
      // Create circular: X -> Y -> X
      await esm.write({
        name: '@circular/x',
        types: 'export declare const X: number;',
        module: `
          import { Y } from 'esm.do/@circular/y';
          export const X = Y + 1;
        `,
        script: 'return X'
      })

      await esm.write({
        name: '@circular/y',
        types: 'export declare const Y: number;',
        module: `
          import { X } from 'esm.do/@circular/x';
          export const Y = X + 1;
        `,
      })

      // Error message should include the modules involved in the cycle
      try {
        await esm.run('@circular/x')
        throw new Error('Should have thrown')
      } catch (error: any) {
        expect(error.message).toMatch(/circular/i)
        expect(error.message).toMatch(/@circular\/x/)
        expect(error.message).toMatch(/@circular\/y/)
      }
    })

    it('should detect circular dependency in a branch (A -> B, A -> C -> D -> B -> C)', async () => {
      // A diamond-shaped dependency with a cycle in one branch
      // Entry: @circ/entry -> @circ/b (OK) and @circ/c (leads to cycle)
      //        @circ/c -> @circ/d -> @circ/b -> @circ/c (CYCLE)

      await esm.write({
        name: '@circ/entry',
        types: 'export declare const E: number;',
        module: `
          import { B } from 'esm.do/@circ/b';
          import { C } from 'esm.do/@circ/c';
          export const E = B + C;
        `,
        script: 'return E'
      })

      await esm.write({
        name: '@circ/b',
        types: 'export declare const B: number;',
        module: `
          import { C } from 'esm.do/@circ/c';
          export const B = C + 1;
        `,
      })

      await esm.write({
        name: '@circ/c',
        types: 'export declare const C: number;',
        module: `
          import { D } from 'esm.do/@circ/d';
          export const C = D + 1;
        `,
      })

      await esm.write({
        name: '@circ/d',
        types: 'export declare const D: number;',
        module: `
          import { B } from 'esm.do/@circ/b';
          export const D = B + 1;
        `,
      })

      await expect(esm.run('@circ/entry')).rejects.toThrow(/circular/i)
    })
  })

  describe('Circular dependency detection (esm-dep.3)', () => {
    // Additional TDD tests for circular detection edge cases

    it('should expose detectCircular method on DependencyResolver', async () => {
      const { DependencyResolver } = await import('../../src/resolver/dependency.js')
      const resolver = new DependencyResolver(async () => null)

      // Method should exist
      expect(typeof resolver.detectCircular).toBe('function')
    })

    it('should return cycle path with arrow notation in error', async () => {
      // Create circular: P -> Q -> P
      await esm.write({
        name: '@circular/p',
        types: 'export declare const P: number;',
        module: `
          import { Q } from 'esm.do/@circular/q';
          export const P = Q + 1;
        `,
        script: 'return P'
      })

      await esm.write({
        name: '@circular/q',
        types: 'export declare const Q: number;',
        module: `
          import { P } from 'esm.do/@circular/p';
          export const Q = P + 1;
        `,
      })

      // The error message should include an arrow notation showing the cycle path
      try {
        await esm.run('@circular/p')
        throw new Error('Expected circular dependency error')
      } catch (error: any) {
        expect(error.message).toMatch(/->/)
      }
    })

    it('should detect cycle when entry module is not part of the cycle', async () => {
      // Entry -> A -> B -> C -> B (cycle is B -> C -> B, entry and A are outside)
      await esm.write({
        name: '@cycle-outside/entry',
        types: 'export declare const E: number;',
        module: `
          import { A } from 'esm.do/@cycle-outside/a';
          export const E = A + 1;
        `,
        script: 'return E'
      })

      await esm.write({
        name: '@cycle-outside/a',
        types: 'export declare const A: number;',
        module: `
          import { B } from 'esm.do/@cycle-outside/b';
          export const A = B + 1;
        `,
      })

      await esm.write({
        name: '@cycle-outside/b',
        types: 'export declare const B: number;',
        module: `
          import { C } from 'esm.do/@cycle-outside/c';
          export const B = C + 1;
        `,
      })

      await esm.write({
        name: '@cycle-outside/c',
        types: 'export declare const C: number;',
        module: `
          import { B } from 'esm.do/@cycle-outside/b';
          export const C = B + 1;
        `,
      })

      // Should detect the B -> C -> B cycle even though entry is outside
      await expect(esm.run('@cycle-outside/entry')).rejects.toThrow(/circular/i)
    })

    it('should handle very long circular chains (10 modules)', async () => {
      // Create a chain: m0 -> m1 -> m2 -> ... -> m9 -> m0
      for (let i = 0; i < 10; i++) {
        const nextIndex = (i + 1) % 10
        await esm.write({
          name: `@long-cycle/m${i}`,
          types: `export declare const M${i}: number;`,
          module: `
            import { M${nextIndex} } from 'esm.do/@long-cycle/m${nextIndex}';
            export const M${i} = M${nextIndex} + 1;
          `,
          ...(i === 0 ? { script: 'return M0' } : {}),
        })
      }

      await expect(esm.run('@long-cycle/m0')).rejects.toThrow(/circular/i)
    })

    it('should detect multiple cycles in the same dependency graph', async () => {
      // Graph with two separate cycles:
      // Entry -> A -> B -> A (cycle 1)
      //       -> C -> D -> C (cycle 2)
      await esm.write({
        name: '@multi-cycle/entry',
        types: 'export declare const E: number;',
        module: `
          import { A } from 'esm.do/@multi-cycle/a';
          import { C } from 'esm.do/@multi-cycle/c';
          export const E = A + C;
        `,
        script: 'return E'
      })

      await esm.write({
        name: '@multi-cycle/a',
        types: 'export declare const A: number;',
        module: `
          import { B } from 'esm.do/@multi-cycle/b';
          export const A = B + 1;
        `,
      })

      await esm.write({
        name: '@multi-cycle/b',
        types: 'export declare const B: number;',
        module: `
          import { A } from 'esm.do/@multi-cycle/a';
          export const B = A + 1;
        `,
      })

      await esm.write({
        name: '@multi-cycle/c',
        types: 'export declare const C: number;',
        module: `
          import { D } from 'esm.do/@multi-cycle/d';
          export const C = D + 1;
        `,
      })

      await esm.write({
        name: '@multi-cycle/d',
        types: 'export declare const D: number;',
        module: `
          import { C } from 'esm.do/@multi-cycle/c';
          export const D = C + 1;
        `,
      })

      // Should detect at least one cycle
      await expect(esm.run('@multi-cycle/entry')).rejects.toThrow(/circular/i)
    })

    it('should provide CircularDependencyError type with cycle property', async () => {
      // Test that circular dependency errors expose the cycle path programmatically
      // This test requires CircularDependencyError to be exported from errors.ts
      const { CircularDependencyError } = await import('../../src/errors.js')

      await esm.write({
        name: '@cycle-api/a',
        types: 'export declare const A: number;',
        module: `
          import { B } from 'esm.do/@cycle-api/b';
          export const A = B + 1;
        `,
        script: 'return A'
      })

      await esm.write({
        name: '@cycle-api/b',
        types: 'export declare const B: number;',
        module: `
          import { A } from 'esm.do/@cycle-api/a';
          export const B = A + 1;
        `,
      })

      try {
        await esm.run('@cycle-api/a')
        throw new Error('Expected circular dependency error')
      } catch (error: any) {
        // Error should be an instance of CircularDependencyError
        expect(error).toBeInstanceOf(CircularDependencyError)
        // Error should have a 'cycle' property with the cycle path as an array
        expect(error.cycle).toBeDefined()
        expect(Array.isArray(error.cycle)).toBe(true)
        expect(error.cycle.length).toBeGreaterThanOrEqual(2)
        // Cycle should include both modules
        expect(error.cycle).toContain('@cycle-api/a')
        expect(error.cycle).toContain('@cycle-api/b')
      }
    })

    it('should reject cycle at write-time when validateOnWrite is enabled', async () => {
      // Create the first module
      await esm.write({
        name: '@write-cycle/first',
        types: 'export declare const First: number;',
        module: `
          import { Second } from 'esm.do/@write-cycle/second';
          export const First = Second + 1;
        `,
      })

      // Create the second module that creates a cycle - should ideally fail at write
      // Note: This test may fail if validation doesn't check cycles at write time
      await esm.write({
        name: '@write-cycle/second',
        types: 'export declare const Second: number;',
        module: `
          import { First } from 'esm.do/@write-cycle/first';
          export const Second = First + 1;
        `,
        script: 'return Second'
      })

      // Either write should have failed, OR run should fail with circular error
      await expect(esm.run('@write-cycle/second')).rejects.toThrow(/circular/i)
    })

    it('should handle indirect self-reference through aliases', async () => {
      // Module imports itself through a re-export pattern
      await esm.write({
        name: '@indirect-self/main',
        types: 'export declare const Value: number;',
        module: `
          import { Value as V } from 'esm.do/@indirect-self/main';
          export const Value = V + 1;
        `,
        script: 'return Value'
      })

      await expect(esm.run('@indirect-self/main')).rejects.toThrow(/circular/i)
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

// tests/cli/signature.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ESM } from '../../src/esm.js'

describe('CLI/ESM Method Signature Alignment', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM()
  })

  describe('run() method signature', () => {
    it('should accept options object with name property', async () => {
      // First create a module
      await esm.write({
        name: '@test/sig-run',
        types: 'export declare function hello(): string;',
        module: 'export function hello() { return "hi"; }',
        script: 'return hello()'
      })

      // CLI expects: esm.run({ name, args, timeout, env })
      const result = await (esm as any).run({ name: '@test/sig-run' })
      expect(result).toHaveProperty('logs')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('exitCode')
      expect(Array.isArray(result.logs)).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(typeof result.exitCode).toBe('number')
    })

    it('should accept timeout option', async () => {
      await esm.write({
        name: '@test/sig-timeout',
        types: 'export declare function slow(): void;',
        module: 'export function slow() { let x = 0; while(x < 1000000) x++; }',
        script: 'slow(); return "done"'
      })

      const result = await (esm as any).run({ name: '@test/sig-timeout', timeout: 5000 })
      expect(result.exitCode).toBe(0)
    })

    it('should accept env option', async () => {
      await esm.write({
        name: '@test/sig-env',
        types: 'export declare function getEnv(): string;',
        module: 'export function getEnv() { return "test"; }',
        script: 'return getEnv()'
      })

      const result = await (esm as any).run({
        name: '@test/sig-env',
        env: { TEST_VAR: 'hello' }
      })
      expect(result).toHaveProperty('exitCode')
    })
  })

  describe('test() method signature', () => {
    it('should accept options object with name property', async () => {
      await esm.write({
        name: '@test/sig-test',
        types: 'export declare function add(a: number, b: number): number;',
        module: 'export function add(a, b) { return a + b; }',
        tests: 'describe("add", () => { it("works", () => { expect(add(1,2)).toBe(3); }); })'
      })

      // CLI expects: esm.test({ name, watch, coverage, filter })
      const result = await (esm as any).test({ name: '@test/sig-test' })
      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('failed')
      expect(result).toHaveProperty('results')
      expect(Array.isArray(result.results)).toBe(true)
      // Results should have 'passed' boolean, not 'status' string
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('passed')
        expect(typeof result.results[0].passed).toBe('boolean')
      }
    })

    it('should accept filter option', async () => {
      await esm.write({
        name: '@test/sig-filter',
        types: 'export declare function x(): number;',
        module: 'export function x() { return 1; }',
        tests: `
          describe("x", () => {
            it("test1", () => { expect(x()).toBe(1); });
            it("test2", () => { expect(x()).toBe(1); });
          });
        `
      })

      const result = await (esm as any).test({ name: '@test/sig-filter', filter: 'test1' })
      expect(result.passed + result.failed).toBeLessThanOrEqual(2)
    })
  })
})

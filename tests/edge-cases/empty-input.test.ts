// tests/edge-cases/empty-input.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ESM } from '../../src/esm.js'

describe('Empty Input Edge Cases', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM()
  })

  describe('Empty module content', () => {
    it('should handle empty types gracefully', async () => {
      const result = await esm.write({
        name: '@test/empty-types',
        types: '',
        module: 'export function x() { return 1; }',
      })

      // Should either succeed with warning or fail with clear error
      expect(result.name).toBe('@test/empty-types')
    })

    it('should handle empty module code gracefully', async () => {
      await expect(esm.write({
        name: '@test/empty-module',
        types: 'export declare function x(): number;',
        module: '',
      })).rejects.toThrow(/module.*required|empty.*module/i)
    })

    it('should handle whitespace-only module code', async () => {
      await expect(esm.write({
        name: '@test/whitespace-module',
        types: 'export {};',
        module: '   \n\t\n   ',
      })).rejects.toThrow(/module.*required|empty|whitespace/i)
    })
  })

  describe('Empty tests and script', () => {
    it('should handle empty tests string', async () => {
      const result = await esm.write({
        name: '@test/empty-tests',
        types: 'export declare function x(): number;',
        module: 'export function x() { return 1; }',
        tests: '',
      })

      expect(result.name).toBe('@test/empty-tests')
    })

    it('should handle empty script string', async () => {
      const result = await esm.write({
        name: '@test/empty-script',
        types: 'export declare function x(): number;',
        module: 'export function x() { return 1; }',
        script: '',
      })

      expect(result.name).toBe('@test/empty-script')
    })

    it('should error when running module with empty script', async () => {
      await esm.write({
        name: '@test/no-script',
        types: 'export declare function x(): number;',
        module: 'export function x() { return 1; }',
        script: '',
      })

      await expect(esm.run('@test/no-script')).rejects.toThrow(/no script|empty script/i)
    })

    it('should error when testing module with empty tests', async () => {
      await esm.write({
        name: '@test/no-tests',
        types: 'export declare function x(): number;',
        module: 'export function x() { return 1; }',
        tests: '',
      })

      await expect(esm.test('@test/no-tests')).rejects.toThrow(/no tests|empty tests/i)
    })
  })

  describe('Empty name handling', () => {
    it('should reject empty module name', async () => {
      await expect(esm.write({
        name: '',
        types: 'export {};',
        module: 'export {};',
      })).rejects.toThrow(/name.*required|empty.*name/i)
    })

    it('should reject whitespace-only module name', async () => {
      await expect(esm.write({
        name: '   ',
        types: 'export {};',
        module: 'export {};',
      })).rejects.toThrow(/name.*required|invalid.*name/i)
    })
  })
})

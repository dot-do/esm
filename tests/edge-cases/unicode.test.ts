// tests/edge-cases/unicode.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ESM } from '../../src/esm.js'

describe('Unicode Handling', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM()
  })

  describe('Unicode in module names', () => {
    // Module names are restricted to ASCII alphanumeric characters and hyphens
    // to ensure compatibility with file systems, URLs, and package managers.
    // Unicode is fully supported in module CONTENT, just not in names.

    it('should reject unicode characters in scope', async () => {
      await expect(
        esm.write({
          name: '@日本語/module',
          types: 'export declare function x(): string;',
          module: 'export function x() { return "hello"; }',
        })
      ).rejects.toThrow('Module name must be in format @scope/name with alphanumeric characters and hyphens only')
    })

    it('should reject unicode characters in module name', async () => {
      await expect(
        esm.write({
          name: '@test/模块',
          types: 'export declare function x(): string;',
          module: 'export function x() { return "hello"; }',
        })
      ).rejects.toThrow('Module name must be in format @scope/name with alphanumeric characters and hyphens only')
    })

    it('should reject emoji in module name', async () => {
      await expect(
        esm.write({
          name: '@test/emoji-🚀',
          types: 'export declare function x(): string;',
          module: 'export function x() { return "hello"; }',
        })
      ).rejects.toThrow('Module name must be in format @scope/name with alphanumeric characters and hyphens only')
    })
  })

  describe('Unicode in module content', () => {
    it('should preserve unicode in module code', async () => {
      await esm.write({
        name: '@test/unicode-content',
        types: 'export declare function getMessage(): string;',
        module: 'export function getMessage() { return "こんにちは世界"; }',
        script: 'return getMessage()',
      })

      const result = await esm.run('@test/unicode-content')
      expect(result.value).toBe('こんにちは世界')
    })

    it('should preserve emoji in module code', async () => {
      await esm.write({
        name: '@test/emoji-content',
        types: 'export declare function getEmoji(): string;',
        module: 'export function getEmoji() { return "Hello 👋 World 🌍"; }',
        script: 'return getEmoji()',
      })

      const result = await esm.run('@test/emoji-content')
      expect(result.value).toBe('Hello 👋 World 🌍')
    })

    it('should handle unicode in type definitions', async () => {
      const result = await esm.write({
        name: '@test/unicode-types',
        types: '/** 返回问候语 */\nexport declare function greet(名前: string): string;',
        module: 'export function greet(name) { return "Hello " + name; }',
      })
      expect(result.version).toBeDefined()
    })

    it('should handle unicode in test descriptions', async () => {
      await esm.write({
        name: '@test/unicode-tests',
        types: 'export declare function add(a: number, b: number): number;',
        module: 'export function add(a, b) { return a + b; }',
        tests: `
          describe('加法', () => {
            it('应该正确相加', () => {
              expect(add(1, 2)).toBe(3);
            });
          });
        `,
      })

      const testResult = await esm.test('@test/unicode-tests')
      expect(testResult.passed).toBe(1)
    })

    it('should handle unicode in console output', async () => {
      await esm.write({
        name: '@test/unicode-logs',
        types: 'export declare function log(): void;',
        module: 'export function log() { console.log("日志消息 🔥"); }',
        script: 'log(); return "done"',
      })

      const result = await esm.run('@test/unicode-logs')
      expect(result.logs).toContain('日志消息 🔥')
    })
  })
})

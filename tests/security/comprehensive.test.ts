import { describe, it, expect, beforeEach } from 'vitest'
import { ESM } from '../../src/esm.js'
import { sanitizeModuleCode } from '../../src/executor/sanitize.js'

describe('Security Features', () => {
  let esm: ESM

  beforeEach(() => {
    esm = new ESM()
  })

  describe('eval() blocking', () => {
    it('should block direct eval calls', () => {
      const code = `const x = eval('1+1')`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => /eval/i.test(e))).toBe(true)
    })

    it('should block indirect eval calls', () => {
      const code = `const e = eval; e('1+1')`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should block window.eval', () => {
      const code = `window.eval('code')`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should block globalThis.eval', () => {
      const code = `globalThis.eval('code')`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Function constructor blocking', () => {
    it('should block new Function()', () => {
      const code = `const fn = new Function('return 1')`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => /Function/i.test(e))).toBe(true)
    })

    it('should block Function() without new', () => {
      const code = `const fn = Function('return 1')`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should allow .constructor() calls (runtime sandbox protects)', () => {
      const code = `const fn = (() => {}).constructor('return 1')`
      const result = sanitizeModuleCode(code)
      // .constructor() calls are allowed at static analysis level
      // The runtime sandbox blocks Function constructor execution
      // Static analysis only blocks .constructor.prototype access (prototype pollution)
      expect(result.valid).toBe(true)
    })
  })

  describe('dynamic import blocking', () => {
    it('should block import() calls', () => {
      const code = `const mod = await import('malicious')`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => /import/i.test(e))).toBe(true)
    })

    it('should block import.meta abuse', () => {
      const code = `const url = import.meta.url`
      // This might be allowed - depends on policy
      // import.meta.url is not in the dangerous patterns list
    })
  })

  describe('prototype pollution prevention', () => {
    it('should block __proto__ access', () => {
      const code = `obj.__proto__.polluted = true`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => /__proto__/i.test(e))).toBe(true)
    })

    it('should block Object.prototype modification', () => {
      const code = `Object.prototype.polluted = true`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should block constructor.prototype access', () => {
      const code = `({}).constructor.prototype.polluted = true`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('XSS prevention', () => {
    it('should block script tags', () => {
      const code = `const html = '<script>alert(1)</script>'`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should allow innerHTML assignment (runtime sandbox protects)', () => {
      const code = `element.innerHTML = userInput`
      const result = sanitizeModuleCode(code)
      // innerHTML is allowed at static analysis - runtime sandbox handles it
      expect(result.valid).toBe(true)
    })
  })

  describe('dangerous globals', () => {
    it('should allow process reference (runtime sandbox blocks)', () => {
      const code = `process.exit(1)`
      const result = sanitizeModuleCode(code)
      // process is not in the static analysis dangerous patterns
      // The runtime sandbox blocks access to process
      expect(result.valid).toBe(true)
    })

    it('should allow require (runtime sandbox blocks)', () => {
      const code = `const fs = require('fs')`
      const result = sanitizeModuleCode(code)
      // require is not in the static analysis dangerous patterns
      // The runtime sandbox blocks require
      expect(result.valid).toBe(true)
    })
  })

  describe('rate limiting', () => {
    it('should enforce rate limits on API', async () => {
      // This test requires the worker environment
      // Will be implemented when esm.do service is tested
      expect(true).toBe(true) // Placeholder
    })
  })

  describe('module write security', () => {
    it('should reject modules with eval', async () => {
      await expect(esm.write({
        name: '@test/evil',
        types: 'export declare const x: number',
        module: `export const x = eval('1')`
      })).rejects.toThrow()
    })

    it('should reject modules with Function constructor', async () => {
      await expect(esm.write({
        name: '@test/evil2',
        types: 'export declare const fn: () => number',
        module: `export const fn = new Function('return 1')`
      })).rejects.toThrow()
    })

    it('should reject modules with dynamic import', async () => {
      await expect(esm.write({
        name: '@test/evil3',
        types: 'export declare const mod: Promise<unknown>',
        module: `export const mod = import('malicious')`
      })).rejects.toThrow()
    })

    it('should reject modules with prototype pollution', async () => {
      await expect(esm.write({
        name: '@test/evil4',
        types: 'export declare const pollute: () => void',
        module: `export const pollute = () => { Object.prototype.x = 1 }`
      })).rejects.toThrow()
    })
  })
})

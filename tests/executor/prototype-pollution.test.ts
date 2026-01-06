// tests/executor/prototype-pollution.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeModuleCode, sanitizeScriptCode } from '../../src/executor/sanitize.js'

describe('Prototype Pollution Prevention', () => {
  describe('__proto__ access', () => {
    it('should block __proto__ assignment', () => {
      const code = `export function pollute() { ({}).__proto__.polluted = true; }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('proto') || e.includes('pollution'))).toBe(true)
    })

    it('should block __proto__ in object literal', () => {
      const code = `export const obj = { "__proto__": { polluted: true } };`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block indirect __proto__ access', () => {
      const code = `export function pollute(obj) { obj['__proto__']['polluted'] = true; }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('Object.prototype modification', () => {
    it('should block Object.prototype assignment', () => {
      const code = `export function pollute() { Object.prototype.polluted = true; }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block Object.defineProperty on prototype', () => {
      const code = `export function pollute() { Object.defineProperty(Object.prototype, 'x', { value: 1 }); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('constructor.prototype access', () => {
    it('should block constructor.prototype modification', () => {
      const code = `export function pollute(obj) { obj.constructor.prototype.polluted = true; }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('Array.prototype modification', () => {
    it('should block Array.prototype modification', () => {
      const code = `export function pollute() { Array.prototype.polluted = true; }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('Function.prototype modification', () => {
    it('should block Function.prototype modification', () => {
      const code = `export function pollute() { Function.prototype.polluted = true; }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('Script sanitization', () => {
    it('should block prototype pollution in scripts', () => {
      const code = `({}).__proto__.polluted = true;`
      const result = sanitizeScriptCode(code)
      expect(result.valid).toBe(false)
    })
  })
})

// tests/executor/dynamic-code.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeModuleCode, sanitizeScriptCode } from '../../src/executor/sanitize.js'

describe('Dynamic Code Detection', () => {
  describe('eval() detection', () => {
    it('should block direct eval()', () => {
      const code = `export function run(code) { return eval(code); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.toLowerCase().includes('eval'))).toBe(true)
    })

    it('should block window.eval()', () => {
      const code = `export function run(code) { return window.eval(code); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block globalThis.eval()', () => {
      const code = `export function run(code) { return globalThis.eval(code); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block indirect eval via variable', () => {
      const code = `const e = eval; export function run(code) { return e(code); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('Function constructor detection', () => {
    it('should block new Function()', () => {
      const code = `export function create(body) { return new Function(body); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.toLowerCase().includes('function'))).toBe(true)
    })

    it('should block Function() without new', () => {
      const code = `export function create(body) { return Function(body)(); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block Function constructor with arguments', () => {
      const code = `export function create(a, b, body) { return new Function(a, b, body); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('Dynamic import() detection', () => {
    it('should block dynamic import()', () => {
      const code = `export async function load(mod) { return await import(mod); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.toLowerCase().includes('import'))).toBe(true)
    })

    it('should block import() with template literal', () => {
      const code = 'export async function load(name) { return await import(`./modules/${name}`); }'
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })

  describe('Script code sanitization', () => {
    it('should block eval in scripts', () => {
      const code = `eval('alert(1)')`
      const result = sanitizeScriptCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block Function constructor in scripts', () => {
      const code = `new Function('return 1')()`
      const result = sanitizeScriptCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block dynamic import in scripts', () => {
      const code = `await import('./malicious.js')`
      const result = sanitizeScriptCode(code)
      expect(result.valid).toBe(false)
    })
  })
})

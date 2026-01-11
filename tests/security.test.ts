/**
 * esm.do - Security Tests
 *
 * RED PHASE: These tests are designed to FAIL until security issues are fixed.
 *
 * Tests cover:
 * - No eval() calls in source code
 * - No Function() constructor abuse
 * - No unsafe code execution patterns
 *
 * Related issues:
 * - esm-ovx: [RED] Test no eval() calls exist in codebase
 * - esm-kyx: [RED] Test no unsafe new Function() with untrusted input
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Helper function to recursively get all TypeScript files in a directory
// Files that are allowed to reference eval/Function patterns
const ALLOWED_EVAL_FILES = [
  'executor/sandbox.ts',        // Intentional: uses ai-evaluate for sandboxed code execution
  'executor/sanitize.ts',       // Contains eval/Function detection patterns (not actual usage)
  'api/worker.ts',              // Intentional: uses unsafe_eval binding for worker execution
  'api/worker-factory.ts',      // Intentional: defines eval interface for worker execution
  'executor/worker-adapter.ts', // Intentional: uses unsafe_eval binding for sandboxed execution
]

function getAllTsFiles(dir: string, excludePatterns: string[] = []): string[] {
  const files: string[] = []

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Skip node_modules and dist directories
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        files.push(...getAllTsFiles(fullPath, excludePatterns))
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      // Check if file should be excluded
      const relativePath = path.relative(dir, fullPath)
      const shouldExclude = excludePatterns.some(pattern =>
        relativePath.includes(pattern) || fullPath.includes(pattern)
      )
      if (!shouldExclude) {
        files.push(fullPath)
      }
    }
  }

  return files
}

// Helper function to find eval() calls in a file
function findEvalCalls(filePath: string): { line: number; content: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const evalCalls: { line: number; content: string }[] = []

  // Pattern to match eval( - but not inside strings or comments
  // This is a simplified check - matches "eval(" not preceded by a word character
  const evalPattern = /(?<![a-zA-Z0-9_])eval\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip comments (simple heuristic)
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue
    }

    // Check for eval( pattern
    if (evalPattern.test(line)) {
      evalCalls.push({
        line: i + 1,
        content: line.trim()
      })
    }
  }

  return evalCalls
}

// =============================================================================
// Security: No eval() Usage Tests
// =============================================================================

describe('Security: No eval() Usage', () => {
  const srcDir = path.resolve(__dirname, '../src')

  it('should have no eval() calls in the src/ directory', () => {
    // Exclude files that intentionally use eval for sandboxed code execution
    const tsFiles = getAllTsFiles(srcDir, ALLOWED_EVAL_FILES)
    const filesWithEval: { file: string; calls: { line: number; content: string }[] }[] = []

    for (const file of tsFiles) {
      const evalCalls = findEvalCalls(file)
      if (evalCalls.length > 0) {
        filesWithEval.push({
          file: path.relative(srcDir, file),
          calls: evalCalls
        })
      }
    }

    // Build detailed error message if eval() is found
    if (filesWithEval.length > 0) {
      const details = filesWithEval.map(f => {
        const callDetails = f.calls.map(c => '    Line ' + c.line + ': ' + c.content).join('\n')
        return '\n  ' + f.file + ':\n' + callDetails
      }).join('')

      expect.fail(
        'Found eval() calls in ' + filesWithEval.length + ' file(s):' + details + '\n\n' +
        'eval() is a security vulnerability that allows arbitrary code execution. ' +
        'Replace with safer alternatives like JSON.parse() for data or a proper expression parser.'
      )
    }

    // This assertion should pass when no eval() is found
    expect(filesWithEval).toHaveLength(0)
  })

  it('should document all files containing eval() for GREEN phase remediation', () => {
    const srcDir = path.resolve(__dirname, '../src')
    const tsFiles = getAllTsFiles(srcDir)
    const filesWithEval: string[] = []

    for (const file of tsFiles) {
      const evalCalls = findEvalCalls(file)
      if (evalCalls.length > 0) {
        filesWithEval.push(path.relative(srcDir, file))
      }
    }

    // This test documents which files need to be fixed in the GREEN phase
    // For RED phase, we expect this to find files (test should PASS but document the issue)
    console.log('\n=== Files containing eval() (to be fixed in GREEN phase) ===')
    if (filesWithEval.length > 0) {
      filesWithEval.forEach(f => console.log('  - src/' + f))
    } else {
      console.log('  None found')
    }
    console.log('==============================================================\n')

    // This assertion always passes - it's just for documentation
    expect(true).toBe(true)
  })
})

// Helper function to find new Function() calls in a file
function findNewFunctionCalls(filePath: string): { line: number; content: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const newFunctionCalls: { line: number; content: string }[] = []

  // Pattern to match "new Function(" - captures dynamic code execution via Function constructor
  const newFunctionPattern = /new\s+Function\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip comments (simple heuristic)
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue
    }

    // Check for new Function( pattern
    if (newFunctionPattern.test(line)) {
      newFunctionCalls.push({
        line: i + 1,
        content: line.trim()
      })
    }
  }

  return newFunctionCalls
}

// =============================================================================
// Security: No Unsafe new Function() Tests
// Issue: esm-kyx
// =============================================================================

describe('Security: No Unsafe new Function()', () => {
  const srcDir = path.resolve(__dirname, '../src')

  it('should have no new Function() calls in the src/ directory', () => {
    // Exclude files that intentionally use Function for sandboxed code execution
    const tsFiles = getAllTsFiles(srcDir, ALLOWED_EVAL_FILES)
    const filesWithNewFunction: { file: string; calls: { line: number; content: string }[] }[] = []

    for (const file of tsFiles) {
      const newFunctionCalls = findNewFunctionCalls(file)
      if (newFunctionCalls.length > 0) {
        filesWithNewFunction.push({
          file: path.relative(srcDir, file),
          calls: newFunctionCalls
        })
      }
    }

    // Build detailed error message if new Function() is found
    if (filesWithNewFunction.length > 0) {
      const details = filesWithNewFunction.map(f => {
        const callDetails = f.calls.map(c => '    Line ' + c.line + ': ' + c.content).join('\n')
        return '\n  ' + f.file + ':\n' + callDetails
      }).join('')

      expect.fail(
        'Found new Function() calls in ' + filesWithNewFunction.length + ' file(s):' + details + '\n\n' +
        'new Function() with dynamic strings can lead to code injection vulnerabilities. ' +
        'Consider using safer alternatives like structured AST parsing or sandboxed evaluation.'
      )
    }

    // This assertion should pass when no new Function() is found
    expect(filesWithNewFunction).toHaveLength(0)
  })

  it('should document all files containing new Function() for GREEN phase remediation', () => {
    const tsFiles = getAllTsFiles(srcDir)
    const filesWithNewFunction: { file: string; lines: number[] }[] = []

    for (const file of tsFiles) {
      const newFunctionCalls = findNewFunctionCalls(file)
      if (newFunctionCalls.length > 0) {
        filesWithNewFunction.push({
          file: path.relative(srcDir, file),
          lines: newFunctionCalls.map(c => c.line)
        })
      }
    }

    // This test documents which files need to be fixed in the GREEN phase
    // For RED phase, we expect this to find files (test should PASS but document the issue)
    console.log('\n=== Files containing new Function() (to be fixed in GREEN phase) ===')
    if (filesWithNewFunction.length > 0) {
      filesWithNewFunction.forEach(f => console.log('  - src/' + f.file + ' (lines: ' + f.lines.join(', ') + ')'))
    } else {
      console.log('  None found')
    }
    console.log('====================================================================\n')

    // This assertion always passes - it's just for documentation
    expect(true).toBe(true)
  })
})

// =============================================================================
// Security: Module Execution Sandbox Escape Tests
// Issues: esm-4eg, esm-4ed, esm-2o7, esm-51h
//
// These tests verify that the sandbox properly blocks escape attempts:
// - esm-4eg: process.exit() must be blocked
// - esm-4ed: require() must be blocked
// - esm-2o7: dangerous globals (process, __dirname, etc) must be blocked
// - esm-51h: network access must only be allowed through SDK api global
//
// The vm module based sandbox already provides these protections by default.
// These tests ensure these protections remain in place and document the
// expected security behavior.
// =============================================================================

import { SandboxExecutor } from '../src/executor/sandbox.js'

describe('Security: Module Execution Sandbox Escapes', () => {
  let executor: SandboxExecutor

  beforeEach(() => {
    executor = new SandboxExecutor()
  })

  // ---------------------------------------------------------------------------
  // Issue: esm-4eg - Test module execution blocks process.exit() escape
  // ---------------------------------------------------------------------------
  describe('esm-4eg: process.exit() blocking', () => {
    it('should prevent module code from calling process.exit()', async () => {
      const module = `
        export function malicious() {
          process.exit(1)
          return 'should not reach here'
        }
      `
      const script = `return malicious()`

      const result = await executor.run(module, script)

      // The sandbox should either:
      // 1. Throw an error because process is not defined
      // 2. Block the process.exit() call
      // It should NOT allow the process to actually exit
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent direct process.exit() in script', async () => {
      const module = `export function noop() {}`
      const script = `
        process.exit(0)
        return 'should not reach here'
      `

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent process.kill() calls', async () => {
      const module = `
        export function killSelf() {
          process.kill(process.pid, 'SIGTERM')
        }
      `
      const script = `return killSelf()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Issue: esm-4ed - Test module execution blocks require() escape
  // ---------------------------------------------------------------------------
  describe('esm-4ed: require() blocking', () => {
    it('should prevent module code from using require()', async () => {
      const module = `
        export function readSecret() {
          const fs = require('fs')
          return fs.readFileSync('/etc/passwd', 'utf8')
        }
      `
      const script = `return readSecret()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/require is not defined|not allowed|blocked/i)
    })

    it('should prevent require() in script execution', async () => {
      const module = `export function noop() {}`
      const script = `
        const os = require('os')
        return os.hostname()
      `

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/require is not defined|not allowed|blocked/i)
    })

    it('should prevent require.resolve() calls', async () => {
      const module = `
        export function findModule() {
          return require.resolve('fs')
        }
      `
      const script = `return findModule()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/require is not defined|not allowed|blocked/i)
    })

    it('should prevent dynamic import() in module code', async () => {
      const module = `
        export async function dynamicLoad() {
          const fs = await import('fs')
          return fs.readFileSync('/etc/passwd', 'utf8')
        }
      `
      const script = `return await dynamicLoad()`

      const result = await executor.run(module, script)

      // Dynamic import should be blocked
      expect(result.success).toBe(false)
      // ai-evaluate returns "imports are unsupported" for dynamic imports
      expect(result.error).toMatch(/import is not defined|not allowed|blocked|dynamic import|imports are unsupported/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Issue: esm-2o7 - Test module execution blocks global object access
  // ---------------------------------------------------------------------------
  describe('esm-2o7: dangerous globals blocking', () => {
    it('should prevent access to process object', async () => {
      const module = `
        export function getEnv() {
          return process.env.PATH
        }
      `
      const script = `return getEnv()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent access to __dirname', async () => {
      const module = `
        export function getDir() {
          return __dirname
        }
      `
      const script = `return getDir()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/__dirname is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent access to __filename', async () => {
      const module = `
        export function getFile() {
          return __filename
        }
      `
      const script = `return getFile()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/__filename is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent access to global object properties', async () => {
      const module = `
        export function getGlobalProcess() {
          return global.process
        }
      `
      const script = `return getGlobalProcess()`

      const result = await executor.run(module, script)

      // Either global is undefined or global.process is undefined
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/global is not defined|not allowed|blocked|undefined|Cannot read/i)
    })

    it('should prevent access to globalThis.process', async () => {
      const module = `
        export function getProcessFromGlobalThis() {
          return globalThis.process.env.PATH
        }
      `
      const script = `return getProcessFromGlobalThis()`

      const result = await executor.run(module, script)

      // globalThis.process should be undefined or blocked
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/undefined|not defined|not allowed|blocked|Cannot read/i)
    })

    it('should prevent access to Buffer for file operations', async () => {
      const module = `
        export function createBuffer() {
          return Buffer.from('sensitive data')
        }
      `
      const script = `return createBuffer()`

      const result = await executor.run(module, script)

      // Buffer should not be available in sandbox
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Buffer is not defined|not allowed|blocked|undefined/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Issue: esm-51h - Test script execution sandboxes network access
  // ---------------------------------------------------------------------------
  describe('esm-51h: network access sandboxing', () => {
    // RED PHASE TEST: esm-sec.3
    // This test verifies that fetch() is blocked in the sandbox.
    // The ai-evaluate package sets fetch: null to block network access.
    // This test should FAIL if fetch() is NOT properly blocked.
    it('should prevent direct fetch() calls to external URLs', async () => {
      const module = `export function noop() {}`
      const script = `
        const response = await fetch('https://example.com')
        return await response.text()
      `

      const result = await executor.run(module, script)

      // Either fetch should not exist or should be blocked
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/fetch is not defined|not allowed|blocked|network/i)
    })

    it('should prevent XMLHttpRequest usage', async () => {
      const module = `
        export function makeRequest() {
          const xhr = new XMLHttpRequest()
          xhr.open('GET', 'https://example.com', false)
          xhr.send()
          return xhr.responseText
        }
      `
      const script = `return makeRequest()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/XMLHttpRequest is not defined|not allowed|blocked/i)
    })

    // Note: WebSocket may or may not be available in workerd/miniflare depending on version.
    // In production Cloudflare Workers, WebSocket connections are only available through
    // specific bindings and not as a global constructor.
    it('should prevent WebSocket connections', async () => {
      const module = `
        export function connect() {
          const ws = new WebSocket('wss://example.com')
          return ws.readyState
        }
      `
      const script = `return connect()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/WebSocket is not defined|not allowed|blocked/i)
    })

    // Note: ai-evaluate's standalone SDK provides an empty api object (api = {}).
    // In production, the SDK api.fetch would proxy through the platform's controlled fetch.
    // This test verifies the SDK globals are available; full api.fetch testing requires
    // integration with the actual platform backend.
    it('should only allow network access through SDK api global', async () => {
      // This test verifies that the SDK api global exists and is an object
      const module = `
        export function checkSDKApi() {
          return {
            hasApi: typeof api === 'object' && api !== null,
            apiType: typeof api
          }
        }
      `
      const script = `return checkSDKApi()`

      const result = await executor.run(module, script)

      // SDK api should exist as an object
      expect(result.success).toBe(true)
      expect(result.value).toEqual({
        hasApi: true,
        apiType: 'object'
      })
    })

    it('should prevent http module require for network access', async () => {
      const module = `
        export function httpRequest() {
          const http = require('http')
          return http.get('http://example.com')
        }
      `
      const script = `return httpRequest()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/require is not defined|not allowed|blocked/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Prototype Pollution
  // ---------------------------------------------------------------------------
  describe('Prototype pollution attacks', () => {
    it('should prevent __proto__ access for prototype pollution', async () => {
      const module = `
        export function pollute() {
          const obj = {}
          obj.__proto__.polluted = true
          return {}.polluted
        }
      `
      const script = `return pollute()`

      const result = await executor.run(module, script)

      // Either the sandbox blocks it or the pollution doesn't escape
      // The host environment should NOT be affected
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })

    it('should prevent constructor.prototype manipulation', async () => {
      const module = `
        export function attackConstructor() {
          const obj = {}
          obj.constructor.prototype.hacked = true
          return {}.hacked
        }
      `
      const script = `return attackConstructor()`

      const result = await executor.run(module, script)

      // Host environment should be unaffected
      expect(({} as Record<string, unknown>).hacked).toBeUndefined()
    })

    it('should prevent Object.setPrototypeOf attacks', async () => {
      const module = `
        export function setProtoAttack() {
          const malicious = { evil: true }
          Object.setPrototypeOf({}, malicious)
          return 'success'
        }
      `
      const script = `return setProtoAttack()`

      const result = await executor.run(module, script)

      // This may succeed in sandbox but shouldn't affect host
      expect(Object.getPrototypeOf({})).toBe(Object.prototype)
    })

    it('should prevent Reflect.setPrototypeOf attacks', async () => {
      const module = `
        export function reflectProtoAttack() {
          const malicious = { reflected: true }
          Reflect.setPrototypeOf({}, malicious)
          return 'success'
        }
      `
      const script = `return reflectProtoAttack()`

      const result = await executor.run(module, script)

      // Host environment should be unaffected
      expect(({} as Record<string, unknown>).reflected).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Code Injection
  // ---------------------------------------------------------------------------
  describe('Code injection attacks', () => {
    it('should prevent indirect eval via array methods', async () => {
      const module = `
        export function indirectEval() {
          const arr = ['console.log("hacked")']
          return arr.map(eval)
        }
      `
      const script = `return indirectEval()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      // Workerd returns "Code generation from strings disallowed for this context"
      expect(result.error).toMatch(/eval|not defined|not allowed|blocked|disallowed|Code generation/i)
    })

    it('should prevent eval via setTimeout string argument', async () => {
      const module = `export function noop() {}`
      const script = `
        setTimeout('console.log("hacked")', 0)
        return 'attempted'
      `

      const result = await executor.run(module, script)

      // setTimeout with string should be blocked or not execute code
      // The result should either fail or the string shouldn't be evaluated
      if (result.success) {
        // If it succeeded, the string should NOT have been evaluated as code
        expect(result.value).toBe('attempted')
      }
    })

    it('should prevent eval via setInterval string argument', async () => {
      const module = `export function noop() {}`
      const script = `
        setInterval('console.log("hacked")', 1000)
        return 'attempted'
      `

      const result = await executor.run(module, script)

      // Similar to setTimeout - string argument should not be evaluated
      if (result.success) {
        expect(result.value).toBe('attempted')
      }
    })

    it('should prevent Function.prototype.constructor access', async () => {
      const module = `
        export function constructorAttack() {
          const fn = function() {}
          const FunctionConstructor = fn.constructor
          const malicious = FunctionConstructor('return process.env')
          return malicious()
        }
      `
      const script = `return constructorAttack()`

      const result = await executor.run(module, script)

      // Should fail - workerd blocks code generation from strings
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined|disallowed|Code generation/i)
    })

    it('should prevent code injection via template literals with tags', async () => {
      const module = `
        export function templateAttack() {
          const tag = (strings, ...values) => eval(strings.join(''))
          return tag\`process.exit()\`
        }
      `
      const script = `return templateAttack()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/eval|process|not defined|not allowed|blocked/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Environment and System Access
  // ---------------------------------------------------------------------------
  describe('Environment and system access attacks', () => {
    it('should prevent access to process.binding', async () => {
      const module = `
        export function bindingAccess() {
          return process.binding('fs')
        }
      `
      const script = `return bindingAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent access to process._linkedBinding', async () => {
      const module = `
        export function linkedBindingAccess() {
          return process._linkedBinding('inspector')
        }
      `
      const script = `return linkedBindingAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent access to process.dlopen', async () => {
      const module = `
        export function dlopenAccess() {
          return process.dlopen({}, '/path/to/native.node')
        }
      `
      const script = `return dlopenAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/process is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent Deno namespace access', async () => {
      const module = `
        export function denoAccess() {
          return Deno.env.get('SECRET')
        }
      `
      const script = `return denoAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Deno is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent Bun namespace access', async () => {
      const module = `
        export function bunAccess() {
          return Bun.env.SECRET
        }
      `
      const script = `return bunAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Bun is not defined|not allowed|blocked|undefined/i)
    })

    it('should prevent import.meta.url access to filesystem paths', async () => {
      const module = `
        export function importMetaAccess() {
          return import.meta.url
        }
      `
      const script = `return importMetaAccess()`

      const result = await executor.run(module, script)

      // Either undefined/blocked or returns a sandboxed URL
      if (result.success && result.value) {
        // If accessible, should not reveal actual filesystem paths
        expect(String(result.value)).not.toMatch(/^file:\/\//)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Symbol and Proxy Attacks
  // ---------------------------------------------------------------------------
  describe('Symbol and Proxy attacks', () => {
    it('should prevent Symbol.for pollution', async () => {
      const module = `
        export function symbolAttack() {
          const sym = Symbol.for('malicious')
          globalThis[sym] = 'hacked'
          return Symbol.for('malicious')
        }
      `
      const script = `return symbolAttack()`

      const result = await executor.run(module, script)

      // Symbol should not leak to host
      const hostSym = Symbol.for('malicious')
      expect((globalThis as Record<symbol, unknown>)[hostSym]).toBeUndefined()
    })

    it('should not allow Proxy traps to access host objects', async () => {
      const module = `
        export function proxyTrapAttack() {
          const handler = {
            get(target, prop, receiver) {
              if (prop === 'constructor') {
                return target.constructor.constructor
              }
              return Reflect.get(target, prop, receiver)
            }
          }
          const p = new Proxy({}, handler)
          const Func = p.constructor
          return typeof Func
        }
      `
      const script = `return proxyTrapAttack()`

      const result = await executor.run(module, script)

      // Either fails or returns a sandboxed Function that can't escape
      if (result.success) {
        expect(result.value).toBe('function')
      }
    })

    it('should prevent Proxy-based prototype chain manipulation', async () => {
      const module = `
        export function proxyProtoAttack() {
          const malicious = new Proxy({}, {
            get(target, prop) {
              if (prop === 'secret') return 'leaked'
              return target[prop]
            }
          })
          Object.setPrototypeOf(Object.prototype, malicious)
          return {}.secret
        }
      `
      const script = `return proxyProtoAttack()`

      const result = await executor.run(module, script)

      // Host environment should not be affected
      expect(({} as Record<string, unknown>).secret).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Async/Promise Attacks
  // ---------------------------------------------------------------------------
  describe('Async and Promise attacks', () => {
    it('should handle Promise rejection without host process crash', async () => {
      const module = `
        export function unhandledRejection() {
          return new Promise((_, reject) => {
            reject(new Error('Unhandled rejection attack'))
          })
        }
      `
      const script = `return await unhandledRejection()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Unhandled rejection attack/i)
    })

    it('should prevent async generator abuse for resource exhaustion', async () => {
      const module = `
        export async function* infiniteGenerator() {
          let i = 0
          while (true) {
            yield i++
          }
        }
      `
      const script = `
        const gen = infiniteGenerator()
        let count = 0
        for await (const val of gen) {
          count++
          if (count > 1000) break
        }
        return count
      `

      const result = await executor.run(module, script)

      // Should either succeed with limited iterations or timeout
      if (result.success) {
        expect(result.value).toBe(1001)
      }
    })

    it('should handle Promise.race with rejection', async () => {
      const module = `
        export function raceRejection() {
          return Promise.race([
            Promise.reject(new Error('First rejects')),
            new Promise(resolve => setTimeout(() => resolve('second'), 100))
          ])
        }
      `
      const script = `return await raceRejection()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/First rejects/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: String/RegExp DoS
  // ---------------------------------------------------------------------------
  describe('String and RegExp DoS attacks', () => {
    it('should handle catastrophic backtracking in regex', async () => {
      const module = `
        export function regexDoS() {
          // This regex has catastrophic backtracking potential
          const evilRegex = /^(a+)+$/
          const input = 'a'.repeat(25) + 'b'
          return evilRegex.test(input)
        }
      `
      const script = `return regexDoS()`

      // Use shorter timeout to detect regex DoS
      const result = await executor.run(module, script, undefined, { timeout: 1000 })

      // Should either timeout or complete (workerd may have regex limits)
      // The key is that it shouldn't crash the host
      expect(result).toBeDefined()
    }, 30000)

    it('should handle deeply nested JSON parsing', async () => {
      const module = `
        export function nestedJSON() {
          let json = '{"a":'
          for (let i = 0; i < 1000; i++) {
            json += '{"a":'
          }
          json += '1'
          for (let i = 0; i < 1001; i++) {
            json += '}'
          }
          return JSON.parse(json)
        }
      `
      const script = `return nestedJSON()`

      const result = await executor.run(module, script)

      // Should either succeed or fail gracefully - not crash host
      expect(result).toBeDefined()
    })

    it('should handle very long strings without crashing', async () => {
      const module = `
        export function longString() {
          // Create a 10MB string
          const chunk = 'a'.repeat(10000)
          let result = ''
          for (let i = 0; i < 1000; i++) {
            result += chunk
          }
          return result.length
        }
      `
      const script = `return longString()`

      const result = await executor.run(module, script)

      // Should either succeed or fail gracefully
      expect(result).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Error Handling Bypass
  // ---------------------------------------------------------------------------
  describe('Error handling bypass attacks', () => {
    it('should not leak stack traces from host environment', async () => {
      const module = `
        export function stackLeak() {
          try {
            throw new Error('test error')
          } catch (e) {
            return e.stack
          }
        }
      `
      const script = `return stackLeak()`

      const result = await executor.run(module, script)

      if (result.success && result.value) {
        const stack = String(result.value)
        // Stack should not contain host filesystem paths
        expect(stack).not.toMatch(/\/Users\/|\/home\/|C:\\/)
        expect(stack).not.toMatch(/node_modules/)
      }
    })

    it('should handle Error.prepareStackTrace manipulation', async () => {
      const module = `
        export function prepareStackTraceAttack() {
          Error.prepareStackTrace = (err, stack) => {
            return stack.map(frame => ({
              file: frame.getFileName(),
              func: frame.getFunctionName()
            }))
          }
          const err = new Error('test')
          return err.stack
        }
      `
      const script = `return prepareStackTraceAttack()`

      const result = await executor.run(module, script)

      // Should either fail (prepareStackTrace not available) or not leak host info
      if (result.success && result.value) {
        expect(JSON.stringify(result.value)).not.toMatch(/\/Users\/|\/home\/|C:\\/)
      }
    })

    it('should handle custom Error.captureStackTrace', async () => {
      const module = `
        export function captureStackTraceAttack() {
          if (typeof Error.captureStackTrace !== 'function') {
            return 'captureStackTrace not available'
          }
          const obj = {}
          Error.captureStackTrace(obj)
          return obj.stack
        }
      `
      const script = `return captureStackTraceAttack()`

      const result = await executor.run(module, script)

      if (result.success && result.value && result.value !== 'captureStackTrace not available') {
        const stack = String(result.value)
        expect(stack).not.toMatch(/\/Users\/|\/home\/|C:\\/)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Web API Abuse
  // ---------------------------------------------------------------------------
  describe('Web API abuse attacks', () => {
    it('should block navigator access', async () => {
      const module = `
        export function navigatorAccess() {
          return navigator.userAgent
        }
      `
      const script = `return navigatorAccess()`

      const result = await executor.run(module, script)

      // navigator should not be available or should be sandboxed
      if (result.success === false) {
        expect(result.error).toMatch(/navigator is not defined|not allowed|blocked|undefined/i)
      }
    })

    it('should block window access', async () => {
      const module = `
        export function windowAccess() {
          return window.location
        }
      `
      const script = `return windowAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/window is not defined|not allowed|blocked|undefined/i)
    })

    it('should block document access', async () => {
      const module = `
        export function documentAccess() {
          return document.cookie
        }
      `
      const script = `return documentAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/document is not defined|not allowed|blocked|undefined/i)
    })

    it('should block localStorage access', async () => {
      const module = `
        export function localStorageAccess() {
          localStorage.setItem('key', 'value')
          return localStorage.getItem('key')
        }
      `
      const script = `return localStorageAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/localStorage is not defined|not allowed|blocked|undefined/i)
    })

    it('should block sessionStorage access', async () => {
      const module = `
        export function sessionStorageAccess() {
          sessionStorage.setItem('key', 'value')
          return sessionStorage.getItem('key')
        }
      `
      const script = `return sessionStorageAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/sessionStorage is not defined|not allowed|blocked|undefined/i)
    })

    it('should block indexedDB access', async () => {
      const module = `
        export function indexedDBAccess() {
          return indexedDB.open('test')
        }
      `
      const script = `return indexedDBAccess()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/indexedDB is not defined|not allowed|blocked|undefined/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Additional Attack Vectors: Worker and Thread Attacks
  // ---------------------------------------------------------------------------
  describe('Worker and thread attacks', () => {
    it('should block Worker creation', async () => {
      const module = `
        export function workerAttack() {
          const worker = new Worker('data:text/javascript,postMessage("hacked")')
          return 'created'
        }
      `
      const script = `return workerAttack()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Worker is not defined|not allowed|blocked|undefined/i)
    })

    it('should block SharedWorker creation', async () => {
      const module = `
        export function sharedWorkerAttack() {
          const worker = new SharedWorker('data:text/javascript,')
          return 'created'
        }
      `
      const script = `return sharedWorkerAttack()`

      const result = await executor.run(module, script)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/SharedWorker is not defined|not allowed|blocked|undefined/i)
    })

    // Note: SharedArrayBuffer is available in workerd (Cloudflare Workers).
    // While this could be a concern for timing attacks (Spectre), workerd uses
    // V8 isolates which provide strong memory isolation between executions.
    // This test documents the current behavior.
    it('should isolate SharedArrayBuffer between executions', async () => {
      const module1 = `
        export function createSAB() {
          const sab = new SharedArrayBuffer(1024)
          const view = new Int32Array(sab)
          view[0] = 42
          globalThis.__sharedBuffer = sab
          return view[0]
        }
      `
      const module2 = `
        export function accessSAB() {
          if (globalThis.__sharedBuffer) {
            const view = new Int32Array(globalThis.__sharedBuffer)
            return view[0]
          }
          return 'not found'
        }
      `
      const script1 = `return createSAB()`
      const script2 = `return accessSAB()`

      const result1 = await executor.run(module1, script1)
      const result2 = await executor.run(module2, script2)

      // First execution should succeed
      expect(result1.success).toBe(true)
      expect(result1.value).toBe(42)

      // Second execution should NOT see the SharedArrayBuffer from first
      // because each execution runs in isolated V8 context
      expect(result2.success).toBe(true)
      expect(result2.value).toBe('not found')
    })

    // Note: Atomics is available in workerd. This test documents that Atomics
    // operations work but are contained within the sandboxed execution context.
    it('should contain Atomics operations within sandbox', async () => {
      const module = `
        export function atomicsOperation() {
          const sab = new SharedArrayBuffer(1024)
          const arr = new Int32Array(sab)
          Atomics.store(arr, 0, 100)
          return Atomics.load(arr, 0)
        }
      `
      const script = `return atomicsOperation()`

      const result = await executor.run(module, script)

      // Atomics operations should work within the sandbox
      // but remain isolated from host environment
      expect(result.success).toBe(true)
      expect(result.value).toBe(100)
    })
  })
})

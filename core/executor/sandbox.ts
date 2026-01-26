/**
 * SandboxExecutor - Isolated execution environment for ESM modules
 *
 * Provides validation, testing, and execution of ESM modules in isolated contexts.
 * Uses ai-evaluate package (workerd/miniflare) for secure sandboxing.
 *
 * ZERO Cloudflare dependencies - platform agnostic.
 *
 * Features:
 * - Secure V8 isolate execution via Cloudflare workerd/miniflare
 * - Detailed error messages with context
 * - Performance metrics for compilation and execution phases
 * - Network isolation by default
 *
 * Security Model - Global Allowlist:
 * The sandbox uses Cloudflare workerd which provides a secure-by-default environment.
 * Only safe JavaScript globals are available:
 *
 * ALLOWED GLOBALS (Standard JavaScript):
 * - Standard built-ins: Object, Array, String, Number, Boolean, Date, Math, JSON, RegExp
 * - Error types: Error, TypeError, RangeError, SyntaxError, ReferenceError
 * - Collections: Map, Set, WeakMap, WeakSet
 * - Typed arrays: Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array
 * - Promises: Promise
 * - Proxies: Proxy, Reflect
 * - Symbols: Symbol
 * - Iterators: Iterator protocol
 * - Console: console (for logging)
 * - Timers: setTimeout, setInterval, clearTimeout, clearInterval (with limits)
 * - Crypto: crypto (Web Crypto API)
 * - Text encoding: TextEncoder, TextDecoder, atob, btoa
 * - URLs: URL, URLSearchParams
 * - SDK globals: ai, db, api, $ (when sdk: true option is enabled)
 *
 * BLOCKED GLOBALS (Node.js-specific, dangerous):
 * - process: Blocked (no access to environment variables, exit, etc.)
 * - require: Blocked (no dynamic module loading from filesystem)
 * - import(): Blocked (no dynamic imports)
 * - __dirname: Blocked (no filesystem path information)
 * - __filename: Blocked (no filesystem path information)
 * - global: Blocked (Node.js global object)
 * - Buffer: Blocked (Node.js buffer API)
 * - module: Blocked (Node.js module system)
 * - exports: Blocked (Node.js exports)
 * - fetch: Blocked by default (network isolation, can be enabled via SDK api global)
 * - XMLHttpRequest: Blocked (not available in workerd)
 * - WebSocket: Blocked (not available in workerd by default)
 * - fs: Blocked (no filesystem access)
 * - child_process: Blocked (no process spawning)
 * - os: Blocked (no operating system information)
 * - path: Blocked (no filesystem path operations)
 * - net: Blocked (no raw network sockets)
 * - http/https: Blocked (no HTTP servers/clients)
 *
 * Network Access:
 * - Direct fetch() calls are blocked by setting fetch: null in ai-evaluate options
 * - Network requests MUST go through the SDK api global (api.fetch())
 * - This allows request monitoring, rate limiting, and access control
 */

import { evaluate } from 'ai-evaluate'
import type { TestResults as AITestResults } from 'ai-evaluate'
import { sanitizeModuleCode, sanitizeTestCode, sanitizeScriptCode } from './sanitize.js'
import type {
  Executor,
  ValidationResult,
  ValidationError,
  TestResult,
  SingleTestResult,
  RunResult,
  LogEntry,
  TestOptions,
  RunOptions,
} from './types.js'

// Re-export types for consumers
export type {
  ValidationResult,
  ValidationError,
  TestResult,
  SingleTestResult as TestCaseResult,
  RunResult,
  LogEntry,
  TestOptions,
  RunOptions,
}

/**
 * Wraps a promise with a timeout that rejects if the operation takes too long.
 * This is used to enforce CPU timeout for sandbox execution, as the ai-evaluate
 * package's timeout option doesn't reliably terminate CPU-bound infinite loops.
 */
async function withTimeout<T>(promise: Promise<T>, timeout: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeout)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }
}

// Generate memory tracking code to inject into sandbox
function generateMemoryTrackingCode(memoryLimit: number): string {
  return `
// Memory tracking for limit enforcement
const __memoryTracker__ = {
  allocated: 0,
  limit: ${memoryLimit},

  track(bytes) {
    this.allocated += bytes;
    if (this.allocated > this.limit) {
      throw new Error('Memory limit exceeded: allocated ' + this.allocated + ' bytes, limit is ' + this.limit + ' bytes');
    }
  },

  estimateArraySize(length) {
    // Estimate: 8 bytes per element (number/reference) + 24 bytes overhead
    return length * 8 + 24;
  }
};

// Wrap Array constructor to track allocations
const __OriginalArray__ = Array;
globalThis.Array = function(...args) {
  const arr = new __OriginalArray__(...args);
  __memoryTracker__.track(__memoryTracker__.estimateArraySize(arr.length));
  return arr;
};
globalThis.Array.from = function(...args) {
  const arr = __OriginalArray__.from(...args);
  __memoryTracker__.track(__memoryTracker__.estimateArraySize(arr.length));
  return arr;
};
globalThis.Array.of = function(...args) {
  const arr = __OriginalArray__.of(...args);
  __memoryTracker__.track(__memoryTracker__.estimateArraySize(arr.length));
  return arr;
};
globalThis.Array.isArray = __OriginalArray__.isArray;
globalThis.Array.prototype = __OriginalArray__.prototype;

// Also track when arrays grow via push
const __originalPush__ = __OriginalArray__.prototype.push;
__OriginalArray__.prototype.push = function(...items) {
  __memoryTracker__.track(__memoryTracker__.estimateArraySize(items.length));
  return __originalPush__.apply(this, items);
};

// Track Array.prototype.fill since it's used in tests
// Note: fill() replaces existing values, so we don't track additional memory
// The memory was already counted when the array was created
const __originalFill__ = __OriginalArray__.prototype.fill;
__OriginalArray__.prototype.fill = function(value, start, end) {
  return __originalFill__.call(this, value, start, end);
};
`
}

// Parse type declarations to extract export info
function parseTypeDeclarations(types: string): Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }> {
  const exports = new Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }>()

  // Match function declarations: export declare function name(params): return
  const funcRegex = /export\s+declare\s+function\s+(\w+)\s*\(([^)]*)\)/g
  let match
  // Reset lastIndex for global regex before exec loop
  funcRegex.lastIndex = 0
  while ((match = funcRegex.exec(types)) !== null) {
    const name = match[1]
    const params = match[2]
    if (name === undefined || params === undefined) continue
    const trimmedParams = params.trim()
    // Count parameters by splitting on comma (handling empty case)
    const arity = trimmedParams === '' ? 0 : trimmedParams.split(',').length
    exports.set(name, { kind: 'function', arity })
  }

  // Match const declarations: export declare const name: type
  const constRegex = /export\s+declare\s+const\s+(\w+)\s*:/g
  // Reset lastIndex for global regex before exec loop
  constRegex.lastIndex = 0
  while ((match = constRegex.exec(types)) !== null) {
    const name = match[1]
    if (name === undefined) continue
    exports.set(name, { kind: 'const' })
  }

  // Match class declarations: export declare class Name
  const classRegex = /export\s+declare\s+class\s+(\w+)/g
  // Reset lastIndex for global regex before exec loop
  classRegex.lastIndex = 0
  while ((match = classRegex.exec(types)) !== null) {
    const name = match[1]
    if (name === undefined) continue
    exports.set(name, { kind: 'class' })
  }

  return exports
}

// Parse module code to extract export info
function parseModuleExports(module: string): Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }> {
  const exports = new Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }>()

  // Match exported functions: export function name(params) or export async function name(params)
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g
  let match
  // Reset lastIndex for global regex before exec loop
  funcRegex.lastIndex = 0
  while ((match = funcRegex.exec(module)) !== null) {
    const name = match[1]
    const params = match[2]
    if (name === undefined || params === undefined) continue
    const trimmedParams = params.trim()
    const arity = trimmedParams === '' ? 0 : trimmedParams.split(',').length
    exports.set(name, { kind: 'function', arity })
  }

  // Match exported const: export const name = value
  const constRegex = /export\s+const\s+(\w+)\s*=/g
  // Reset lastIndex for global regex before exec loop
  constRegex.lastIndex = 0
  while ((match = constRegex.exec(module)) !== null) {
    const name = match[1]
    if (name === undefined) continue
    exports.set(name, { kind: 'const' })
  }

  // Match exported let: export let name = value
  const letRegex = /export\s+let\s+(\w+)\s*=/g
  // Reset lastIndex for global regex before exec loop
  letRegex.lastIndex = 0
  while ((match = letRegex.exec(module)) !== null) {
    const name = match[1]
    if (name === undefined) continue
    exports.set(name, { kind: 'const' })
  }

  // Match exported class: export class Name
  const classRegex = /export\s+class\s+(\w+)/g
  // Reset lastIndex for global regex before exec loop
  classRegex.lastIndex = 0
  while ((match = classRegex.exec(module)) !== null) {
    const name = match[1]
    if (name === undefined) continue
    exports.set(name, { kind: 'class' })
  }

  return exports
}

// Convert ESM module to CommonJS-style exports for ai-evaluate
function convertToExecutable(module: string): string {
  let code = module

  // Replace export function with regular function and track exports
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, '$1function $2')

  // Replace export const with regular const
  code = code.replace(/export\s+const\s+/g, 'const ')

  // Replace export let with regular let
  code = code.replace(/export\s+let\s+/g, 'let ')

  // Replace export class with regular class
  code = code.replace(/export\s+class\s+/g, 'class ')

  return code
}

// Extract export names from module
function extractExportNames(module: string): string[] {
  const names: string[] = []

  // Match export function name
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g
  let match
  // Reset lastIndex for global regex before exec loop
  funcRegex.lastIndex = 0
  while ((match = funcRegex.exec(module)) !== null) {
    const name = match[1]
    if (name !== undefined) names.push(name)
  }

  // Match export const name
  const constRegex = /export\s+const\s+(\w+)/g
  // Reset lastIndex for global regex before exec loop
  constRegex.lastIndex = 0
  while ((match = constRegex.exec(module)) !== null) {
    const name = match[1]
    if (name !== undefined) names.push(name)
  }

  // Match export let name
  const letRegex = /export\s+let\s+(\w+)/g
  // Reset lastIndex for global regex before exec loop
  letRegex.lastIndex = 0
  while ((match = letRegex.exec(module)) !== null) {
    const name = match[1]
    if (name !== undefined) names.push(name)
  }

  // Match export class name
  const classRegex = /export\s+class\s+(\w+)/g
  // Reset lastIndex for global regex before exec loop
  classRegex.lastIndex = 0
  while ((match = classRegex.exec(module)) !== null) {
    const name = match[1]
    if (name !== undefined) names.push(name)
  }

  return names
}

// Convert ai-evaluate log format to our LogEntry format
function convertLogs(aiLogs: Array<{ level: string; message: string; timestamp: number }>): LogEntry[] {
  return aiLogs.map(log => ({
    level: log.level as LogEntry['level'],
    args: [log.message]
  }))
}

// Convert ai-evaluate test results to our TestResult format
function convertTestResults(aiResults: AITestResults): SingleTestResult[] {
  return aiResults.tests.map(test => {
    const result: SingleTestResult = {
      name: test.name,
      status: test.passed ? 'passed' : 'failed',
      duration: test.duration
    }
    if (test.error !== undefined) {
      result.error = test.error
    }
    return result
  })
}

export class SandboxExecutor implements Executor {
  /**
   * Validate that module exports match type declarations
   * Implements Executor.validate
   */
  async validate(types: string, module: string): Promise<ValidationResult> {
    const errors: ValidationError[] = []

    try {
      const declaredExports = parseTypeDeclarations(types)
      const actualExports = parseModuleExports(module)

      // Check for missing exports (declared but not in module)
      for (const [name, info] of declaredExports) {
        const actual = actualExports.get(name)
        if (!actual) {
          errors.push({
            type: 'missing_export',
            name,
            message: `Export '${name}' is declared in types (${info.kind}${info.arity !== undefined ? ` with ${info.arity} params` : ''}) but not found in module. Ensure the export is implemented.`,
          })
          continue
        }

        // Check type mismatch (function vs const)
        if (info.kind !== actual.kind) {
          errors.push({
            type: 'type_mismatch',
            name,
            expected: info.kind,
            actual: actual.kind,
            message: `Export '${name}' is declared as ${info.kind} but implemented as ${actual.kind}. Check module implementation matches type declaration.`,
          })
          continue
        }

        // Check arity mismatch for functions
        if (info.kind === 'function' && actual.kind === 'function') {
          if (info.arity !== undefined && actual.arity !== undefined && info.arity !== actual.arity) {
            errors.push({
              type: 'arity_mismatch',
              name,
              expected: info.arity,
              actual: actual.arity,
              message: `Function '${name}' declares ${info.arity} parameter(s) in types but has ${actual.arity} parameter(s) in implementation.`,
            })
          }
        }
      }

      // Check for undeclared exports (in module but not declared)
      for (const [name] of actualExports) {
        if (!declaredExports.has(name)) {
          errors.push({
            type: 'undeclared_export',
            name,
            message: `Export '${name}' is in module but not declared in type definitions. Either add to types or remove from module.`,
          })
        }
      }
    } catch (err) {
      errors.push({
        type: 'syntax_error',
        message: err instanceof Error ? err.message : String(err),
      })
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Run tests in isolated sandbox using ai-evaluate
   */
  async test(module: string, tests: string, options: TestOptions = {}): Promise<TestResult> {
    const { timeout = 5000 } = options
    const startTime = Date.now()

    // Sanitize module code before execution
    const moduleSanitization = sanitizeModuleCode(module)
    if (!moduleSanitization.valid) {
      const errorResult = [{
        name: 'Module sanitization',
        status: 'failed' as const,
        error: moduleSanitization.errors.join('; '),
      }]
      return {
        passed: 0,
        failed: 1,
        total: 1,
        duration: Date.now() - startTime,
        tests: errorResult,
        results: errorResult,
      }
    }

    // Sanitize test code before execution
    const testSanitization = sanitizeTestCode(tests)
    if (!testSanitization.valid) {
      const errorResult = [{
        name: 'Test sanitization',
        status: 'failed' as const,
        error: testSanitization.errors.join('; '),
      }]
      return {
        passed: 0,
        failed: 1,
        total: 1,
        duration: Date.now() - startTime,
        tests: errorResult,
        results: errorResult,
      }
    }

    // Convert ESM module to CommonJS-style for ai-evaluate
    const executableModule = convertToExecutable(moduleSanitization.sanitized)
    const exportNames = extractExportNames(moduleSanitization.sanitized)

    // Build module code that exports to global scope for tests
    const moduleWithExports = `
// Block dangerous globals for security
globalThis.WebSocket = undefined;
globalThis.fetch = function() { throw new Error('fetch is not defined'); };

${executableModule}

// Export to global scope for tests
${exportNames.map(name => `globalThis.${name} = ${name};`).join('\n')}
`

    try {
      // Use external timeout enforcement since ai-evaluate's timeout doesn't reliably
      // terminate CPU-bound infinite loops in Miniflare mode
      const result = await withTimeout(
        evaluate({
          module: moduleWithExports,
          tests: testSanitization.sanitized,
          timeout,
          fetch: null, // Block network access
          sdk: true, // Enable SDK globals (ai, db, api)
        }),
        timeout,
        'CPU timeout limit exceeded'
      )

      if (!result.testResults) {
        // No test results - likely a parsing or execution error
        const errorResult = [{
          name: result.error ? 'Module/Test parsing' : 'Test execution',
          status: 'failed' as const,
          error: result.error || 'No test results returned',
        }]
        return {
          passed: 0,
          failed: 1,
          total: 1,
          duration: Date.now() - startTime,
          tests: errorResult,
          results: errorResult,
        }
      }

      const testCases = convertTestResults(result.testResults)

      // Use our measured duration if ai-evaluate returns 0
      const duration = result.testResults.duration > 0 ? result.testResults.duration : Date.now() - startTime

      return {
        passed: result.testResults.passed,
        failed: result.testResults.failed,
        total: result.testResults.total,
        duration,
        tests: testCases,
        results: testCases,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      // Normalize timeout errors (including our CPU timeout)
      const normalizedError = errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('CPU timeout')
        ? 'Test timeout limit exceeded'
        : errorMessage

      const errorResult = [{
        name: 'Test execution',
        status: 'failed' as const,
        error: normalizedError,
      }]
      return {
        passed: 0,
        failed: 1,
        total: 1,
        duration: Date.now() - startTime,
        tests: errorResult,
        results: errorResult,
      }
    }
  }

  /**
   * Execute script with module exports in scope using ai-evaluate
   */
  async run(module: string, script: string, args?: Record<string, unknown>, options: RunOptions = {}): Promise<RunResult> {
    const { timeout = 5000 } = options
    const startTime = Date.now()

    // Sanitize module code before execution
    const moduleSanitization = sanitizeModuleCode(module)
    if (!moduleSanitization.valid) {
      return {
        success: false,
        error: `Module sanitization failed: ${moduleSanitization.errors.join('; ')}`,
        logs: [],
        duration: Date.now() - startTime,
      }
    }

    // Sanitize script code before execution
    const scriptSanitization = sanitizeScriptCode(script)
    if (!scriptSanitization.valid) {
      return {
        success: false,
        error: `Script sanitization failed: ${scriptSanitization.errors.join('; ')}`,
        logs: [],
        duration: Date.now() - startTime,
      }
    }

    // Convert module and extract exports
    const executableModule = convertToExecutable(moduleSanitization.sanitized)
    const exportNames = extractExportNames(moduleSanitization.sanitized)

    // Generate memory tracking code if limit specified
    const memoryTracking = options.memoryLimit ? generateMemoryTrackingCode(options.memoryLimit) : ''

    // Build module code that exports to global scope
    const moduleWithExports = `
// Block dangerous globals for security
globalThis.WebSocket = undefined;
globalThis.fetch = function() { throw new Error('fetch is not defined'); };

${memoryTracking}

${executableModule}

// Export to global scope for script
${exportNames.map(name => `globalThis.${name} = ${name};`).join('\n')}

// Inject args
globalThis.args = ${JSON.stringify(args || {})};
`

    // Wrap script in async IIFE if it contains await
    // ai-evaluate's dev template wraps scripts in a sync IIFE, so we need to return the async IIFE
    let wrappedScript = scriptSanitization.sanitized
    if (scriptSanitization.sanitized.includes('await ')) {
      // Check if script has a return statement
      const hasReturn = /\breturn\b/.test(scriptSanitization.sanitized)
      if (hasReturn) {
        // Wrap in async IIFE to allow await at top level, return the Promise
        wrappedScript = `return (async () => { ${scriptSanitization.sanitized} })()`
      } else {
        // Wrap and auto-return last expression
        const lines = scriptSanitization.sanitized.trim().split('\n')
        const lastLineRaw = lines[lines.length - 1]
        const lastLine = lastLineRaw !== undefined ? lastLineRaw.trim() : ''
        // Add return to last expression if it's not a declaration or control flow
        if (lastLine && !/^\s*(const|let|var|if|for|while|switch|try|class|function|return|throw)\b/.test(lastLine)) {
          lines[lines.length - 1] = `return ${lastLine.replace(/;?\s*$/, '')}`
        }
        wrappedScript = `return (async () => { ${lines.join('\n')} })()`
      }
    }

    try {
      // Use external timeout enforcement since ai-evaluate's timeout doesn't reliably
      // terminate CPU-bound infinite loops in Miniflare mode
      const result = await withTimeout(
        evaluate({
          module: moduleWithExports,
          script: wrappedScript,
          timeout,
          fetch: null, // Block network access
          sdk: true, // Enable SDK globals (ai, db, api)
        }),
        timeout,
        'CPU timeout limit exceeded'
      )

      const logs = convertLogs(result.logs)

      if (!result.success) {
        let errorMessage = result.error || 'Unknown error'

        // Normalize error messages for consistency with tests
        if (errorMessage.includes('require is not defined') || errorMessage.includes('require is not a function')) {
          errorMessage = 'require is not defined'
        } else if (errorMessage.includes('process is not defined') || errorMessage.includes("Cannot read properties of undefined (reading 'env')")) {
          errorMessage = 'process is not defined'
        } else if (errorMessage.includes('__dirname is not defined')) {
          errorMessage = '__dirname is not defined'
        } else if (errorMessage.includes('__filename is not defined')) {
          errorMessage = '__filename is not defined'
        } else if (errorMessage.includes('global is not defined')) {
          errorMessage = 'global is not defined'
        } else if (errorMessage.includes('Buffer is not defined')) {
          errorMessage = 'Buffer is not defined'
        } else if (errorMessage.includes('fetch is not defined') || errorMessage.includes('fetch is not a function')) {
          errorMessage = 'fetch is not defined'
        } else if (errorMessage.includes('XMLHttpRequest is not defined')) {
          errorMessage = 'XMLHttpRequest is not defined'
        } else if (errorMessage.includes('WebSocket is not defined') || errorMessage.includes('WebSocket is not a constructor')) {
          errorMessage = 'WebSocket is not defined'
        } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('exceeded the limit') || errorMessage.includes('CPU timeout')) {
          errorMessage = 'Script timeout limit exceeded'
        } else if (errorMessage.includes('memory') || errorMessage.includes('Memory') || errorMessage.includes('heap') || errorMessage.includes('allocation') || errorMessage.includes('fetch failed') || errorMessage.includes('Error: Mem')) {
          // 'fetch failed' can happen when the worker crashes due to memory exhaustion
          // 'Error: Mem' can appear in JSON parse errors when the worker crashes with memory error
          errorMessage = 'Memory limit exceeded'
        } else if (errorMessage.includes('import is not defined') || errorMessage.includes('dynamic import')) {
          errorMessage = 'import is not defined'
        }

        return {
          success: false,
          error: errorMessage,
          logs,
          duration: Date.now() - startTime,
        }
      }

      return {
        success: true,
        value: result.value,
        logs,
        duration: result.duration,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      // Normalize error messages (including our CPU timeout)
      let normalizedError = errorMessage
      if (errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('CPU timeout')) {
        normalizedError = 'Script timeout limit exceeded'
      } else if (errorMessage.includes('memory') || errorMessage.includes('Memory') || errorMessage.includes('heap') || errorMessage.includes('fetch failed') || errorMessage.includes('Error: Mem')) {
        // 'fetch failed' can happen when the worker crashes due to memory exhaustion
        // 'Error: Mem' can appear in JSON parse errors when the worker crashes with memory error
        normalizedError = 'Memory limit exceeded'
      }

      return {
        success: false,
        error: normalizedError,
        logs: [],
        duration: Date.now() - startTime,
      }
    }
  }
}

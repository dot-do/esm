/**
 * Worker Executor Adapter
 *
 * Provides a worker-compatible executor that wraps shared code for use
 * in Cloudflare Workers environment.
 *
 * ARCHITECTURE
 * ============
 *
 * This adapter bridges the gap between the CLI's SandboxExecutor (which uses
 * ai-evaluate with miniflare) and the worker environment (which uses the
 * unsafe_eval binding).
 *
 * The adapter implements both TestExecutor and ScriptExecutor interfaces,
 * allowing the worker to use shared execution logic while respecting the
 * workerd environment constraints.
 *
 * EXECUTION MODEL
 * ===============
 *
 * Code execution in the worker environment requires special handling:
 *
 * 1. Code Generation Restrictions:
 *    - Cloudflare Workers (workerd runtime) blocks eval() and new Function()
 *    - The unsafe_eval binding provides eval() and newFunction() capabilities
 *    - This adapter uses unsafe_eval.eval() to create functions dynamically
 *
 * 2. Function Creation Pattern:
 *    - Convert: new Function('a', 'b', 'return a + b')
 *    - To: unsafeEval.eval('(function(a, b) { return a + b })')
 *    - This preserves parameter handling while using allowed APIs
 *
 * 3. Execution Context:
 *    - Module code is converted from ESM to executable (strips exports)
 *    - Exports are captured and injected into test/script context
 *    - Dangerous globals are explicitly blocked (process, require, etc.)
 *
 * TEST EXECUTION
 * ==============
 *
 * The test runner provides a lightweight testing framework:
 *
 * - describe(name, fn): Groups related tests
 * - it(name, fn): Defines individual test cases
 * - expect(actual): Creates assertion chain
 *
 * Assertions supported:
 * - .toBe(expected): Strict equality
 * - .toEqual(expected): Deep equality (JSON comparison)
 * - .toBeCloseTo(expected, precision): Numeric precision
 * - .toThrow(message?): Error throwing
 * - .toBeDefined() / .toBeUndefined(): Definition checks
 * - .toContain(expected): Array/string inclusion
 * - .toMatch(pattern): Regex matching
 *
 * SCRIPT EXECUTION
 * ================
 *
 * Scripts run with:
 * - Module exports in scope
 * - args object containing input parameters
 * - Console proxy capturing all log output
 * - Timeout enforcement via Promise.race
 *
 * SECURITY
 * ========
 *
 * The sandbox blocks access to:
 * - process: Node.js process object
 * - require: CommonJS require function
 * - __dirname / __filename: Path information
 * - global: Global object reference
 * - Buffer: Node.js Buffer class
 * - fetch: Network requests (in sandbox context)
 *
 * Related issues:
 * - esm-arch.14: Share executor code between CLI and worker
 * - esm-arch.18: Worker documentation (this documentation)
 */

import { extractExportNames } from '../utils/exports.js'
import type {
  CoreExecutor,
  CoreTestResult as ExecutorTestResult,
  CoreRunResult as ExecutorRunResult,
  CoreTestOptions as ExecutorTestOptions,
} from '../types.js'

// =============================================================================
// Types that match the interfaces in worker/routes/module.ts
// =============================================================================

/**
 * Test executor result - matches TestExecutorResult in module routes
 */
export interface TestExecutorResult {
  passed: number
  failed: number
  total: number
  duration: number
  tests: Array<{
    name: string
    status: 'passed' | 'failed'
    duration?: number
    error?: string
  }>
}

/**
 * Script executor result - matches ScriptExecutorResult in module routes
 */
export interface ScriptExecutorResult {
  success: boolean
  value?: unknown
  error?: string
  logs: Array<{ level: string; args: unknown[] }>
  duration: number
}

/**
 * Test executor interface - matches TestExecutor in module routes
 */
export interface TestExecutor {
  runTests: (
    moduleCode: string,
    testCode: string,
    timeout?: number
  ) => Promise<TestExecutorResult>
}

/**
 * Script executor interface - matches ScriptExecutor in module routes
 */
export interface ScriptExecutor {
  runScript: (
    moduleCode: string,
    scriptCode: string,
    args?: Record<string, unknown>,
    timeout?: number
  ) => Promise<ScriptExecutorResult>
}

/**
 * Log entry type for capturing console output
 */
export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: unknown[]
}

/**
 * Environment bindings for worker
 */
export interface WorkerEnv {
  unsafe_eval: {
    eval(code: string): unknown
    newFunction(...args: string[]): (...args: unknown[]) => unknown
  }
}

/**
 * Options for creating a WorkerExecutorAdapter
 */
export interface WorkerExecutorOptions {
  defaultTimeout?: number
}

/**
 * Convert ESM module to executable code by stripping export keywords
 */
export function convertToExecutable(module: string): string {
  let code = module
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, '$1function $2')
  code = code.replace(/export\s+const\s+/g, 'const ')
  code = code.replace(/export\s+let\s+/g, 'let ')
  code = code.replace(/export\s+class\s+/g, 'class ')
  // Remove import statements for now (they would need to be resolved)
  code = code.replace(/import\s+.*?from\s+['"][^'"]+['"]\s*;?/g, '')
  return code
}

/**
 * Create a new function using unsafe_eval or fallback
 */
function createFunction(
  unsafeEval: WorkerEnv['unsafe_eval'] | null,
  ...args: string[]
): (...fnArgs: unknown[]) => unknown {
  const body = args.pop() || ''
  const params = args

  if (unsafeEval && typeof unsafeEval.eval === 'function') {
    const paramList = params.join(', ')
    const fnCode = `(function(${paramList}) { ${body} })`
    return unsafeEval.eval(fnCode) as (...fnArgs: unknown[]) => unknown
  }

  // Fallback for environments without unsafe_eval binding
  try {
    return new Function(...params, body) as (...fnArgs: unknown[]) => unknown
  } catch (e) {
    throw new Error(
      `Code generation from strings is not allowed. The unsafe_eval binding may not be configured. Original error: ${e instanceof Error ? e.message : String(e)}`
    )
  }
}

/**
 * Simple test runner for worker environment
 */
function createTestRunner() {
  const results: Array<{
    name: string
    status: 'passed' | 'failed'
    duration?: number
    error?: string
  }> = []
  const describeStack: string[] = []

  function describe(name: string, fn: () => void) {
    describeStack.push(name)
    try {
      fn()
    } finally {
      describeStack.pop()
    }
  }

  function it(name: string, fn: () => void) {
    const fullName = [...describeStack, name].join(' > ')
    const start = Date.now()
    try {
      fn()
      results.push({ name: fullName, status: 'passed', duration: Date.now() - start })
    } catch (e) {
      results.push({
        name: fullName,
        status: 'failed',
        duration: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function expect(actual: unknown) {
    return {
      toBe(expected: unknown) {
        if (actual !== expected) {
          throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
        }
      },
      toEqual(expected: unknown) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
        }
      },
      toBeCloseTo(expected: number, precision = 2) {
        const actualNum = actual as number
        const diff = Math.abs(actualNum - expected)
        const epsilon = Math.pow(10, -precision)
        if (diff > epsilon) {
          throw new Error(`Expected ${expected} (within ${precision} decimal places) but got ${actualNum}`)
        }
      },
      toThrow(message?: string | RegExp) {
        const fn = actual as () => void
        let threw = false
        let thrownError: unknown
        try {
          fn()
        } catch (e) {
          threw = true
          thrownError = e
        }
        if (!threw) {
          throw new Error('Expected function to throw but it did not')
        }
        if (message) {
          const errorMsg = thrownError instanceof Error ? thrownError.message : String(thrownError)
          if (typeof message === 'string' && !errorMsg.includes(message)) {
            throw new Error(`Expected error message to include "${message}" but got "${errorMsg}"`)
          }
          if (message instanceof RegExp && !message.test(errorMsg)) {
            throw new Error(`Expected error message to match ${message} but got "${errorMsg}"`)
          }
        }
      },
      toBeDefined() {
        if (actual === undefined) {
          throw new Error('Expected value to be defined but got undefined')
        }
      },
      toBeUndefined() {
        if (actual !== undefined) {
          throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`)
        }
      },
      toContain(expected: unknown) {
        if (Array.isArray(actual)) {
          if (!actual.includes(expected)) {
            throw new Error(`Expected array to contain ${JSON.stringify(expected)}`)
          }
        } else if (typeof actual === 'string') {
          if (!actual.includes(expected as string)) {
            throw new Error(`Expected string to contain "${expected}"`)
          }
        }
      },
      toMatch(pattern: RegExp) {
        if (typeof actual !== 'string' || !pattern.test(actual)) {
          throw new Error(`Expected "${actual}" to match ${pattern}`)
        }
      },
    }
  }

  return { describe, it, expect, results }
}

/**
 * Worker-compatible executor adapter that implements Executor, TestExecutor, and ScriptExecutor
 *
 * This allows the worker to use the same execution logic as would be shared with CLI,
 * while using the unsafe_eval binding for code execution in workerd environment.
 *
 * The adapter implements:
 * - Executor interface for compatibility with ESM class
 * - TestExecutor.runTests() for running module tests
 * - ScriptExecutor.runScript() for executing module scripts
 */
export class WorkerExecutorAdapter implements CoreExecutor, TestExecutor, ScriptExecutor {
  private unsafeEval: WorkerEnv['unsafe_eval'] | null = null
  private defaultTimeout: number

  constructor(options: WorkerExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout ?? 5000
  }

  /**
   * Set the unsafe_eval binding from worker environment
   */
  setUnsafeEval(unsafeEval: WorkerEnv['unsafe_eval']): void {
    this.unsafeEval = unsafeEval
  }

  /**
   * Run a script with module code in context
   * Implements ScriptExecutor.runScript
   */
  async runScript(
    moduleCode: string,
    scriptCode: string,
    args?: Record<string, unknown>,
    timeout?: number
  ): Promise<ScriptExecutorResult> {
    const startTime = Date.now()
    const logs: LogEntry[] = []
    const effectiveTimeout = timeout ?? this.defaultTimeout

    try {
      const executableModule = convertToExecutable(moduleCode)
      const exportNames = extractExportNames(moduleCode)

      // Create console proxy to capture logs
      const consoleProxy = {
        log: (...logArgs: unknown[]) =>
          logs.push({ level: 'log', args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))) }),
        warn: (...logArgs: unknown[]) =>
          logs.push({ level: 'warn', args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))) }),
        error: (...logArgs: unknown[]) =>
          logs.push({ level: 'error', args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))) }),
        info: (...logArgs: unknown[]) =>
          logs.push({ level: 'info', args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))) }),
        debug: (...logArgs: unknown[]) =>
          logs.push({ level: 'debug', args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))) }),
      }

      // Build the execution context - block dangerous globals
      const context: Record<string, unknown> = {
        console: consoleProxy,
        args: args || {},
        process: undefined,
        require: undefined,
        __dirname: undefined,
        __filename: undefined,
        global: undefined,
        Buffer: undefined,
        fetch: undefined,
      }

      // Execute module to get exports
      const moduleWrapper = createFunction(
        this.unsafeEval,
        ...Object.keys(context),
        `
        "use strict";
        ${executableModule}
        return { ${exportNames.join(', ')} };
      `
      )

      const exports = moduleWrapper(...Object.values(context))

      // Add exports to context
      for (const name of exportNames) {
        context[name] = (exports as Record<string, unknown>)[name]
      }

      // Wrap script to handle return statements and async
      let wrappedScript = scriptCode
      if (scriptCode.includes('await ')) {
        wrappedScript = `return (async () => { ${scriptCode} })()`
      }

      // Execute script with timeout
      const scriptWrapper = createFunction(
        this.unsafeEval,
        ...Object.keys(context),
        `
        "use strict";
        ${wrappedScript}
      `
      )

      const runScript = async () => {
        const result = scriptWrapper(...Object.values(context))
        return result instanceof Promise ? await result : result
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Script timeout exceeded')), effectiveTimeout)
      })

      const value = await Promise.race([runScript(), timeoutPromise])

      // Convert LogEntry[] to the expected format
      const logsForResult = logs.map((log) => ({
        level: log.level,
        args: log.args,
      }))

      return {
        success: true,
        value,
        logs: logsForResult,
        duration: Date.now() - startTime,
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      // Convert LogEntry[] to the expected format
      const logsForResult = logs.map((log) => ({
        level: log.level,
        args: log.args,
      }))

      return {
        success: false,
        error,
        logs: logsForResult,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Run tests with module code in context
   * Implements TestExecutor.runTests
   */
  async runTests(
    moduleCode: string,
    testCode: string,
    timeout?: number
  ): Promise<TestExecutorResult> {
    const startTime = Date.now()
    const effectiveTimeout = timeout ?? this.defaultTimeout

    try {
      const executableModule = convertToExecutable(moduleCode)
      const exportNames = extractExportNames(moduleCode)
      const { describe, it, expect, results } = createTestRunner()

      // Build the execution context
      const context: Record<string, unknown> = {
        describe,
        it,
        expect,
        console: {
          log: () => {},
          warn: () => {},
          error: () => {},
          info: () => {},
          debug: () => {},
        },
      }

      // Execute module to get exports
      const moduleWrapper = createFunction(
        this.unsafeEval,
        ...Object.keys(context),
        `
        ${executableModule}
        return { ${exportNames.join(', ')} };
      `
      )

      const exports = moduleWrapper(...Object.values(context))

      // Add exports to context
      for (const name of exportNames) {
        context[name] = (exports as Record<string, unknown>)[name]
      }

      // Execute tests with timeout
      const testWrapper = createFunction(this.unsafeEval, ...Object.keys(context), testCode)

      const runTests = async () => {
        testWrapper(...Object.values(context))
        return results
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout exceeded')), effectiveTimeout)
      })

      const testResults = await Promise.race([runTests(), timeoutPromise])

      const passed = testResults.filter((r) => r.status === 'passed').length
      const failed = testResults.filter((r) => r.status === 'failed').length

      return {
        passed,
        failed,
        total: passed + failed,
        duration: Date.now() - startTime,
        tests: testResults,
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      const isTimeout = error.toLowerCase().includes('timeout')

      return {
        passed: 0,
        failed: 1,
        total: 1,
        duration: Date.now() - startTime,
        tests: [
          {
            name: isTimeout ? 'Test execution' : 'Module/Test parsing',
            status: 'failed',
            error,
          },
        ],
      }
    }
  }

  // =============================================================================
  // Executor interface implementation
  // =============================================================================

  /**
   * Run tests against a module - implements Executor.test
   * @param module - The module source code
   * @param tests - The test source code
   * @param options - Optional test configuration
   * @returns Test results with pass/fail counts
   */
  async test(
    module: string,
    tests: string,
    options?: ExecutorTestOptions
  ): Promise<ExecutorTestResult> {
    const result = await this.runTests(module, tests, options?.timeout)
    return {
      passed: result.passed,
      failed: result.failed,
      total: result.total,
      results: result.tests.map((t) => {
        const testResult: ExecutorTestResult['results'][number] = {
          name: t.name,
          status: t.status,
        }
        if (t.error !== undefined) testResult.error = t.error
        if (t.duration !== undefined) testResult.duration = t.duration
        return testResult
      }),
      duration: result.duration,
    }
  }

  /**
   * Run a script with module exports in scope - implements Executor.run
   * @param module - The module source code
   * @param script - The script to execute
   * @param args - Optional arguments to pass to the script
   * @returns Execution result with value and logs
   */
  async run(
    module: string,
    script: string,
    args?: Record<string, unknown>
  ): Promise<ExecutorRunResult> {
    const result = await this.runScript(module, script, args)
    const runResult: ExecutorRunResult = {
      value: result.value,
      logs: result.logs.map((log) => ({
        level: log.level as 'log' | 'warn' | 'error' | 'info' | 'debug',
        args: log.args,
      })),
    }
    if (result.success !== undefined) runResult.success = result.success
    if (result.error !== undefined) runResult.error = result.error
    if (result.duration !== undefined) runResult.duration = result.duration
    return runResult
  }
}

/**
 * Create a worker executor adapter with optional configuration
 */
export function createWorkerExecutor(options?: WorkerExecutorOptions): WorkerExecutorAdapter {
  return new WorkerExecutorAdapter(options)
}

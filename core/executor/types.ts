/**
 * Executor Interface Types
 *
 * Defines the Executor interface for module testing, running, and validation.
 * This interface is implemented by SandboxExecutor (CLI/Node) and WorkerExecutorAdapter (Cloudflare Workers).
 */

/**
 * Result of a single test case
 */
export interface SingleTestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  error?: string
  duration?: number
}

/**
 * Result from running tests
 */
export interface TestResult {
  passed: number
  failed: number
  total?: number
  results: SingleTestResult[]
  duration?: number
}

/**
 * Log entry for captured console output
 */
export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: unknown[]
}

/**
 * Result from running a script
 */
export interface RunResult {
  value: unknown
  logs: LogEntry[]
  success?: boolean
  error?: string
  duration?: number
}

/**
 * Result from validating a module against its type declarations
 */
export interface ValidationResult {
  valid: boolean
  errors: Array<{
    type: string
    name?: string
    message?: string
    expected?: string | number
    actual?: string | number
  }>
}

/**
 * Options for test execution
 */
export interface TestOptions {
  timeout?: number
}

/**
 * Executor interface for module testing, running, and validation.
 *
 * This interface is implemented by:
 * - SandboxExecutor: Uses ai-evaluate (workerd/miniflare) for CLI/Node environments
 * - WorkerExecutorAdapter: Uses unsafe_eval binding for Cloudflare Workers
 *
 * Both implementations provide the same interface, allowing ESM class to swap
 * executors based on the runtime environment.
 */
export interface Executor {
  /**
   * Run tests against a module
   * @param module - The module source code
   * @param tests - The test source code
   * @param options - Optional test configuration
   * @returns Test results with pass/fail counts
   */
  test(module: string, tests: string, options?: TestOptions): Promise<TestResult>

  /**
   * Run a script with module exports in scope
   * @param module - The module source code
   * @param script - The script to execute
   * @param args - Optional arguments to pass to the script
   * @returns Execution result with value and logs
   */
  run(module: string, script: string, args?: Record<string, unknown>): Promise<RunResult>

  /**
   * Validate module exports against type declarations (optional)
   * @param module - The module source code
   * @param types - The TypeScript type declarations
   * @returns Validation result with errors if any
   */
  validate?(module: string, types: string): Promise<ValidationResult>
}

/**
 * Type guard for Executor interface
 */
export function isExecutor(value: unknown): value is Executor {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return typeof obj.test === 'function' && typeof obj.run === 'function'
}

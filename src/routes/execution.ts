/**
 * esm.do - Execution Routes
 *
 * Extracted route handlers for /run and /test endpoints.
 * These functions are designed to be testable independently of the worker.
 *
 * Issue: esm-arch.8 - Create execution routes
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Stored module interface (matches storage types)
 */
export interface StoredModule {
  name: string
  types: string
  module: string
  tests: string
  script: string
  version?: string
}

/**
 * Storage interface for reading modules
 */
export interface ModuleStorage {
  read(name: string, version?: string): Promise<StoredModule | null>
  write(name: string, data: unknown): Promise<{ version: string; name: string }>
  delete(name: string): Promise<void>
  list(pattern?: string): Promise<string[]>
  versions(name: string, limit?: number): Promise<Array<{ version: string; message: string; timestamp: Date }>>
}

/**
 * Log entry from script execution
 */
export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: unknown[]
}

/**
 * Result from running a script
 */
export interface RunResult {
  success: boolean
  value?: unknown
  error?: string
  logs: LogEntry[]
  duration: number
}

/**
 * Result from running tests
 */
export interface TestResult {
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
 * Executor interface for running scripts and tests
 */
export interface Executor {
  run(
    moduleCode: string,
    scriptCode: string,
    args?: Record<string, unknown>,
    timeout?: number
  ): Promise<RunResult>
  test?(
    moduleCode: string,
    testCode: string,
    timeout?: number,
    filter?: string
  ): Promise<TestResult>
}

/**
 * Options for running a script
 */
export interface RunScriptOptions {
  input?: Record<string, unknown>
  timeout?: number
  version?: string
}

/**
 * Options for running tests
 */
export interface RunTestsOptions {
  timeout?: number
  filter?: string
}

/**
 * Context for execution routes (dependency injection)
 */
export interface ExecutionRouteContext {
  storage: ModuleStorage
  executor: Executor
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for RunScriptOptions
 */
export function isRunScriptOptions(value: unknown): value is RunScriptOptions {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>

  // Check input if present
  if ('input' in obj && obj.input !== undefined) {
    if (typeof obj.input !== 'object' || obj.input === null) {
      return false
    }
  }

  // Check timeout if present
  if ('timeout' in obj && obj.timeout !== undefined) {
    if (typeof obj.timeout !== 'number') {
      return false
    }
  }

  // Check version if present
  if ('version' in obj && obj.version !== undefined) {
    if (typeof obj.version !== 'string') {
      return false
    }
  }

  return true
}

/**
 * Type guard for RunTestsOptions
 */
export function isRunTestsOptions(value: unknown): value is RunTestsOptions {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>

  // Check timeout if present
  if ('timeout' in obj && obj.timeout !== undefined) {
    if (typeof obj.timeout !== 'number') {
      return false
    }
  }

  // Check filter if present
  if ('filter' in obj && obj.filter !== undefined) {
    if (typeof obj.filter !== 'string') {
      return false
    }
  }

  return true
}

// =============================================================================
// Context Factory
// =============================================================================

/**
 * Create an execution context from storage and executor
 */
export function createExecutionContext(deps: {
  storage: ModuleStorage
  executor: Executor
}): ExecutionRouteContext {
  return {
    storage: deps.storage,
    executor: deps.executor,
  }
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * Handle running a module's script
 *
 * @param moduleName - The module name (e.g., "@test/runnable")
 * @param context - The execution context with storage and executor
 * @param options - Optional run options (input, timeout, version)
 * @returns The run result with success, value, error, logs, and duration
 */
export async function handleRunScript(
  moduleName: string,
  context: ExecutionRouteContext,
  options?: RunScriptOptions
): Promise<RunResult> {
  // Read the module from storage
  const module = await context.storage.read(moduleName, options?.version)

  if (!module) {
    return {
      success: false,
      error: `Module "${moduleName}" not found`,
      logs: [],
      duration: 0,
    }
  }

  // Check if module has a script
  if (!module.script || module.script.trim() === '') {
    return {
      success: false,
      error: `Module "${moduleName}" has no script`,
      logs: [],
      duration: 0,
    }
  }

  // Execute the script
  const result = await context.executor.run(
    module.module,
    module.script,
    options?.input,
    options?.timeout
  )

  return result
}

/**
 * Handle running a module's tests
 *
 * @param moduleName - The module name (e.g., "@test/testable")
 * @param context - The execution context with storage and executor
 * @param options - Optional test options (timeout, filter)
 * @returns The test result with passed, failed, total, duration, and tests array
 * @throws Error if module not found or has no tests
 */
export async function handleRunTests(
  moduleName: string,
  context: ExecutionRouteContext,
  options?: RunTestsOptions
): Promise<TestResult> {
  // Read the module from storage
  const module = await context.storage.read(moduleName)

  if (!module) {
    throw new Error(`Module "${moduleName}" not found`)
  }

  // Check if module has tests
  if (!module.tests || module.tests.trim() === '') {
    throw new Error(`Module "${moduleName}" has no tests`)
  }

  // Check if executor supports tests
  if (!context.executor.test) {
    throw new Error('Executor does not support running tests')
  }

  // Run the tests
  const result = await context.executor.test(
    module.module,
    module.tests,
    options?.timeout,
    options?.filter
  )

  return result
}

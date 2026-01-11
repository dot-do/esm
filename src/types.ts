/**
 * esm.do - Core Type Definitions
 *
 * This file contains all the core types for the esm.do module system.
 */

// =============================================================================
// Logger Interface
// =============================================================================

/**
 * Logger interface for structured logging throughout the ESM system
 *
 * This interface provides a consistent logging API that can be implemented
 * by different logging backends (console, file, external services, etc.).
 *
 * @interface Logger
 * @property {function} debug - Log debug-level messages
 * @property {function} info - Log informational messages
 * @property {function} warn - Log warning messages
 * @property {function} error - Log error messages with optional error object
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: Error, context?: Record<string, unknown>): void
}

/**
 * Default console logger implementation
 *
 * A simple logger that outputs to the console. Suitable for development
 * and basic production use cases.
 */
export const consoleLogger: Logger = {
  debug: (msg, ctx) => console.debug(msg, ctx),
  info: (msg, ctx) => console.info(msg, ctx),
  warn: (msg, ctx) => console.warn(msg, ctx),
  error: (msg, err, ctx) => console.error(msg, err, ctx)
}

// =============================================================================
// Core Interfaces
// =============================================================================

/**
 * ESMModule - The full module representation stored in the system
 *
 * This interface represents a complete ESM module with all its components,
 * metadata, and versioning information. It is the primary data structure
 * for modules stored in the esm.do system.
 *
 * @interface ESMModule
 * @property {string} name - Unique identifier for the module
 * @property {string} types - TypeScript type definitions (d.ts format)
 * @property {string} module - JavaScript/TypeScript module code
 * @property {string} tests - Test code for validating the module
 * @property {string} script - Executable script/entrypoint code
 * @property {string} version - Unique version identifier (auto-generated or custom)
 * @property {Date} createdAt - Timestamp when the module was first created
 * @property {Date} updatedAt - Timestamp when the module was last updated
 *
 * @example
 * const module: ESMModule = {
 *   name: 'math-utils',
 *   types: 'export declare function add(a: number, b: number): number;',
 *   module: 'export function add(a, b) { return a + b; }',
 *   tests: 'describe("add", () => { it("adds numbers", () => { assert(add(1, 2) === 3); }); });',
 *   script: 'console.log(add(5, 3));',
 *   version: '1a2b3c',
 *   createdAt: new Date('2026-01-01'),
 *   updatedAt: new Date('2026-01-05'),
 * };
 */
export interface ESMModule {
  name: string
  types: string
  module: string
  tests: string
  script: string
  version: string
  createdAt: Date
  updatedAt: Date
}

/**
 * ESMWriteOptions - Options for writing/creating a module
 *
 * This interface defines the parameters needed to write or create a new module
 * in the esm.do system. Tests and script are optional, allowing for flexible
 * module definitions. Version is auto-generated if not provided.
 *
 * @interface ESMWriteOptions
 * @property {string} name - Unique identifier for the module
 * @property {string} types - TypeScript type definitions (d.ts format)
 * @property {string} module - JavaScript/TypeScript module code
 * @property {string} [tests] - Optional test code for the module
 * @property {string} [script] - Optional executable script/entrypoint code
 * @property {string} [version] - Optional custom version identifier (defaults to auto-generated)
 *
 * @example
 * const writeOpts: ESMWriteOptions = {
 *   name: 'string-utils',
 *   types: 'export declare function toUpperCase(str: string): string;',
 *   module: 'export function toUpperCase(str) { return str.toUpperCase(); }',
 *   tests: 'assert(toUpperCase("hello") === "HELLO");',
 *   script: 'console.log(toUpperCase("esm"));',
 * };
 */
export interface ESMWriteOptions {
  readonly name: string
  readonly types: string
  readonly module: string
  readonly tests?: string | undefined
  readonly script?: string | undefined
  readonly version?: string | undefined
}

/**
 * ESMReadResult - Result from reading a module from storage
 *
 * This interface represents the complete module data returned from a storage
 * read operation. It has the same structure as ESMModule, containing all
 * module components and metadata.
 *
 * @interface ESMReadResult
 * @property {string} name - Unique identifier for the module
 * @property {string} types - TypeScript type definitions (d.ts format)
 * @property {string} module - JavaScript/TypeScript module code
 * @property {string} tests - Test code for the module
 * @property {string} script - Executable script/entrypoint code
 * @property {string} version - Version identifier of the stored module
 * @property {Date} createdAt - Original creation timestamp
 * @property {Date} updatedAt - Last modification timestamp
 *
 * @example
 * const result: ESMReadResult = await storage.read('math-utils');
 * console.log(`Module ${result.name} v${result.version} retrieved`);
 */
export interface ESMReadResult {
  name: string
  types: string
  module: string
  tests: string
  script: string
  version: string
  createdAt: Date
  updatedAt: Date
}

/**
 * ESMRunResult - Result from running a module's script
 *
 * This interface captures the complete output and results from executing
 * a module's script. It includes the return value, all console logs, and
 * any errors that occurred during execution.
 *
 * @interface ESMRunResult
 * @property {unknown} value - The return value from the executed script
 * @property {string[]} logs - Array of all console.log outputs during execution
 * @property {string[]} errors - Array of all errors/exceptions during execution
 *
 * @example
 * const result: ESMRunResult = await executor.run(module, { input: 42 });
 * if (result.errors.length > 0) {
 *   console.error('Execution failed:', result.errors);
 * } else {
 *   console.log('Result:', result.value);
 * }
 */
export interface ESMRunResult {
  value: unknown
  logs: string[]
  errors: string[]
}

/**
 * TestCaseResult - Individual test case result
 *
 * This interface represents the outcome of a single test case execution.
 * It includes the test name, pass/fail status, execution time, and
 * optional error details if the test failed.
 *
 * @interface TestCaseResult
 * @property {string} name - Human-readable name of the test case
 * @property {boolean} passed - Whether the test passed (true) or failed (false)
 * @property {number} duration - Execution time in milliseconds
 * @property {string} [error] - Optional error message if the test failed
 *
 * @example
 * const testResult: TestCaseResult = {
 *   name: 'should add two numbers correctly',
 *   passed: true,
 *   duration: 2.5,
 * };
 *
 * const failedTest: TestCaseResult = {
 *   name: 'should handle negative numbers',
 *   passed: false,
 *   duration: 1.8,
 *   error: 'Expected -5, but got 5',
 * };
 */
export interface TestCaseResult {
  readonly name: string
  readonly passed: boolean
  readonly duration: number
  readonly error?: string | undefined
}

/**
 * ESMTestResult - Result from running a module's tests
 */
export interface ESMTestResult {
  readonly passed: number
  readonly failed: number
  readonly total: number
  readonly results: readonly TestCaseResult[]
  readonly failures?: ReadonlyArray<{ readonly name: string; readonly error: string }> | undefined
  readonly duration: number
}

/**
 * ModuleVersion - Version history entry
 */
export interface ModuleVersion {
  readonly version: string
  readonly message: string
  readonly timestamp: Date
  readonly parent?: string | undefined
}

/**
 * ValidationResult - Result from validating a module
 */
export interface ValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for ESMModule
 */
export function isESMModule(value: unknown): value is ESMModule {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.name === 'string' &&
    typeof obj.types === 'string' &&
    typeof obj.module === 'string' &&
    typeof obj.tests === 'string' &&
    typeof obj.script === 'string' &&
    typeof obj.version === 'string' &&
    obj.createdAt instanceof Date &&
    obj.updatedAt instanceof Date
  )
}

/**
 * Type guard for ESMWriteOptions
 */
export function isESMWriteOptions(value: unknown): value is ESMWriteOptions {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.name === 'string' &&
    typeof obj.types === 'string' &&
    typeof obj.module === 'string' &&
    (obj.tests === undefined || typeof obj.tests === 'string') &&
    (obj.script === undefined || typeof obj.script === 'string')
  )
}

/**
 * Type guard for ESMReadResult
 */
export function isESMReadResult(value: unknown): value is ESMReadResult {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.name === 'string' &&
    typeof obj.types === 'string' &&
    typeof obj.module === 'string' &&
    typeof obj.tests === 'string' &&
    typeof obj.script === 'string' &&
    typeof obj.version === 'string' &&
    obj.createdAt instanceof Date &&
    obj.updatedAt instanceof Date
  )
}

/**
 * Type guard for ESMRunResult
 */
export function isESMRunResult(value: unknown): value is ESMRunResult {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    'value' in obj &&
    Array.isArray(obj.logs) &&
    Array.isArray(obj.errors)
  )
}

/**
 * Type guard for TestCaseResult
 */
export function isTestCaseResult(value: unknown): value is TestCaseResult {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.name === 'string' &&
    typeof obj.passed === 'boolean' &&
    typeof obj.duration === 'number' &&
    (obj.error === undefined || typeof obj.error === 'string')
  )
}

/**
 * Type guard for ESMTestResult
 */
export function isESMTestResult(value: unknown): value is ESMTestResult {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.passed === 'number' &&
    typeof obj.failed === 'number' &&
    typeof obj.total === 'number' &&
    typeof obj.duration === 'number' &&
    Array.isArray(obj.results)
  )
}

/**
 * Type guard for ModuleVersion
 */
export function isModuleVersion(value: unknown): value is ModuleVersion {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.version === 'string' &&
    typeof obj.message === 'string' &&
    obj.timestamp instanceof Date
  )
}

/**
 * Type guard for ValidationResult
 */
export function isValidationResult(value: unknown): value is ValidationResult {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.valid === 'boolean' &&
    Array.isArray(obj.errors) &&
    Array.isArray(obj.warnings)
  )
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique version identifier
 */
export function generateVersion(): string {
  const timestamp = Date.now().toString(36)
  // Use crypto for better randomness
  const randomBytes = new Uint8Array(8)
  crypto.getRandomValues(randomBytes)
  const random = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
  return `${timestamp}-${random}`
}

/**
 * Create a new ESMModule from write options
 */
export function createESMModule(options: ESMWriteOptions & { tests: string; script: string }): ESMModule
export function createESMModule(options: {
  name: string
  types: string
  module: string
  tests: string
  script: string
  version?: string | undefined
}): ESMModule {
  const now = new Date()
  return {
    name: options.name,
    types: options.types,
    module: options.module,
    tests: options.tests,
    script: options.script,
    version: options.version || generateVersion(),
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Create ESMWriteOptions
 */
export function createESMWriteOptions(options: {
  name: string
  types: string
  module: string
  tests?: string | undefined
  script?: string | undefined
}): ESMWriteOptions {
  return {
    name: options.name,
    types: options.types,
    module: options.module,
    tests: options.tests,
    script: options.script,
  }
}

/**
 * Create ESMTestResult from test case results
 */
export function createESMTestResult(results: TestCaseResult[], duration = 0): ESMTestResult {
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const failures = results
    .filter(r => !r.passed && r.error)
    .map(r => ({ name: r.name, error: r.error! }))
  return {
    passed,
    failed,
    total: results.length,
    results,
    failures: failures.length > 0 ? failures : undefined,
    duration,
  }
}

/**
 * Create ESMRunResult
 */
export function createESMRunResult(options: {
  value: unknown
  logs?: string[] | undefined
  errors?: string[] | undefined
}): ESMRunResult {
  return {
    value: options.value,
    logs: options.logs || [],
    errors: options.errors || [],
  }
}

// =============================================================================
// ESM API Types (used by ESM class)
// =============================================================================

/**
 * WriteOptions - Options for writing a module via ESM class
 *
 * Alias for ESMWriteOptions for API consistency.
 */
export type WriteOptions = ESMWriteOptions

/**
 * ReadResult - Result of reading a module via ESM class
 *
 * Simplified version of ESMReadResult with optional tests/script.
 */
export interface ReadResult {
  readonly name: string
  readonly types: string
  readonly module: string
  readonly tests?: string | undefined
  readonly script?: string | undefined
  readonly version: string
}

/**
 * RunResult - Result of running a module's script
 */
export interface RunResult {
  readonly value: unknown
  readonly logs: readonly string[] | string
  readonly errors: readonly string[]
  readonly exitCode: number
}

/**
 * RunOptions - Options for running a module (CLI-aligned signature)
 */
export interface RunOptions {
  readonly name: string
  readonly args?: Readonly<Record<string, unknown>> | undefined
  readonly timeout?: number | undefined
  readonly env?: Readonly<Record<string, string>> | undefined
  /** Optional inline module code - if provided, runs without storage lookup */
  readonly module?: string | undefined
  /** Optional inline script - if provided with module, runs this script */
  readonly script?: string | undefined
}

/**
 * TestOptions - Options for testing a module (CLI-aligned signature)
 */
export interface TestOptions {
  readonly name: string
  readonly watch?: boolean | undefined
  readonly coverage?: boolean | undefined
  readonly filter?: string | undefined
}

/**
 * SingleTestResult - Result of a single test case
 *
 * Alias for TestCaseResult for API consistency.
 */
export type SingleTestResult = TestCaseResult

/**
 * TestResult - Result of testing a module
 *
 * Alias for ESMTestResult for API consistency.
 */
export type TestResult = ESMTestResult

/**
 * DeleteResult - Result of deleting a module
 */
export interface DeleteResult {
  readonly deleted: boolean
  readonly name: string
}

/**
 * WriteResult - Result of writing a module
 */
export interface WriteResult {
  readonly name: string
  readonly version: string
  readonly testResults?: TestResult | undefined
  readonly value?: unknown
}

/**
 * FileChange - Change information for a single file in a diff
 */
export interface FileChange {
  readonly file: string
  readonly additions: number
  readonly deletions: number
}

/**
 * DiffResult - Result of comparing two versions of a module
 */
export interface DiffResult {
  readonly from: string
  readonly to: string
  readonly changes: readonly FileChange[]
  readonly patch: string
}

// =============================================================================
// Service Interfaces
// =============================================================================

/**
 * Storage interface for module persistence
 */
export interface Storage {
  read(name: string): Promise<ESMReadResult | null>
  write(options: ESMWriteOptions): Promise<ESMModule>
  delete(name: string): Promise<boolean>
  list(pattern?: string | undefined): Promise<string[]>
  versions(name: string): Promise<ModuleVersion[]>
}

/**
 * Type guard for Storage interface (duck typing)
 */
export function isModuleStorage(value: unknown): value is Storage {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.read === 'function' &&
    typeof obj.write === 'function' &&
    typeof obj.delete === 'function' &&
    typeof obj.list === 'function' &&
    typeof obj.versions === 'function'
  )
}

/**
 * Executor interface for module validation, testing, and execution
 */
export interface Executor {
  validate(module: ESMModule): Promise<ValidationResult>
  test(module: ESMModule): Promise<ESMTestResult>
  run(module: ESMModule, args?: unknown): Promise<ESMRunResult>
}

/**
 * Type guard for Executor interface (duck typing)
 */
export function isExecutor(value: unknown): value is Executor {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.validate === 'function' &&
    typeof obj.test === 'function' &&
    typeof obj.run === 'function'
  )
}

// =============================================================================
// Core Executor Types (from core/executor/types.ts)
// These are the low-level executor types used by SandboxExecutor and WorkerExecutorAdapter
// =============================================================================

/**
 * Result of a single test case (core executor version)
 */
export interface CoreSingleTestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  error?: string
  duration?: number
}

/**
 * Result from running tests (core executor version)
 */
export interface CoreTestResult {
  passed: number
  failed: number
  total?: number
  results: CoreSingleTestResult[]
  duration?: number
}

/**
 * Log entry for captured console output (core executor version)
 */
export interface CoreLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: unknown[]
}

/**
 * Result from running a script (core executor version)
 */
export interface CoreRunResult {
  value: unknown
  logs: CoreLogEntry[]
  success?: boolean
  error?: string
  duration?: number
}

/**
 * Result from validating a module against its type declarations (core executor version)
 */
export interface CoreValidationResult {
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
 * Options for test execution (core executor version)
 */
export interface CoreTestOptions {
  timeout?: number
}

/**
 * Core Executor interface for module testing, running, and validation.
 *
 * This interface is implemented by:
 * - SandboxExecutor: Uses ai-evaluate (workerd/miniflare) for CLI/Node environments
 * - WorkerExecutorAdapter: Uses unsafe_eval binding for Cloudflare Workers
 *
 * Both implementations provide the same interface, allowing ESM class to swap
 * executors based on the runtime environment.
 */
export interface CoreExecutor {
  /**
   * Run tests against a module
   * @param module - The module source code
   * @param tests - The test source code
   * @param options - Optional test configuration
   * @returns Test results with pass/fail counts
   */
  test(module: string, tests: string, options?: CoreTestOptions): Promise<CoreTestResult>

  /**
   * Run a script with module exports in scope
   * @param module - The module source code
   * @param script - The script to execute
   * @param args - Optional arguments to pass to the script
   * @returns Execution result with value and logs
   */
  run(module: string, script: string, args?: Record<string, unknown>): Promise<CoreRunResult>

  /**
   * Validate module exports against type declarations (optional)
   * @param module - The module source code
   * @param types - The TypeScript type declarations
   * @returns Validation result with errors if any
   */
  validate?(module: string, types: string): Promise<CoreValidationResult>
}

/**
 * Type guard for CoreExecutor interface
 */
export function isCoreExecutor(value: unknown): value is CoreExecutor {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const obj = value as Record<string, unknown>
  return typeof obj.test === 'function' && typeof obj.run === 'function'
}

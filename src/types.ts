/**
 * esm.do - Core Type Definitions
 *
 * This file contains all the core types for the esm.do module system.
 */

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
  name: string
  types: string
  module: string
  tests?: string
  script?: string
  version?: string
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
  name: string
  passed: boolean
  duration: number
  error?: string
}

/**
 * ESMTestResult - Result from running a module's tests
 */
export interface ESMTestResult {
  passed: number
  failed: number
  total: number
  results: TestCaseResult[]
  failures?: Array<{ name: string; error: string }>
  duration: number
}

/**
 * ModuleVersion - Version history entry
 */
export interface ModuleVersion {
  version: string
  message: string
  timestamp: Date
}

/**
 * ValidationResult - Result from validating a module
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
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
function generateVersion(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
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
  version?: string
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
  tests?: string
  script?: string
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
  logs?: string[]
  errors?: string[]
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
  name: string
  types: string
  module: string
  tests?: string
  script?: string
  version: string
}

/**
 * RunResult - Result of running a module's script
 */
export interface RunResult {
  value: unknown
  logs: string[] | string
  errors: string[]
  exitCode: number
}

/**
 * RunOptions - Options for running a module (CLI-aligned signature)
 */
export interface RunOptions {
  name: string
  args?: Record<string, unknown>
  timeout?: number
  env?: Record<string, string>
}

/**
 * TestOptions - Options for testing a module (CLI-aligned signature)
 */
export interface TestOptions {
  name: string
  watch?: boolean
  coverage?: boolean
  filter?: string
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
  deleted: boolean
  name: string
}

/**
 * WriteResult - Result of writing a module
 */
export interface WriteResult {
  name: string
  version: string
  testResults?: TestResult
  value?: unknown
}

/**
 * FileChange - Change information for a single file in a diff
 */
export interface FileChange {
  file: string
  additions: number
  deletions: number
}

/**
 * DiffResult - Result of comparing two versions of a module
 */
export interface DiffResult {
  from: string
  to: string
  changes: FileChange[]
  patch: string
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
  list(pattern?: string): Promise<string[]>
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

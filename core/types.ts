/**
 * esm.do - Core Type Definitions
 *
 * This file contains all the core types for the esm.do module system.
 * ZERO Cloudflare dependencies - platform agnostic.
 */

// =============================================================================
// Logger Interface
// =============================================================================

/**
 * Logger interface for structured logging throughout the ESM system
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: Error, context?: Record<string, unknown>): void
}

/**
 * Default console logger implementation
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
 */
export interface ESMRunResult {
  value: unknown
  logs: string[]
  errors: string[]
}

/**
 * TestCaseResult - Individual test case result
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
 */
export type WriteOptions = ESMWriteOptions

/**
 * ReadResult - Result of reading a module via ESM class
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
 */
export type SingleTestResult = TestCaseResult

/**
 * TestResult - Result of testing a module
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

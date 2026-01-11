/**
 * esm.do - Types Re-exports and Extensions
 *
 * This file re-exports shared types from @dotdo/esm (core package)
 * and defines src-specific types that extend or augment the core types.
 */

// =============================================================================
// Re-export all shared types from @dotdo/esm
// =============================================================================

export {
  // Logger
  type Logger,
  consoleLogger,

  // Core Interfaces
  type ESMModule,
  type ESMWriteOptions,
  type ESMReadResult,
  type ESMRunResult,
  type TestCaseResult,
  type ESMTestResult,
  type ModuleVersion,
  type ValidationResult,

  // Type Guards
  isESMModule,
  isESMWriteOptions,
  isESMReadResult,
  isESMRunResult,
  isTestCaseResult,
  isESMTestResult,
  isModuleVersion,
  isValidationResult,

  // Factory Functions
  generateVersion,
  createESMModule,
  createESMWriteOptions,
  createESMTestResult,
  createESMRunResult,

  // ESM API Types
  type WriteOptions,
  type ReadResult,
  type RunResult,
  type TestOptions,
  type SingleTestResult,
  type TestResult,
  type DeleteResult,
  type WriteResult,
  type FileChange,
  type DiffResult,

  // Service Interfaces
  type Storage,
  type Executor,
  isModuleStorage,
  isExecutor,
} from '@dotdo/esm'

// Import types we need to reference for extended types
import type { RunOptions as CoreRunOptions } from '@dotdo/esm'

// =============================================================================
// Extended Types (src-specific)
// =============================================================================

/**
 * RunOptions - Extended options for running a module (CLI-aligned signature)
 *
 * This extends the core RunOptions with additional fields for inline execution:
 * - module: Optional inline module code - if provided, runs without storage lookup
 * - script: Optional inline script - if provided with module, runs this script
 */
export interface RunOptions extends CoreRunOptions {
  /** Optional inline module code - if provided, runs without storage lookup */
  readonly module?: string | undefined
  /** Optional inline script - if provided with module, runs this script */
  readonly script?: string | undefined
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

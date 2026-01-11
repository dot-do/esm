/**
 * @esm.do/sdk - Type Definitions
 *
 * This file contains all the type definitions for the ESM.do SDK client.
 * Types are aligned with the esm.do API and core package types.
 */

// =============================================================================
// Client Configuration Types
// =============================================================================

/**
 * Configuration options for the ESMClient
 */
export interface ESMClientConfig {
  /**
   * Base URL for the esm.do API
   * @default 'https://esm.do'
   */
  readonly baseUrl?: string | undefined

  /**
   * Authentication token for protected operations
   */
  readonly token?: string | undefined

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  readonly timeout?: number | undefined

  /**
   * Maximum number of retry attempts for failed requests
   * @default 3
   */
  readonly maxRetries?: number | undefined

  /**
   * Initial delay between retries in milliseconds (exponential backoff)
   * @default 1000
   */
  readonly retryDelay?: number | undefined

  /**
   * Custom headers to include in all requests
   */
  readonly headers?: Record<string, string> | undefined
}

// =============================================================================
// Module Types
// =============================================================================

/**
 * Module content for reading/writing
 */
export interface ESMModule {
  readonly name: string
  readonly types: string
  readonly module: string
  readonly tests?: string
  readonly script?: string
  readonly version?: string
}

/**
 * Result from reading a module
 */
export interface ReadResult {
  readonly name: string
  readonly types: string
  readonly module: string
  readonly tests?: string
  readonly script?: string
  readonly version: string
  readonly files?: readonly string[]
  readonly versions?: readonly VersionEntry[]
  readonly dependencies?: readonly string[]
  readonly externalDependencies?: readonly string[]
  readonly storage?: StorageInfo
}

/**
 * Storage metadata for a module
 */
export interface StorageInfo {
  readonly type: string
  readonly repository: string
  readonly branch: string
  readonly path: string
}

/**
 * Version history entry
 */
export interface VersionEntry {
  readonly sha: string
  readonly message: string
  readonly timestamp: string | Date
  readonly author?: string
  readonly parent?: string
}

// =============================================================================
// Write Types
// =============================================================================

/**
 * Options for writing a module
 */
export interface WriteOptions {
  readonly name: string
  readonly types: string
  readonly module: string
  readonly tests?: string
  readonly script?: string
  readonly options?: WriteModuleOptions
}

/**
 * Additional options for module write operations
 */
export interface WriteModuleOptions {
  /**
   * Force write even if tests fail
   */
  readonly force?: boolean

  /**
   * Tag to create for this version
   */
  readonly tag?: string

  /**
   * Custom commit message
   */
  readonly commitMessage?: string
}

/**
 * Result from writing a module
 */
export interface WriteResult {
  readonly name: string
  readonly version: string
  readonly created?: boolean
  readonly updated?: boolean
  readonly files?: readonly string[]
  readonly commit?: CommitInfo
  readonly tag?: string
  readonly testResults?: TestResults
  readonly warning?: string
}

/**
 * Commit information
 */
export interface CommitInfo {
  readonly sha: string
  readonly message: string
  readonly author: string
  readonly timestamp: string
}

// =============================================================================
// Run Types
// =============================================================================

/**
 * Options for running a module's script
 */
export interface RunOptions {
  /**
   * Input arguments to pass to the script
   */
  readonly input?: Record<string, unknown>

  /**
   * Execution timeout in milliseconds
   */
  readonly timeout?: number
}

/**
 * Result from running a module's script
 */
export interface RunResult {
  readonly result?: unknown
  readonly logs: readonly LogEntry[]
  readonly duration: number
  readonly error?: string
  readonly stack?: string
}

/**
 * Log entry from script execution
 */
export interface LogEntry {
  readonly level: 'log' | 'warn' | 'error' | 'info' | 'debug' | string
  readonly args: readonly unknown[]
}

// =============================================================================
// Test Types
// =============================================================================

/**
 * Options for running module tests
 */
export interface TestOptions {
  /**
   * Test timeout in milliseconds
   */
  readonly timeout?: number
}

/**
 * Result from running module tests
 */
export interface TestResults {
  readonly passed: number
  readonly failed: number
  readonly total: number
  readonly duration: number
  readonly results: readonly SingleTestResult[]
}

/**
 * Individual test result
 */
export interface SingleTestResult {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly duration?: number
  readonly error?: TestError
}

/**
 * Test error information
 */
export interface TestError {
  readonly message: string
  readonly stack?: string
}

// =============================================================================
// Version Types
// =============================================================================

/**
 * Result from getting version history
 */
export interface VersionsResult {
  readonly versions: readonly VersionEntry[]
}

/**
 * Diff between two versions
 */
export interface DiffResult {
  readonly from: string
  readonly to: string
  readonly diff: string
  readonly files?: Record<string, string>
  readonly stats?: DiffStats
}

/**
 * Diff statistics
 */
export interface DiffStats {
  readonly additions: number
  readonly deletions: number
  readonly filesChanged: number
}

// =============================================================================
// Delete Types
// =============================================================================

/**
 * Result from deleting a module
 */
export interface DeleteResult {
  readonly name: string
  readonly deleted: boolean
  readonly commit?: CommitInfo
}

// =============================================================================
// List Types
// =============================================================================

/**
 * Result from listing modules
 */
export interface ListResult {
  readonly modules: readonly string[]
  readonly scope?: string
  readonly count: number
}

// =============================================================================
// Dependency Types
// =============================================================================

/**
 * Direct dependencies result
 */
export interface DepsResult {
  readonly name: string
  readonly dependencies: readonly string[]
}

/**
 * Dependency tree result
 */
export interface DepsTreeResult {
  readonly name: string
  readonly tree: Record<string, unknown>
}

/**
 * Flattened dependencies result
 */
export interface DepsFlatResult {
  readonly dependencies: readonly string[]
  readonly count: number
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error response from the API
 */
export interface ESMApiError {
  readonly error: string
  readonly status: number
  readonly requestId?: string
  readonly details?: Record<string, unknown>
}

/**
 * SDK Error class with additional context
 */
export class ESMError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ESMError'
  }
}

/**
 * Network error for connection issues
 */
export class NetworkError extends ESMError {
  constructor(message: string, cause?: Error) {
    super(message, 0, undefined, { cause: cause?.message })
    this.name = 'NetworkError'
  }
}

/**
 * Timeout error for requests that exceed the timeout
 */
export class TimeoutError extends ESMError {
  constructor(timeout: number) {
    super(`Request timeout after ${timeout}ms`, 408)
    this.name = 'TimeoutError'
  }
}

/**
 * Retry exhausted error when all retry attempts fail
 */
export class RetryExhaustedError extends ESMError {
  constructor(
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(`All ${attempts} retry attempts failed: ${lastError.message}`, 0)
    this.name = 'RetryExhaustedError'
  }
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'

/**
 * Request options for the HTTP client
 */
export interface RequestOptions {
  readonly method?: HttpMethod
  readonly headers?: Record<string, string>
  readonly body?: unknown
  readonly timeout?: number
  readonly signal?: AbortSignal
}

/**
 * Response wrapper with parsed data
 */
export interface ApiResponse<T> {
  readonly data: T
  readonly status: number
  readonly headers: Headers
  readonly requestId?: string | undefined
}

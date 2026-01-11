/**
 * Executor Module
 *
 * Provides sandboxed execution and sanitization utilities for ESM modules.
 * ZERO Cloudflare dependencies - platform agnostic.
 */

// Export Executor interface and types
export {
  type Executor,
  type TestResult as ExecutorTestResult,
  type RunResult as ExecutorRunResult,
  type ValidationResult as ExecutorValidationResult,
  type SingleTestResult,
  type LogEntry as ExecutorLogEntry,
  type TestOptions as ExecutorTestOptions,
  isExecutor,
} from './types.js'

// Export sandbox executor and types
export {
  SandboxExecutor,
  type ValidationError,
  type ValidationResult,
  type TestCaseResult,
  type TestResult,
  type LogEntry,
  type RunResult,
  type TestOptions,
  type RunOptions,
} from './sandbox.js'

// Export sanitization utilities
export {
  sanitizeModuleCode,
  sanitizeTestCode,
  sanitizeScriptCode,
  sanitizeTypeDefinitions,
  type SanitizationResult,
} from './sanitize.js'

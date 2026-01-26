/**
 * SandboxExecutor - Re-exports from local core package build
 *
 * This file re-exports the SandboxExecutor and related types from the
 * local core package build for backward compatibility.
 *
 * NOTE: We import from the relative core/dist path instead of @dotdo/esm
 * because the published @dotdo/esm package uses the generic ai-evaluate
 * import which requires worker_loaders binding. The local core build
 * correctly uses ai-evaluate/node which works in Node.js environment.
 */

// Re-export SandboxExecutor class from local core build
export { SandboxExecutor } from '../../core/dist/executor/sandbox.js'

// Re-export all executor types from local core build
export type {
  ValidationError,
  ValidationResult,
  TestCaseResult,
  TestResult,
  LogEntry,
  RunResult,
  TestOptions,
  RunOptions,
} from '../../core/dist/executor/sandbox.js'

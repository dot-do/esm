/**
 * SandboxExecutor - Re-exports from @dotdo/esm core package
 *
 * This file re-exports the SandboxExecutor and related types from the
 * @dotdo/esm core package for backward compatibility.
 *
 * The canonical implementation is in core/executor/sandbox.ts
 */

// Re-export SandboxExecutor class
export { SandboxExecutor } from '@dotdo/esm'

// Re-export all executor types
export type {
  ValidationError,
  ValidationResult,
  TestCaseResult,
  TestResult,
  LogEntry,
  RunResult,
  TestOptions,
  RunOptions,
} from '@dotdo/esm'

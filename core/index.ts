/**
 * @dotdo/esm - Core ESM Module
 *
 * Platform-agnostic core library for esm.do module management.
 * ZERO Cloudflare dependencies.
 */

// Export ESM class
export { ESM, default } from './esm.js'
export type { ESMOptions } from './esm.js'

// Export all core types
export type {
  // Core module types
  ESMModule,
  ESMWriteOptions,
  ESMReadResult,
  ESMRunResult,
  ESMTestResult,
  TestCaseResult,
  ModuleVersion,
  ValidationResult,
  // API types
  WriteOptions,
  WriteResult,
  ReadResult,
  RunResult,
  RunOptions,
  TestOptions,
  SingleTestResult,
  TestResult,
  DeleteResult,
  FileChange,
  DiffResult,
  // Utility types
  Logger,
  Storage,
  Executor,
} from './types.js'

// Export factory functions and type guards
export {
  generateVersion,
  createESMModule,
  createESMWriteOptions,
  createESMTestResult,
  createESMRunResult,
  isESMModule,
  isESMWriteOptions,
  isESMReadResult,
  isESMRunResult,
  isTestCaseResult,
  isESMTestResult,
  isModuleVersion,
  isValidationResult,
  isModuleStorage,
  isExecutor,
  consoleLogger,
} from './types.js'

// Export error classes
export {
  ESMError,
  ModuleNotFoundError,
  ValidationError,
  ExecutionError,
  StorageError,
} from './errors.js'

// Export storage
export * from './storage/index.js'

// Export executor
export * from './executor/index.js'

// Export resolver
export * from './resolver/index.js'

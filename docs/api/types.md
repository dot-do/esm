# Type Reference

This document provides a comprehensive reference for all TypeScript types used in the esm.do API.

## Core Types

### ESMModule

The full module representation stored in the system.

```typescript
interface ESMModule {
  /** Module name (e.g., "@math/add") */
  name: string;
  /** TypeScript type declarations (.d.ts content) */
  types: string;
  /** ESM module implementation (.mjs content) */
  module: string;
  /** Test code (.test.js content) */
  tests: string;
  /** Executable script (.script.js content) */
  script: string;
  /** Version identifier (git commit SHA) */
  version: string;
  /** Timestamp when module was created */
  createdAt: Date;
  /** Timestamp when module was last updated */
  updatedAt: Date;
}
```

### ESMWriteOptions

Options for writing/creating a module.

```typescript
interface ESMWriteOptions {
  /** Module name (e.g., "@math/add") */
  readonly name: string;
  /** TypeScript type declarations - required */
  readonly types: string;
  /** ESM module implementation - required */
  readonly module: string;
  /** Test code - optional */
  readonly tests?: string | undefined;
  /** Executable script - optional */
  readonly script?: string | undefined;
  /** Specific version to create - optional */
  readonly version?: string | undefined;
}
```

### ESMReadResult

Result from reading a module from storage.

```typescript
interface ESMReadResult {
  name: string;
  types: string;
  module: string;
  tests: string;
  script: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Execution Types

### ESMRunResult

Result from running a module's script.

```typescript
interface ESMRunResult {
  /** The return value of the script */
  value: unknown;
  /** Captured console.log output */
  logs: string[];
  /** Captured console.error output */
  errors: string[];
}
```

### RunOptions

Options for running a module.

```typescript
interface RunOptions {
  /** Module name to run */
  readonly name: string;
  /** Arguments passed to the script as `args` */
  readonly args?: Readonly<Record<string, unknown>> | undefined;
  /** Maximum execution time in milliseconds */
  readonly timeout?: number | undefined;
  /** Environment variables */
  readonly env?: Readonly<Record<string, string>> | undefined;
  /** Optional inline module code */
  readonly module?: string | undefined;
  /** Optional inline script */
  readonly script?: string | undefined;
}
```

### RunResult

Result of running a module's script.

```typescript
interface RunResult {
  /** The return value of the script */
  readonly value: unknown;
  /** Captured console output */
  readonly logs: readonly string[] | string;
  /** Captured error output */
  readonly errors: readonly string[];
  /** Exit code (0 for success) */
  readonly exitCode: number;
}
```

---

## Test Types

### TestCaseResult

Individual test case result.

```typescript
interface TestCaseResult {
  /** Test case name */
  readonly name: string;
  /** Whether the test passed */
  readonly passed: boolean;
  /** Test execution time in milliseconds */
  readonly duration: number;
  /** Error message if test failed */
  readonly error?: string | undefined;
}
```

### ESMTestResult

Result from running a module's tests.

```typescript
interface ESMTestResult {
  /** Number of passing tests */
  readonly passed: number;
  /** Number of failing tests */
  readonly failed: number;
  /** Total number of tests */
  readonly total: number;
  /** Individual test results */
  readonly results: readonly TestCaseResult[];
  /** Summary of failures (name and error) */
  readonly failures?: ReadonlyArray<{
    readonly name: string;
    readonly error: string;
  }> | undefined;
  /** Total test execution time in milliseconds */
  readonly duration: number;
}
```

### TestOptions

Options for testing a module.

```typescript
interface TestOptions {
  /** Module name to test */
  readonly name: string;
  /** Watch mode - re-run on changes */
  readonly watch?: boolean | undefined;
  /** Enable coverage reporting */
  readonly coverage?: boolean | undefined;
  /** Filter tests by name pattern */
  readonly filter?: string | undefined;
}
```

---

## Version Types

### ModuleVersion

Version history entry.

```typescript
interface ModuleVersion {
  /** Version identifier (commit SHA) */
  readonly version: string;
  /** Commit message */
  readonly message: string;
  /** Timestamp when version was created */
  readonly timestamp: Date;
  /** Parent version identifier (if any) */
  readonly parent?: string | undefined;
}
```

### DiffResult

Result of comparing two versions of a module.

```typescript
interface DiffResult {
  /** Source version */
  readonly from: string;
  /** Target version */
  readonly to: string;
  /** File-level changes */
  readonly changes: readonly FileChange[];
  /** Unified diff patch */
  readonly patch: string;
}
```

### FileChange

Change information for a single file in a diff.

```typescript
interface FileChange {
  /** File path */
  readonly file: string;
  /** Number of lines added */
  readonly additions: number;
  /** Number of lines removed */
  readonly deletions: number;
}
```

---

## Operation Result Types

### WriteResult

Result of writing a module.

```typescript
interface WriteResult {
  /** Module name */
  readonly name: string;
  /** New version identifier */
  readonly version: string;
  /** Test results if tests were run */
  readonly testResults?: TestResult | undefined;
  /** Script return value if script was run */
  readonly value?: unknown;
}
```

### DeleteResult

Result of deleting a module.

```typescript
interface DeleteResult {
  /** Whether deletion was successful */
  readonly deleted: boolean;
  /** Module name that was deleted */
  readonly name: string;
}
```

### ReadResult

Result of reading a module.

```typescript
interface ReadResult {
  readonly name: string;
  readonly types: string;
  readonly module: string;
  readonly tests?: string | undefined;
  readonly script?: string | undefined;
  readonly version: string;
}
```

---

## Validation Types

### ValidationResult

Result from validating a module.

```typescript
interface ValidationResult {
  /** Whether validation passed */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: readonly string[];
  /** Validation warnings */
  readonly warnings: readonly string[];
}
```

---

## Service Interfaces

### Storage

Storage interface for module persistence.

```typescript
interface Storage {
  /** Read a module from storage */
  read(name: string): Promise<ESMReadResult | null>;
  /** Write a module to storage */
  write(options: ESMWriteOptions): Promise<ESMModule>;
  /** Delete a module from storage */
  delete(name: string): Promise<boolean>;
  /** List modules matching a pattern */
  list(pattern?: string | undefined): Promise<string[]>;
  /** Get version history for a module */
  versions(name: string): Promise<ModuleVersion[]>;
}
```

### Executor

Executor interface for module validation, testing, and execution.

```typescript
interface Executor {
  /** Validate a module */
  validate(module: ESMModule): Promise<ValidationResult>;
  /** Run a module's tests */
  test(module: ESMModule): Promise<ESMTestResult>;
  /** Execute a module's script */
  run(module: ESMModule, args?: unknown): Promise<ESMRunResult>;
}
```

---

## Logger Interface

### Logger

Logger interface for structured logging.

```typescript
interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}
```

---

## Type Guards

Type guards are provided to validate runtime types:

```typescript
// Check if value is an ESMModule
function isESMModule(value: unknown): value is ESMModule;

// Check if value is ESMWriteOptions
function isESMWriteOptions(value: unknown): value is ESMWriteOptions;

// Check if value is ESMReadResult
function isESMReadResult(value: unknown): value is ESMReadResult;

// Check if value is ESMRunResult
function isESMRunResult(value: unknown): value is ESMRunResult;

// Check if value is TestCaseResult
function isTestCaseResult(value: unknown): value is TestCaseResult;

// Check if value is ESMTestResult
function isESMTestResult(value: unknown): value is ESMTestResult;

// Check if value is ModuleVersion
function isModuleVersion(value: unknown): value is ModuleVersion;

// Check if value is ValidationResult
function isValidationResult(value: unknown): value is ValidationResult;

// Check if value is Storage interface
function isModuleStorage(value: unknown): value is Storage;

// Check if value is Executor interface
function isExecutor(value: unknown): value is Executor;
```

---

## Factory Functions

Factory functions for creating type-safe objects:

```typescript
// Generate a unique version identifier
function generateVersion(): string;

// Create a new ESMModule from options
function createESMModule(options: {
  name: string;
  types: string;
  module: string;
  tests: string;
  script: string;
  version?: string;
}): ESMModule;

// Create ESMWriteOptions
function createESMWriteOptions(options: {
  name: string;
  types: string;
  module: string;
  tests?: string;
  script?: string;
}): ESMWriteOptions;

// Create ESMTestResult from test case results
function createESMTestResult(
  results: TestCaseResult[],
  duration?: number
): ESMTestResult;

// Create ESMRunResult
function createESMRunResult(options: {
  value: unknown;
  logs?: string[];
  errors?: string[];
}): ESMRunResult;
```

---

## Usage Examples

### Creating a Module

```typescript
import { createESMWriteOptions, createESMModule } from 'esm.do';

const options = createESMWriteOptions({
  name: '@math/add',
  types: 'export declare function add(a: number, b: number): number;',
  module: 'export function add(a, b) { return a + b; }',
  tests: 'describe("add", () => { it("works", () => expect(add(1,2)).toBe(3)) })',
  script: 'return add(10, 20);'
});
```

### Type Checking at Runtime

```typescript
import { isESMModule, isTestCaseResult } from 'esm.do';

const data = await response.json();

if (isESMModule(data)) {
  console.log(`Module: ${data.name} v${data.version}`);
}

if (isTestCaseResult(data)) {
  console.log(`Test: ${data.name} - ${data.passed ? 'PASS' : 'FAIL'}`);
}
```

### Implementing Custom Storage

```typescript
import type { Storage, ESMWriteOptions, ESMReadResult } from 'esm.do';

class CustomStorage implements Storage {
  async read(name: string): Promise<ESMReadResult | null> {
    // Implementation
  }

  async write(options: ESMWriteOptions): Promise<ESMModule> {
    // Implementation
  }

  async delete(name: string): Promise<boolean> {
    // Implementation
  }

  async list(pattern?: string): Promise<string[]> {
    // Implementation
  }

  async versions(name: string): Promise<ModuleVersion[]> {
    // Implementation
  }
}
```

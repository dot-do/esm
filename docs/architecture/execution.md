# Execution Model

This document describes how esm.do executes user-provided code safely.

## Overview

esm.do executes user code in isolated sandbox environments. The execution layer is responsible for:

1. **Validation** - Verifying module exports match type declarations
2. **Testing** - Running test suites in isolation
3. **Script Execution** - Running scripts with module exports in scope

## Sandbox Architecture

### ai-evaluate Integration

The core executor uses the `ai-evaluate` package, which provides:

- Isolated V8 contexts via Cloudflare workerd/miniflare
- Network isolation by default
- Configurable timeouts
- Console log capture
- SDK globals (ai, db, api)

```typescript
import { evaluate } from 'ai-evaluate'

const result = await evaluate({
  module: moduleCode,    // Module source
  tests: testCode,       // Test source (optional)
  script: scriptCode,    // Script source (optional)
  timeout: 5000,         // Timeout in ms
  fetch: null,           // Block network access
  sdk: true,             // Enable SDK globals
})
```

### Worker Environment

In Cloudflare Workers, the `unsafe_eval` binding is used:

```jsonc
// wrangler.jsonc
{
  "unsafe": {
    "bindings": [
      { "name": "unsafe_eval", "type": "eval" }
    ]
  }
}
```

This provides `newFunction()` and `eval()` in the workerd environment where standard `eval()` is blocked.

## Executor Interface

```typescript
interface Executor {
  /**
   * Validate that module exports match type declarations
   */
  validate(types: string, module: string): Promise<ValidationResult>

  /**
   * Run tests in isolated sandbox
   */
  test(module: string, tests: string, options?: TestOptions): Promise<TestResult>

  /**
   * Execute script with module exports in scope
   */
  run(
    module: string,
    script: string,
    args?: Record<string, unknown>,
    options?: RunOptions
  ): Promise<RunResult>
}
```

## Validation

The validator checks that module exports match declared types:

### Checks Performed

1. **Missing exports** - Export declared in types but not in module
2. **Undeclared exports** - Export in module but not in types
3. **Type mismatch** - Export is function in types but const in module (or vice versa)
4. **Arity mismatch** - Function has different parameter count than declared

### Example

```typescript
// Types
export declare function add(a: number, b: number): number

// Module - VALID
export function add(a, b) { return a + b }

// Module - INVALID (wrong name)
export function sum(a, b) { return a + b }  // missing_export: 'add'

// Module - INVALID (extra export)
export function add(a, b) { return a + b }
export function sub(a, b) { return a - b }  // undeclared_export: 'sub'
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

interface ValidationError {
  type: 'missing_export' | 'undeclared_export' | 'type_mismatch' | 'arity_mismatch' | 'syntax_error'
  name?: string
  expected?: string | number
  actual?: string | number
  message: string
}
```

## Test Execution

Tests run in a vitest-compatible environment with `describe`, `it`, and `expect`.

### Test Environment

```javascript
// Available globals in test context
describe(name, fn)        // Group tests
it(name, fn)             // Define a test
expect(actual)           // Assertion builder
console                  // Log capture

// Module exports are automatically in scope
// e.g., if module exports `add`, it's available as `add()`
```

### Assertion Methods

```javascript
expect(value).toBe(expected)           // Strict equality
expect(value).toEqual(expected)        // Deep equality
expect(value).toBeCloseTo(expected, 2) // Numeric precision
expect(value).toBeDefined()            // Not undefined
expect(value).toBeUndefined()          // Is undefined
expect(value).toContain(item)          // Array/string contains
expect(value).toMatch(regex)           // Regex match
expect(fn).toThrow()                   // Function throws
expect(fn).toThrow('message')          // Throws with message
```

### TestResult

```typescript
interface TestResult {
  passed: number           // Number of passing tests
  failed: number           // Number of failing tests
  total: number            // Total tests run
  duration: number         // Total time in ms
  tests: SingleTestResult[]
  results: SingleTestResult[]  // Alias for tests
  failures?: TestFailure[]
}

interface SingleTestResult {
  name: string            // Full test name (describe > it)
  status: 'passed' | 'failed'
  duration?: number
  error?: string
}
```

### Example

```javascript
// Module
export function add(a, b) { return a + b }

// Tests
describe('add', () => {
  it('adds positive numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -2)).toBe(-3)
  })
})

// Result
{
  passed: 2,
  failed: 0,
  total: 2,
  duration: 15,
  tests: [
    { name: 'add > adds positive numbers', status: 'passed', duration: 5 },
    { name: 'add > adds negative numbers', status: 'passed', duration: 3 }
  ]
}
```

## Script Execution

Scripts run with module exports in scope and can return a value.

### Script Environment

```javascript
// Available globals
console                  // Log capture
args                     // Passed arguments (Record<string, unknown>)

// Module exports are in scope
// e.g., add(1, 2) if module exports `add`

// Return value is captured
return add(10, 20)
```

### Async Scripts

Scripts containing `await` are automatically wrapped in an async IIFE:

```javascript
// This script
const result = await fetchData()
return result

// Becomes
return (async () => {
  const result = await fetchData()
  return result
})()
```

### RunResult

```typescript
interface RunResult {
  success: boolean
  value?: unknown         // Return value
  error?: string          // Error message if failed
  logs: LogEntry[]        // Captured console output
  duration: number        // Execution time in ms
}

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: unknown[]
}
```

### Example

```javascript
// Module
export function calculate(expr) {
  console.log('Calculating:', expr)
  // ... calculation logic
  return result
}

// Script
console.log('Starting calculation')
return calculate('2 + 2')

// Result
{
  success: true,
  value: 4,
  logs: [
    { level: 'log', args: ['Starting calculation'] },
    { level: 'log', args: ['Calculating:', '2 + 2'] }
  ],
  duration: 12
}
```

## Resource Limits

### Timeout Enforcement

```typescript
interface TestOptions {
  timeout?: number  // Default: 5000ms
}

interface RunOptions {
  timeout?: number      // Default: 5000ms
  memoryLimit?: number  // Optional memory limit in bytes
}
```

The executor enforces timeouts using `Promise.race`:

```typescript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('CPU timeout limit exceeded')), timeout)
})

const result = await Promise.race([executeCode(), timeoutPromise])
```

### Memory Limits

Memory tracking is implemented by wrapping Array constructors:

```javascript
const __memoryTracker__ = {
  allocated: 0,
  limit: memoryLimit,

  track(bytes) {
    this.allocated += bytes
    if (this.allocated > this.limit) {
      throw new Error('Memory limit exceeded')
    }
  }
}

// Wrap Array to track allocations
globalThis.Array = function(...args) {
  const arr = new OriginalArray(...args)
  __memoryTracker__.track(arr.length * 8 + 24)
  return arr
}
```

### Error Messages

Errors are normalized for consistency:

| Raw Error | Normalized Error |
|-----------|------------------|
| `require is not defined` | `require is not defined` |
| `Cannot read properties of undefined (reading 'env')` | `process is not defined` |
| `timeout`, `Timeout` | `Script timeout limit exceeded` |
| `memory`, `Memory`, `heap` | `Memory limit exceeded` |

## Blocked Globals

The sandbox blocks access to dangerous globals:

```javascript
// Explicitly blocked in sandbox context
globalThis.WebSocket = undefined
globalThis.fetch = function() { throw new Error('fetch is not defined') }

// Not available in workerd
process           // Node.js process object
require           // CommonJS require
__dirname         // Node.js directory name
__filename        // Node.js file name
global            // Node.js global object
Buffer            // Node.js Buffer
module            // Node.js module system
exports           // Node.js exports
```

See [Security Documentation](./security.md) for the complete list.

## ESM Module Conversion

Before execution, ESM syntax is converted for the sandbox:

```javascript
// Input
export function add(a, b) { return a + b }
export const PI = 3.14

// Converted
function add(a, b) { return a + b }
const PI = 3.14

// Exports extracted to global scope for tests/scripts
globalThis.add = add
globalThis.PI = PI
```

## Dependency Resolution

When a module imports from other esm.do modules:

```javascript
import { add } from 'esm.do/@math/add'
```

The DependencyResolver:

1. Parses imports to find esm.do dependencies
2. Fetches dependencies in parallel
3. Builds a dependency graph
4. Detects circular dependencies (throws if found)
5. Topologically sorts dependencies
6. Bundles all modules into a single executable

```javascript
// Bundled output
const _math_add = (() => {
  function add(a, b) { return a + b }
  return { add }
})()

const { add } = _math_add

// Entry module code follows...
```

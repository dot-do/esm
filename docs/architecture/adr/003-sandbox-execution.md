# ADR 003: Sandbox Execution Model

## Status

Accepted

## Context

esm.do executes user-provided code for:

1. **Testing**: Running module test suites
2. **Scripts**: Executing entry point scripts
3. **Validation**: Checking exports match types

This code is untrusted and potentially malicious. We need:

- **Isolation**: No access to system resources
- **Timeouts**: Prevent infinite loops
- **Memory limits**: Prevent resource exhaustion
- **Network blocking**: No unauthorized requests
- **Safe APIs**: Limited, audited global scope

Options considered:

- **Node.js vm module**: Built-in sandboxing
- **Isolated-VM**: Separate V8 isolates in Node.js
- **Web Workers**: Browser-like isolation
- **ai-evaluate**: Cloudflare workerd-based sandbox

## Decision

We chose the **ai-evaluate** package with **input sanitization** as our execution strategy.

## Rationale

### ai-evaluate Package

The `ai-evaluate` package provides:

1. **workerd/Miniflare backend**: Same runtime as Cloudflare Workers
2. **Test framework**: Built-in vitest-compatible describe/it/expect
3. **SDK globals**: Optional ai, db, api globals
4. **Network control**: Disable fetch or provide custom implementation
5. **Timeout support**: Configurable execution limits

```typescript
import { evaluate } from 'ai-evaluate'

const result = await evaluate({
  module: moduleCode,
  tests: testCode,
  timeout: 5000,
  fetch: null,  // Block network
  sdk: true,    // Enable SDK globals
})
```

### Input Sanitization Layer

Before code reaches the sandbox, it passes through sanitization:

```typescript
const DANGEROUS_PATTERNS = [
  // Dynamic code execution
  { pattern: /\beval\s*\(/g, message: 'eval() is not allowed' },
  { pattern: /\bnew\s+Function\s*\(/g, message: 'new Function() is not allowed' },
  { pattern: /\bimport\s*\(/g, message: 'Dynamic import() is not allowed' },

  // Prototype pollution
  { pattern: /__proto__/g, message: '__proto__ is not allowed' },
  { pattern: /Object\s*\.\s*prototype/g, message: 'Object.prototype is not allowed' },

  // XSS vectors
  { pattern: /<script[^>]*>/gi, message: 'Script tags are not allowed' },
]
```

### Defense in Depth

Three layers of protection:

```
User Code
    |
    v
[Input Sanitization] - Block dangerous patterns
    |
    v
[Global Blocking] - Remove dangerous globals
    |
    v
[V8 Isolate] - Isolated execution context
```

### Timeout Enforcement

External timeout wrapper catches CPU-bound infinite loops:

```typescript
async function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('CPU timeout limit exceeded')), timeout)
  })
  return Promise.race([promise, timeoutPromise])
}
```

### Worker Environment

In Cloudflare Workers, we use the `unsafe_eval` binding:

```typescript
interface Env {
  unsafe_eval: {
    eval(code: string): unknown
    newFunction(...args: string[]): (...args: unknown[]) => unknown
  }
}

// Create function dynamically
const fn = env.unsafe_eval.newFunction('a', 'b', 'return a + b')
```

## Consequences

### Positive

1. **Strong isolation**: V8 isolate boundaries
2. **Consistent runtime**: Same as production Workers
3. **Built-in testing**: vitest-compatible API
4. **Network control**: Easily block or mock fetch
5. **Multiple layers**: Sanitization + sandbox

### Negative

1. **Cold start overhead**: Miniflare startup time in tests
2. **API limitations**: Not all Web APIs available
3. **Debugging complexity**: Errors may be obscured
4. **Memory overhead**: Each isolate has base memory cost

### Mitigations

1. **Reuse isolates**: Pool isolates across executions
2. **Web API polyfills**: Essential APIs available
3. **Error normalization**: Consistent error messages
4. **Memory tracking**: Wrapper-based memory limits

## Global Allowlist

### Allowed Globals

```javascript
// Standard JavaScript
Object, Array, String, Number, Boolean, Date, Math, JSON, RegExp
Error, TypeError, RangeError, SyntaxError, ReferenceError
Map, Set, WeakMap, WeakSet
Promise, Symbol, Proxy, Reflect
Int8Array, Uint8Array, Float32Array, Float64Array, ...

// Console (captured)
console.log, console.warn, console.error, console.info, console.debug

// Timers
setTimeout, setInterval, clearTimeout, clearInterval

// Crypto
crypto.getRandomValues, crypto.subtle.*

// Text/URL
TextEncoder, TextDecoder, atob, btoa, URL, URLSearchParams
```

### Blocked Globals

```javascript
// Node.js
process, require, __dirname, __filename, global, Buffer, module, exports

// Network
fetch, XMLHttpRequest, WebSocket

// Dynamic execution
eval, Function (as constructor)

// Dangerous introspection
Reflect.setPrototypeOf  // Prototype modification blocked
```

## Import Handling

### Allowed Imports

```javascript
// Relative imports
import { foo } from './local.js'
import { bar } from '../utils.js'

// esm.do modules
import { add } from 'esm.do/@math/add'
```

### Blocked Imports

```javascript
// External URLs
import { x } from 'https://example.com/script.js'  // BLOCKED

// npm packages
import lodash from 'lodash'  // BLOCKED

// Node.js built-ins
import fs from 'fs'          // BLOCKED
import { spawn } from 'child_process'  // BLOCKED
```

## Alternatives Considered

### Node.js vm Module

**Pros**:
- Built-in
- Low overhead

**Cons**:
- Breakable isolation
- No real security
- No timeout support

### Isolated-VM

**Pros**:
- True V8 isolate
- Memory limits
- Proven security

**Cons**:
- Native dependency
- Different runtime than production
- No built-in testing

### Docker/Container

**Pros**:
- Strong isolation
- Full OS sandboxing

**Cons**:
- High overhead
- Slow cold start
- Complex deployment

### WASM Sandbox

**Pros**:
- Memory-safe
- Portable

**Cons**:
- JavaScript compilation complex
- Performance overhead
- Limited APIs

## References

- [ai-evaluate package](https://github.com/primitives-org/ai-evaluate)
- [Cloudflare workerd](https://github.com/cloudflare/workerd)
- [V8 Isolates](https://v8.dev/docs/embed)
- [Security documentation](../security.md)

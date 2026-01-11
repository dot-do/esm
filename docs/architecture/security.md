# Security Documentation

This document describes the security model for esm.do.

## Threat Model

### Adversary Profile

esm.do executes untrusted user code. Potential adversaries may attempt:

1. **Remote Code Execution** - Execute arbitrary code outside the sandbox
2. **Data Exfiltration** - Access sensitive data or make network requests
3. **Denial of Service** - Exhaust resources (CPU, memory)
4. **Privilege Escalation** - Access other users' modules or system resources
5. **Injection Attacks** - XSS, prototype pollution, command injection

### Trust Boundaries

```
+------------------+
|  Untrusted       |  User-provided code (modules, tests, scripts)
+------------------+
         |
         v (sanitized input)
+------------------+
|  Sandbox         |  ai-evaluate / workerd isolate
+------------------+
         |
         v (controlled API)
+------------------+
|  Platform        |  Cloudflare Workers, Storage
+------------------+
```

## Input Sanitization

All user-provided code is sanitized before execution.

### Blocked Patterns

```typescript
const DANGEROUS_PATTERNS = [
  // XSS attempts
  { pattern: /<script[^>]*>/gi, message: 'Script tags are not allowed' },

  // Null bytes
  { pattern: /\u0000/g, message: 'Null bytes are not allowed' },

  // Dynamic code execution
  { pattern: /\beval\s*\(/g, message: 'eval() is not allowed' },
  { pattern: /\bwindow\s*\.\s*eval/g, message: 'window.eval() is not allowed' },
  { pattern: /\bglobalThis\s*\.\s*eval/g, message: 'globalThis.eval() is not allowed' },
  { pattern: /=\s*eval\b/g, message: 'Indirect eval is not allowed' },
  { pattern: /\bnew\s+Function\s*\(/g, message: 'new Function() is not allowed' },
  { pattern: /\bFunction\s*\(/g, message: 'Function() is not allowed' },

  // Dynamic imports
  { pattern: /\bimport\s*\(/g, message: 'Dynamic import() is not allowed' },

  // Prototype pollution
  { pattern: /__proto__/g, message: '__proto__ access is not allowed' },
  { pattern: /Object\s*\.\s*prototype/g, message: 'Object.prototype modification is not allowed' },
  { pattern: /Array\s*\.\s*prototype/g, message: 'Array.prototype modification is not allowed' },
  { pattern: /Function\s*\.\s*prototype/g, message: 'Function.prototype modification is not allowed' },
  { pattern: /\.constructor\s*\.\s*prototype/g, message: 'constructor.prototype access is not allowed' },
]
```

### Blocked Node.js Built-ins

```typescript
const BLOCKED_NODE_BUILTINS = [
  'fs', 'fs/promises',    // File system
  'child_process',        // Process spawning
  'path',                 // Path manipulation
  'os',                   // Operating system info
  'http', 'https', 'http2', // HTTP servers/clients
  'net', 'dgram',         // Raw network sockets
  'dns',                  // DNS lookups
  'tls',                  // TLS/SSL
  'cluster',              // Cluster process management
  'worker_threads',       // Worker threads
  'vm',                   // Virtual machine
  'process',              // Process object
  'crypto',               // Cryptography (Node.js version)
  'buffer',               // Buffer API
  'stream',               // Streams
  'util',                 // Utilities
  'events',               // Event emitter
  'assert',               // Assertions
  'readline', 'repl',     // Interactive input
  'module',               // Module system
  'url', 'querystring',   // URL parsing
  'string_decoder',       // String decoding
  'timers',               // Timer APIs
  'tty',                  // TTY
  'v8',                   // V8 internals
  'zlib',                 // Compression
]
```

### Import Restrictions

Only these import patterns are allowed:

- **Relative imports**: `./`, `../`
- **esm.do modules**: `esm.do/@scope/name`

Blocked:
- **External URLs**: `https://example.com/...`
- **npm packages**: `lodash`, `axios`, etc.
- **Node.js built-ins**: `node:fs`, `fs`

## Isolation Mechanisms

### V8 Isolate Sandbox

The `ai-evaluate` package uses Cloudflare workerd/miniflare which provides:

1. **Separate V8 isolates** for each execution
2. **No shared memory** between isolates
3. **Controlled global scope** with allowlisted APIs
4. **Time-bounded execution** via timeout enforcement

### Allowed Globals

```javascript
// Standard JavaScript built-ins
Object, Array, String, Number, Boolean, Date, Math, JSON, RegExp

// Error types
Error, TypeError, RangeError, SyntaxError, ReferenceError

// Collections
Map, Set, WeakMap, WeakSet

// Typed arrays
Int8Array, Uint8Array, Int16Array, Uint16Array,
Int32Array, Uint32Array, Float32Array, Float64Array

// Async primitives
Promise, async/await

// Metaprogramming
Proxy, Reflect, Symbol

// Console (output captured)
console.log, console.warn, console.error, console.info, console.debug

// Timers (with limits)
setTimeout, setInterval, clearTimeout, clearInterval

// Web Crypto API
crypto.getRandomValues, crypto.subtle.*

// Text encoding
TextEncoder, TextDecoder, atob, btoa

// URLs
URL, URLSearchParams

// SDK globals (when sdk: true)
ai, db, api, $
```

### Blocked Globals

```javascript
// Node.js environment
process           // No access to env vars, argv, exit
require           // No CommonJS module loading
__dirname         // No file path information
__filename        // No file path information
global            // Node.js global object
Buffer            // Node.js Buffer API
module, exports   // Node.js module system

// Network (blocked by default)
fetch             // HTTP requests blocked
XMLHttpRequest    // Not available
WebSocket         // Blocked

// Dynamic code execution
eval()            // Blocked
new Function()    // Blocked
import()          // Dynamic imports blocked

// Dangerous introspection
Reflect.getPrototypeOf  // Allowed but prototype mutation blocked
Object.getPrototypeOf   // Allowed but prototype mutation blocked
```

### Network Isolation

By default, all network access is blocked:

```typescript
const result = await evaluate({
  fetch: null,  // Explicitly disable fetch
  sdk: true,    // SDK api.fetch() can be used instead
})
```

Network requests through SDK globals can be:
- Monitored and logged
- Rate limited
- Restricted to allowlisted domains

## Resource Limits

### Timeout Enforcement

Default timeout: **5000ms** (5 seconds)

```typescript
// External timeout wrapper (catches CPU-bound infinite loops)
async function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('CPU timeout limit exceeded')), timeout)
  })
  return Promise.race([promise, timeoutPromise])
}
```

### Memory Limits

Memory is tracked by wrapping allocating operations:

```javascript
const __memoryTracker__ = {
  allocated: 0,
  limit: memoryLimit,

  track(bytes) {
    this.allocated += bytes
    if (this.allocated > this.limit) {
      throw new Error('Memory limit exceeded')
    }
  },

  estimateArraySize(length) {
    return length * 8 + 24  // 8 bytes per element + overhead
  }
}

// Wrapped Array constructor
globalThis.Array = function(...args) {
  const arr = new OriginalArray(...args)
  __memoryTracker__.track(__memoryTracker__.estimateArraySize(arr.length))
  return arr
}
```

### Payload Size Limits

- **Module code**: 1 MB max
- **HTTP request body**: 10 MB max

## Authentication and Authorization

### Rate Limiting

| Operation | Limit | Window |
|-----------|-------|--------|
| Read (GET) | 500 requests | 1 minute |
| Write (POST/DELETE) | 100 requests | 1 minute |

Per-IP rate limiting with headers:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds until limit resets (when exceeded)

### Protected Namespaces

Some namespaces require authentication:

```typescript
// @protected/* requires Authorization header
if (fullName.startsWith('@protected/')) {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return errorResponse('Authentication required', 401, requestId)
  }
}
```

### Input Validation

All inputs are validated:

1. **Module name format**: `@scope/name` pattern
2. **No path traversal**: `..` patterns blocked
3. **No empty segments**: `//` patterns blocked
4. **No trailing slashes**: `/` at end blocked
5. **Alphanumeric only**: `_`, `.` blocked in segments

## Error Handling

### Error Normalization

Errors are normalized to prevent information leakage:

```typescript
// Raw error -> Normalized error
'require is not defined' -> 'require is not defined'
'Cannot read properties of undefined (reading "env")' -> 'process is not defined'
'ReferenceError: __dirname is not defined' -> '__dirname is not defined'
'timeout exceeded' -> 'Script timeout limit exceeded'
'Maximum call stack size exceeded' -> 'Script timeout limit exceeded'
'fetch failed' -> 'Memory limit exceeded'  // Worker crash
```

### Stack Traces

Stack traces are captured but sanitized:
- Internal implementation details removed
- Line numbers may be approximate (due to code transformation)

## Best Practices

### For Module Authors

1. **No sensitive data** - Don't include secrets, API keys, or credentials
2. **No side effects** - Modules should be pure functions
3. **Handle errors** - Catch and handle errors gracefully
4. **Validate inputs** - Don't trust input data
5. **Avoid recursion** - Use iteration to prevent stack overflow

### For Platform Operators

1. **Monitor execution** - Track execution times and failures
2. **Rate limit aggressively** - Protect against abuse
3. **Review modules** - Manual review for popular/featured modules
4. **Update dependencies** - Keep ai-evaluate and workerd current
5. **Audit logs** - Log all write and delete operations

### For API Consumers

1. **Validate responses** - Don't trust returned data blindly
2. **Handle errors** - Expect and handle API errors
3. **Respect rate limits** - Implement backoff strategies
4. **Use version pinning** - Specify versions for reproducibility

## Incident Response

If a security issue is discovered:

1. **Isolate** - Disable affected modules/features
2. **Investigate** - Review logs and code
3. **Patch** - Deploy fixes
4. **Notify** - Inform affected users
5. **Post-mortem** - Document and learn

## Security Checklist

- [ ] All user code passes sanitization
- [ ] Timeouts are enforced
- [ ] Memory limits are in place
- [ ] Network access is blocked by default
- [ ] Rate limiting is active
- [ ] Authentication is required for protected operations
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies are up to date
- [ ] Audit logging is enabled

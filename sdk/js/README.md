# @esm.do/sdk

JavaScript/TypeScript SDK client for [esm.do](https://esm.do) - the living ESM module system for AI agents.

## Installation

```bash
npm install @esm.do/sdk
# or
pnpm add @esm.do/sdk
# or
yarn add @esm.do/sdk
```

## Quick Start

```typescript
import { ESMClient } from '@esm.do/sdk'

// Create a client
const client = new ESMClient({
  baseUrl: 'https://esm.do',
  token: 'your-api-token' // optional, for protected operations
})

// Read a module
const module = await client.read('@math/add')
console.log(module.types)
console.log(module.module)

// Run a module's script
const result = await client.run('@math/add')
console.log('Result:', result.result)
```

## Configuration

```typescript
const client = new ESMClient({
  // Base URL for the esm.do API (default: 'https://esm.do')
  baseUrl: 'https://esm.do',

  // Authentication token for protected operations
  token: 'your-api-token',

  // Request timeout in milliseconds (default: 30000)
  timeout: 30000,

  // Maximum retry attempts for failed requests (default: 3)
  maxRetries: 3,

  // Initial delay between retries in ms (default: 1000)
  retryDelay: 1000,

  // Custom headers to include in all requests
  headers: {
    'X-Custom-Header': 'value'
  }
})
```

## API Reference

### Reading Modules

#### `read(name, version?)`

Read a module by name, optionally at a specific version.

```typescript
// Read latest version
const module = await client.read('@scope/name')

// Read specific version
const moduleV1 = await client.read('@scope/name', 'v1.0.0')
const moduleSha = await client.read('@scope/name', 'abc123def')

// Access module content
console.log(module.name)       // '@scope/name'
console.log(module.version)    // 'abc123def456'
console.log(module.types)      // TypeScript declarations
console.log(module.module)     // JavaScript code
console.log(module.tests)      // Test code
console.log(module.script)     // Script code
```

#### `getTypes(name, version?)`

Get only the TypeScript declaration file.

```typescript
const types = await client.getTypes('@math/add')
// 'export declare function add(a: number, b: number): number;'
```

#### `getModule(name, version?)`

Get only the JavaScript module code.

```typescript
const code = await client.getModule('@math/add')
// 'export function add(a, b) { return a + b; }'
```

### Writing Modules

#### `write(options)`

Create or update a module.

```typescript
const result = await client.write({
  name: '@scope/my-module',
  types: 'export declare function greet(name: string): string;',
  module: 'export function greet(name) { return `Hello, ${name}!`; }',
  tests: `
    describe('greet', () => {
      it('greets correctly', () => {
        expect(greet('World')).toBe('Hello, World!');
      });
    });
  `,
  script: 'return greet("SDK");',
  options: {
    // Create a version tag
    tag: 'v1.0.0',
    // Custom commit message
    commitMessage: 'Initial release',
    // Force save even if tests fail
    force: false
  }
})

console.log('Version:', result.version)
console.log('Created:', result.created)
console.log('Test results:', result.testResults)
```

### Running Scripts

#### `run(name, options?)`

Execute a module's script.

```typescript
const result = await client.run('@math/calculator', {
  input: { expression: '2 + 2' },
  timeout: 5000
})

console.log('Result:', result.result)  // 4
console.log('Logs:', result.logs)      // Console output
console.log('Duration:', result.duration, 'ms')
```

### Running Tests

#### `test(name, options?)`

Run a module's tests.

```typescript
const results = await client.test('@math/add', {
  timeout: 10000
})

console.log(`Tests: ${results.passed}/${results.total} passed`)
console.log(`Duration: ${results.duration}ms`)

// Check for failures
if (results.failed > 0) {
  for (const test of results.results) {
    if (test.status === 'failed') {
      console.log(`FAIL: ${test.name}`)
      console.log(`  ${test.error?.message}`)
    }
  }
}
```

### Version Management

#### `versions(name, limit?)`

Get version history.

```typescript
const history = await client.versions('@math/add', 10)

for (const version of history.versions) {
  console.log(`${version.sha.slice(0, 7)}: ${version.message}`)
  console.log(`  by ${version.author} at ${version.timestamp}`)
}
```

#### `diff(name, from, to)`

Compare two versions.

```typescript
const diff = await client.diff('@math/add', 'abc123', 'def456')

console.log('Changes:')
console.log(diff.diff)
console.log(`+${diff.stats?.additions} -${diff.stats?.deletions}`)
```

#### `revert(name, to)`

Revert to a previous version.

```typescript
const result = await client.revert('@math/add', 'abc123')
console.log('Reverted to version:', result.version)
```

### Deleting Modules

#### `delete(name)`

Delete a module (requires authentication for protected namespaces).

```typescript
const result = await client.delete('@scope/old-module')
console.log('Deleted:', result.deleted)
```

### Listing Modules

#### `list(scope)`

List all modules in a scope.

```typescript
const list = await client.list('math')
// or: client.list('@math')

console.log(`Found ${list.count} modules:`)
for (const name of list.modules) {
  console.log(`  - ${name}`)
}
```

### Dependency Analysis

#### `deps(name)`

Get direct dependencies.

```typescript
const deps = await client.deps('@math/stats')
console.log('Dependencies:', deps.dependencies)
```

#### `depsTree(name)`

Get dependency tree.

```typescript
const tree = await client.depsTree('@math/stats')
console.log('Tree:', JSON.stringify(tree.tree, null, 2))
```

#### `depsFlat(name)`

Get all transitive dependencies.

```typescript
const flat = await client.depsFlat('@math/stats')
console.log(`Total dependencies: ${flat.count}`)
console.log(flat.dependencies)
```

## Error Handling

The SDK throws typed errors for different failure scenarios:

```typescript
import { ESMClient, ESMError, NetworkError, TimeoutError, RetryExhaustedError } from '@esm.do/sdk'

try {
  const result = await client.read('@scope/nonexistent')
} catch (error) {
  if (error instanceof ESMError) {
    console.log('API Error:', error.message)
    console.log('Status:', error.status)
    console.log('Request ID:', error.requestId)
  } else if (error instanceof NetworkError) {
    console.log('Network Error:', error.message)
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out')
  } else if (error instanceof RetryExhaustedError) {
    console.log(`All ${error.attempts} retry attempts failed`)
    console.log('Last error:', error.lastError.message)
  }
}
```

## Factory Methods

### `ESMClient.production(token?)`

Create a client for the production API.

```typescript
const client = ESMClient.production('your-token')
```

### `ESMClient.local(port?)`

Create a client for local development.

```typescript
const client = ESMClient.local(8787)
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions. All types are exported:

```typescript
import type {
  ESMClientConfig,
  ReadResult,
  WriteOptions,
  WriteResult,
  RunOptions,
  RunResult,
  TestOptions,
  TestResults,
  VersionsResult,
  DeleteResult,
  ESMError,
} from '@esm.do/sdk'
```

## Automatic Retries

The SDK automatically retries failed requests with exponential backoff for:

- Network errors (connection failures)
- Server errors (5xx status codes)
- Rate limiting (429 status codes)

Configure retry behavior:

```typescript
const client = new ESMClient({
  maxRetries: 5,      // Retry up to 5 times
  retryDelay: 2000,   // Start with 2 second delay
})
```

Retries use exponential backoff with jitter, capped at 30 seconds.

## License

MIT

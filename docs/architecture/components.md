# Component Breakdown

This document describes the major components of the esm.do system.

## Worker Layer (`src/worker/`)

The worker layer is the entry point for the Cloudflare Workers deployment.

### Entry Point (`src/worker/index.ts`)

Re-exports the main worker implementation from `src/api/worker.ts`.

```typescript
export { default } from '../api/worker.js'
```

**Configuration** (`wrangler.jsonc`):
- `nodejs_compat` flag for Node.js compatibility
- `unsafe_eval` binding for dynamic code execution in workerd

### Middleware

- **CORS** (`src/middleware/cors.ts`): Cross-origin request handling
- **Auth** (`src/middleware/auth.ts`): Authorization header validation
- **Security Headers** (`src/middleware/security-headers.ts`): HTTP security headers

## ESM Class (`src/esm.ts`, `core/esm.ts`)

The ESM class is the core module management interface.

### Key Features

```typescript
class ESM {
  // Factory methods
  static create(options?: ESMOptions): ESM
  static withStorage(storage: ModuleStorage): ESM

  // Module operations
  async write(options: WriteOptions): Promise<WriteResult>
  async read(name: string, version?: string): Promise<ReadResult>
  async run(options: RunOptions): Promise<RunResult>
  async test(options: TestOptions): Promise<TestResult>
  async delete(name: string): Promise<DeleteResult>

  // Query operations
  async list(pattern?: string): Promise<string[]>
  async versions(name: string, limit?: number): Promise<ModuleVersion[]>
  async diff(name: string, from: string, to: string): Promise<DiffResult>
}
```

### Options

```typescript
interface ESMOptions {
  storage?: ModuleStorage        // Custom storage backend
  enableCaching?: boolean        // Enable LRU cache (default: true)
  cacheSize?: number            // Max cached items (default: 1000)
  cacheTTL?: number             // Cache TTL in ms
  validateOnWrite?: boolean     // Validate types on write (default: true)
  logger?: Logger               // Custom logger
}
```

### Write Flow

1. Validate module name format (`@scope/name`)
2. Sanitize module code (check for dangerous patterns)
3. Sanitize type definitions
4. Run tests if provided (must pass)
5. Execute script if provided (optional, failures logged)
6. Store module via storage backend
7. Invalidate cache for module and dependents
8. Track dependencies for cache invalidation

### Internal Components

- **Mutex**: Write serialization for thread-safety
- **LRUCache**: Cached module exports with TTL
- **DependencyMap**: Tracks module dependencies for cache invalidation

## Storage Layer (`src/storage/`)

The storage layer provides pluggable backends for module persistence.

### ModuleStorage Interface

```typescript
interface ModuleStorage {
  read(name: string, version?: string): Promise<StoredModule | null>
  write(name: string, module: StoredModule): Promise<WriteResult>
  delete(name: string): Promise<void>
  list(pattern?: string): Promise<string[]>
  versions(name: string, limit?: number): Promise<ModuleVersion[]>

  // Optional tier management
  getTier?(name: string): Promise<StorageTier>
  setTier?(name: string, tier: StorageTier): Promise<void>
}
```

### StoredModule

```typescript
interface StoredModule {
  name: string      // Module name (@scope/name)
  types: string     // TypeScript declarations (.d.ts)
  module: string    // ESM implementation (.mjs)
  tests: string     // Test file (.test.js)
  script: string    // Script file (.script.js)
  version?: string  // Content hash (set on read)
  createdAt?: Date
  updatedAt?: Date
}
```

### Implementations

| Backend | Location | Use Case |
|---------|----------|----------|
| InMemoryStorage | `core/storage/memory.ts` | Testing, development |
| GitxStorage | `src/storage/gitx.ts` | Git-like versioning |
| CloudflareStorage | `src/storage/cloudflare.ts` | Production (KV/D1/R2) |

See [Storage Architecture](./storage.md) for details.

## Executor Layer (`src/executor/`, `core/executor/`)

The executor layer handles safe code execution.

### SandboxExecutor (`core/executor/sandbox.ts`)

Uses the `ai-evaluate` package for isolated V8 execution.

```typescript
class SandboxExecutor implements Executor {
  // Validate exports match types
  async validate(types: string, module: string): Promise<ValidationResult>

  // Run tests in sandbox
  async test(module: string, tests: string, options?: TestOptions): Promise<TestResult>

  // Execute script with module exports in scope
  async run(module: string, script: string, args?: Record<string, unknown>, options?: RunOptions): Promise<RunResult>
}
```

### Sanitization (`core/executor/sanitize.ts`)

Input validation before execution:

```typescript
// Check for dangerous patterns
function sanitizeModuleCode(code: string): SanitizationResult
function sanitizeTestCode(code: string): SanitizationResult
function sanitizeScriptCode(code: string): SanitizationResult
function sanitizeTypeDefinitions(types: string): SanitizationResult
```

**Blocked Patterns**:
- `eval()`, `new Function()`
- `import()` dynamic imports
- `__proto__`, `Object.prototype` (prototype pollution)
- `<script>` tags (XSS)
- Node.js built-ins (fs, child_process, etc.)
- External URL imports

### Worker Adapter (`src/executor/worker-adapter.ts`)

Cloudflare Workers-specific executor that uses the `unsafe_eval` binding for dynamic code execution in the workerd environment.

## API Layer (`src/api/`)

HTTP API handlers for the Cloudflare Worker.

### Main Worker (`src/api/worker.ts`)

Route handlers organized by HTTP method:

**GET Routes**:
- `handleGetModuleInfo` - Module metadata
- `handleGetTypes` - TypeScript declarations
- `handleGetModule` - ESM code
- `handleGetTests` - Test file
- `handleGetScript` - Script file
- `handleGetBundle` - Bundled module with dependencies
- `handleDiff` - Version diff
- `handleListModules` - List modules in scope
- `handleGetDeps*` - Dependency queries

**POST Routes**:
- `handleCreateModule` - Create/update module
- `handleRunTests` - Execute tests
- `handleRunScript` - Execute script
- `handleRevert` - Revert to version

**DELETE Routes**:
- `handleDeleteModule` - Soft delete module

### GitxStorage Integration (`src/api/storage.ts`)

In-memory Git-like client for the worker:

```typescript
class InMemoryGitxClient implements GitxClient {
  // Blob operations
  writeBlob(content: string): Promise<string>
  readBlob(hash: string): Promise<string>

  // Tree operations
  writeTree(entries: Record<string, string>): Promise<string>
  readTree(hash: string): Promise<Record<string, string>>

  // Commit operations
  commit(treeHash: string, message: string, parent?: string): Promise<string>
  getCommit(hash: string): Promise<CommitInfo>

  // Ref operations
  updateRef(ref: string, commitHash: string): Promise<void>
  getRef(ref: string): Promise<string | null>
  listRefs(prefix?: string): Promise<Record<string, string>>
}
```

## Resolver Layer (`src/resolver/`)

Handles esm.do module imports.

### DependencyResolver (`src/resolver/dependency.ts`)

```typescript
class DependencyResolver {
  // Parse import statements
  parseImports(source: string): ParsedImport[]

  // Build dependency graph
  async buildGraph(entryName: string, entrySource: string): Promise<DependencyGraph>

  // Detect circular dependencies
  detectCircular(graph: DependencyGraph): string[] | null

  // Get topological sort
  topologicalSort(graph: DependencyGraph): string[]

  // Resolve module with all dependencies
  async resolve(name: string, source: string): Promise<ResolvedModule>
}
```

### Supported Import Patterns

```javascript
// Named imports
import { add, subtract } from 'esm.do/@math/calculator'

// Aliased imports
import { add as plus } from 'esm.do/@math/calculator'

// Namespace imports
import * as math from 'esm.do/@math/calculator'

// Default imports
import calculator from 'esm.do/@math/calculator'

// Re-exports
export { add } from 'esm.do/@math/calculator'
```

### Resolution Process

1. Parse imports from entry module
2. Fetch all dependency modules in parallel
3. Build dependency graph
4. Detect circular dependencies (throw if found)
5. Topologically sort dependencies
6. Rewrite imports to use resolved namespaces
7. Bundle dependencies with entry module

## CLI Layer (`src/cli/`)

Command-line interface for local development.

```bash
# Initialize module
esm init @math/add

# Write module files
esm write @math/add --types="..." --module="..." --tests="..."

# Run tests
esm test @math/add

# Execute script
esm run @math/add

# View history
esm log @math/add
```

## MCP Layer (`src/mcp/`)

Model Context Protocol tools for AI agents.

### Available Tools

| Tool | Description |
|------|-------------|
| `esm_list` | List modules matching pattern |
| `esm_read` | Read module contents |
| `esm_write` | Create or update module |
| `esm_test` | Run module tests |
| `esm_run` | Execute module script |
| `esm_versions` | Get version history |
| `esm_diff` | Compare versions |
| `esm_delete` | Remove module |

# Storage Architecture

This document describes the storage layer design for esm.do.

## Storage Interface

All storage backends implement the `ModuleStorage` interface:

```typescript
interface ModuleStorage {
  /**
   * Read a module from storage
   * @param name Module name (e.g., "@math/add")
   * @param version Optional version hash (defaults to latest)
   * @returns The stored module or null if not found
   */
  read(name: string, version?: string): Promise<StoredModule | null>

  /**
   * Write a module to storage atomically
   * @param name Module name
   * @param module Module content
   * @returns Write result with version hash
   */
  write(name: string, module: StoredModule | ModuleInput): Promise<WriteResult>

  /**
   * Delete a module from storage (soft delete)
   * @param name Module name
   */
  delete(name: string): Promise<void>

  /**
   * List modules matching a pattern
   * @param pattern Optional glob pattern (e.g., "@math/*")
   * @returns Array of module names
   */
  list(pattern?: string): Promise<string[]>

  /**
   * Get version history for a module
   * @param name Module name
   * @param limit Maximum number of versions to return
   * @returns Array of version info in reverse chronological order
   */
  versions(name: string, limit?: number): Promise<ModuleVersion[]>

  // Optional tier management for tiered storage
  getTier?(name: string): Promise<StorageTier>
  setTier?(name: string, tier: StorageTier): Promise<void>
}
```

## Storage Backends

### InMemoryStorage (`core/storage/memory.ts`)

Fast, ephemeral storage for testing and development.

**Characteristics**:
- Zero external dependencies
- Data lost on process exit
- No version history persistence
- Ideal for unit tests

**Implementation**:

```typescript
class InMemoryStorage implements ModuleStorage {
  private modules = new Map<string, StoredModule>()
  private history = new Map<string, ModuleVersion[]>()

  // Version generation
  private generateVersion(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
  }
}
```

**Usage**:

```typescript
import { InMemoryStorage } from '@dotdo/esm'

const storage = new InMemoryStorage()
const esm = ESM.withStorage(storage)

// Clear all data
storage.clear()
```

### GitxStorage (`src/storage/gitx.ts`)

Content-addressed storage using git-like primitives.

**Characteristics**:
- SHA-1 based content hashing
- Immutable blob storage
- Tree structures for module files
- Commit history with parent references
- Branch refs for latest versions

**Data Model**:

```
refs/
  modules/
    @math/add -> commit-sha
    @math/stats -> commit-sha

commits/
  abc123def... -> { tree, parent, message, timestamp }

trees/
  def456abc... -> { "index.d.ts": blob-sha, "index.mjs": blob-sha, ... }

blobs/
  fed789cba... -> "export function add(a, b) { return a + b }"
```

**Implementation**:

```typescript
class GitxStorage implements ModuleStorage {
  constructor(client: GitxClient, traceHook?: StorageTraceHook)

  // Internal operations
  private moduleToRef(name: string): string  // @math/add -> refs/modules/@math/add
  private refToModule(ref: string): string   // refs/modules/@math/add -> @math/add
}
```

**GitxClient Interface**:

```typescript
interface GitxClient {
  // Blob operations
  writeBlob(content: string): Promise<string>
  readBlob(hash: string): Promise<string>

  // Tree operations
  writeTree(entries: Record<string, string>): Promise<string>
  readTree(hash: string): Promise<Record<string, string>>

  // Commit operations
  commit(treeHash: string, message: string, parent?: string): Promise<string>
  getCommit(hash: string): Promise<{ tree, parent?, message, timestamp }>

  // Ref operations
  updateRef(ref: string, commitHash: string): Promise<void>
  getRef(ref: string): Promise<string | null>
  listRefs(prefix?: string): Promise<Record<string, string>>
  deleteRef(ref: string): Promise<void>

  // History traversal
  log(startCommit: string, limit?: number): Promise<CommitInfo[]>
}
```

**Write Flow**:

1. Validate module name format
2. Validate module content completeness
3. Write four blobs in parallel (types, module, tests, script)
4. Create tree with file -> blob mapping
5. Get parent commit from ref (if exists)
6. Create commit with tree, message, parent
7. Update ref to point to new commit

**Read Flow**:

1. Get commit hash from ref (or use provided version)
2. Read commit to get tree hash
3. Read tree to get blob hashes
4. Read all blobs in parallel
5. Assemble and return StoredModule

### CloudflareStorage (`src/storage/cloudflare.ts`)

Production storage using Cloudflare infrastructure.

**Characteristics**:
- KV for fast blob lookups
- D1 for SQL queries (listing, history)
- Optional Durable Objects for write coordination
- Tiered storage support (hot/warm/cold)

**Bindings**:

```typescript
interface CloudflareStorageBindings {
  KV: KVNamespace       // Blob content and refs
  D1: D1Database        // Module listings and versions
  DO?: DurableObjectNamespace  // Write coordination
}
```

**KV Key Structure**:

```
ref/<module-name>           -> version hash
blob/<hash>/meta            -> { typesHash, moduleHash, testsHash, scriptHash }
blob/<hash>/types           -> types content
blob/<hash>/module          -> module content
blob/<hash>/tests           -> tests content
blob/<hash>/script          -> script content
blob/<content-hash>         -> content (deduplicated)
```

**D1 Schema**:

```sql
CREATE TABLE modules (
  name TEXT PRIMARY KEY,
  latest_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'hot'
);

CREATE TABLE module_versions (
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  PRIMARY KEY (name, version)
);
```

**Tiered Storage**:

| Tier | Storage | Access Speed | Cost |
|------|---------|--------------|------|
| hot | KV + edge cache | Fastest | Highest |
| warm | KV | Fast | Medium |
| cold | R2 | Slower | Lowest |

```typescript
// Get current tier
const tier = await storage.getTier('@math/add')

// Move to cold storage
await storage.setTier('@math/add', 'cold')
```

## Module Naming

All storage backends enforce a consistent naming convention:

**Pattern**: `@scope/name` or `@scope/nested/path/name`

**Regex**: `/^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/`

**Valid Examples**:
- `@math/add`
- `@utils/string-helpers`
- `@org/nested/deep/module`

**Invalid Examples**:
- `math/add` (missing @)
- `@math_helpers/add` (underscore in scope)
- `@math/` (trailing slash)
- `@math/../add` (path traversal)

## Glob Pattern Matching

The `list()` method supports glob patterns:

| Pattern | Matches |
|---------|---------|
| `@math/*` | `@math/add`, `@math/stats` |
| `@*/utils` | `@foo/utils`, `@bar/utils` |
| `**` | All modules |
| `@math/calc*` | `@math/calculator`, `@math/calculus` |

**Implementation**:

```typescript
function matchGlob(pattern: string, name: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')

  return new RegExp(`^${regexPattern}$`).test(name)
}
```

## Version History

Versions are content-addressed using SHA-1 (or similar) hashes:

```typescript
interface ModuleVersion {
  version: string      // Content hash (e.g., "a3f2dd1...")
  message: string      // Commit message
  timestamp: Date      // When version was created
  parent?: string      // Previous version hash
}
```

**Querying History**:

```typescript
// Get all versions
const versions = await storage.versions('@math/add')

// Get last 5 versions
const recent = await storage.versions('@math/add', 5)

// Read specific version
const v1 = await storage.read('@math/add', 'a3f2dd1...')
```

## Error Handling

Each storage backend defines specific error types:

```typescript
// GitxStorage errors
class GitxStorageError extends Error { code: string; context?: Record<string, unknown> }
class InvalidModuleNameError extends GitxStorageError
class ModuleNotFoundError extends GitxStorageError
class InvalidModuleContentError extends GitxStorageError
class GitxClientError extends GitxStorageError

// CloudflareStorage errors
class CloudflareStorageError extends Error { code: string; context?: Record<string, unknown> }
class InvalidModuleNameError extends CloudflareStorageError
class ModuleNotFoundError extends CloudflareStorageError
```

## Custom Storage Backends

Implement the `ModuleStorage` interface:

```typescript
class MyCustomStorage implements ModuleStorage {
  async read(name: string, version?: string): Promise<StoredModule | null> {
    // Your implementation
  }

  async write(name: string, module: StoredModule): Promise<WriteResult> {
    // Your implementation - must return { version: string, name: string }
  }

  async delete(name: string): Promise<void> {
    // Your implementation
  }

  async list(pattern?: string): Promise<string[]> {
    // Your implementation
  }

  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    // Your implementation
  }
}

// Use with ESM
const esm = ESM.withStorage(new MyCustomStorage())
```

## Tracing and Monitoring

GitxStorage supports tracing hooks:

```typescript
interface StorageTraceHook {
  trace(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void
}

// Example usage
const traceHook: StorageTraceHook = {
  trace(level, message, context) {
    console.log(`[${level}] ${message}`, context)
  }
}

const storage = new GitxStorage(client, traceHook)
```

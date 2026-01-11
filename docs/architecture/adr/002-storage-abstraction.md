# ADR 002: Storage Abstraction with Pluggable Backends

## Status

Accepted

## Context

esm.do needs to store and retrieve module content consisting of:

1. TypeScript declarations (`.d.ts`)
2. ESM implementation (`.mjs`)
3. Test file (`.test.js`)
4. Script file (`.script.js`)

Requirements:

- **Versioning**: Track all versions with content-based hashes
- **Atomic writes**: All four files must be written together
- **Fast reads**: Low latency for module imports
- **Query support**: List modules by pattern, get version history
- **Platform flexibility**: Work in different environments

We considered:

- **Direct Cloudflare KV/D1 usage**: Simple but platform-locked
- **Git repository**: Full version control but complex
- **Abstract storage interface**: Decoupled but requires implementation work

## Decision

We chose a **pluggable storage interface** with multiple backend implementations.

## Rationale

### Interface Abstraction

The `ModuleStorage` interface defines five core operations:

```typescript
interface ModuleStorage {
  read(name: string, version?: string): Promise<StoredModule | null>
  write(name: string, module: StoredModule): Promise<WriteResult>
  delete(name: string): Promise<void>
  list(pattern?: string): Promise<string[]>
  versions(name: string, limit?: number): Promise<ModuleVersion[]>
}
```

This enables:

1. **Testing**: InMemoryStorage for fast unit tests
2. **Development**: Local storage without cloud dependencies
3. **Production**: CloudflareStorage with KV/D1/R2
4. **Alternative platforms**: Can implement for AWS, GCP, etc.

### Content-Addressed Storage

Version hashes are derived from content:

```typescript
const versionContent = `${typesHash}:${moduleHash}:${testsHash}:${scriptHash}`
const versionHash = await hashContent(versionContent)
```

Benefits:

- **Immutable versions**: Same content = same hash
- **Deduplication**: Identical content stored once
- **Integrity**: Hash validates content

### Git-Like Model (GitxStorage)

GitxStorage uses git primitives:

```
refs/modules/@math/add -> commit-sha
commits/abc123 -> { tree, parent, message, timestamp }
trees/def456 -> { "index.d.ts": blob-sha, ... }
blobs/fed789 -> content
```

Benefits:

- **Full history**: Traverse parent commits
- **Familiar model**: Git concepts are well-understood
- **Atomic updates**: Commit is atomic reference update

### Tiered Storage

CloudflareStorage supports storage tiers:

```typescript
type StorageTier = 'hot' | 'warm' | 'cold'

await storage.setTier('@math/add', 'cold')
```

| Tier | Backend | Use Case |
|------|---------|----------|
| hot | KV + edge | Frequently accessed |
| warm | KV | Moderate access |
| cold | R2 | Rarely accessed |

## Consequences

### Positive

1. **Testability**: Unit tests use InMemoryStorage
2. **Portability**: Core package has no Cloudflare deps
3. **Flexibility**: Easy to add new backends
4. **Consistency**: All backends share the same interface
5. **Versioning**: Content-addressed storage is robust

### Negative

1. **Implementation overhead**: Each backend needs full implementation
2. **Feature parity**: Optional methods may not be supported everywhere
3. **Testing burden**: Each backend needs its own tests
4. **Abstraction cost**: Minor performance overhead

### Mitigations

1. **Shared test suite**: Same tests run against all backends
2. **Optional methods**: `getTier?`, `setTier?` are optional
3. **Type safety**: TypeScript ensures interface compliance
4. **Performance focus**: Hot path optimized in each implementation

## Backend Comparison

| Feature | InMemory | GitxStorage | CloudflareStorage |
|---------|----------|-------------|-------------------|
| Persistence | No | Depends on client | Yes |
| Versioning | Basic | Full git history | D1 table |
| Performance | Fastest | Fast | Fast (edge) |
| Scalability | Single process | Depends | Global |
| Use case | Testing | Git semantics | Production |

## Implementation Details

### InMemoryStorage

```typescript
class InMemoryStorage implements ModuleStorage {
  private modules = new Map<string, StoredModule>()
  private history = new Map<string, ModuleVersion[]>()
}
```

### GitxStorage

```typescript
class GitxStorage implements ModuleStorage {
  constructor(client: GitxClient, traceHook?: StorageTraceHook)

  // Converts @math/add -> refs/modules/@math/add
  private moduleToRef(name: string): string
}
```

### CloudflareStorage

```typescript
class CloudflareStorage implements ModuleStorage {
  constructor(bindings: CloudflareStorageBindings)

  // KV for content, D1 for queries
  private kv: KVNamespace
  private d1: D1Database
}
```

## Alternatives Considered

### Single KV Backend

**Pros**:
- Simple implementation
- No abstraction overhead

**Cons**:
- Platform locked
- Harder to test
- No local development

### Full Git Repository

**Pros**:
- Standard tooling
- Rich history features

**Cons**:
- Complex to implement
- Heavyweight for simple modules
- Requires git infrastructure

### Database Only (D1/SQLite)

**Pros**:
- SQL queries
- ACID transactions

**Cons**:
- Blob storage less efficient
- No content addressing
- Version history complex

## References

- [ModuleStorage interface](../storage.md)
- [Content-addressable storage](https://en.wikipedia.org/wiki/Content-addressable_storage)
- [Git internals](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)

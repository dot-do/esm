# esm.do Architecture Overview

> Living ESM modules for AI agents - types, code, tests, and scripts in one place.

## System Architecture

```
+-------------------------------------------------------------------+
|                        Access Layer                                |
|  +----------+ +----------+ +----------+ +--------------+          |
|  |   API    | |   CLI    | |   MCP    | |     SDK      |          |
|  | esm.do/* | | esm cmd  | | Tools    | | import esm   |          |
|  +----------+ +----------+ +----------+ +--------------+          |
+----------------------------------+------------------------------------+
                                   |
+----------------------------------v------------------------------------+
|                        ESM Class (Core)                               |
|  +----------------------------------------------------------------+  |
|  |  - Module CRUD (write, read, delete)                           |  |
|  |  - Test execution with sandbox                                 |  |
|  |  - Script execution with exports in scope                      |  |
|  |  - Dependency resolution (esm.do/@scope/module)                |  |
|  |  - Version management and diff                                 |  |
|  |  - LRU cache with TTL                                          |  |
|  +----------------------------------------------------------------+  |
+----------------------------------+------------------------------------+
                                   |
            +----------------------+----------------------+
            |                      |                      |
+-----------|-------+  +-----------v-----------+  +-------v-----------+
|    Storage Layer  |  |   Executor Layer      |  |  Resolver Layer   |
|  +-------------+  |  |  +----------------+   |  | +---------------+ |
|  | ModuleStorage|  |  |  | SandboxExecutor|   |  | |DependencyResolver|
|  | Interface   |  |  |  | (ai-evaluate)  |   |  | |               | |
|  +-------------+  |  |  +----------------+   |  | +---------------+ |
|        |          |  |         |             |  +---------+---------+
|  +-----v-------+  |  |  +------v---------+   |            |
|  |InMemoryStorage| |  |  | Input         |   |            |
|  +-------------+  |  |  | Sanitization   |   |            |
|  +-------------+  |  |  +----------------+   |            |
|  |GitxStorage  |  |  +----------------------+            |
|  +-------------+  |                                       |
|  +-------------+  |                                       |
|  |Cloudflare   |  |                                       |
|  |Storage      |  |                                       |
|  +-------------+  |                                       |
+-------------------+---------------------------------------+
```

## Core Concepts

### Module Structure

Every esm.do module consists of four synchronized files:

```
@scope/module/
├── index.d.ts      # Types - the contract (TypeScript declarations)
├── index.mjs       # Module - the implementation (ESM JavaScript)
├── index.test.js   # Tests - the verification (vitest-compatible)
└── index.script.js # Script - the execution entry point
```

### Content-Addressed Storage

Modules are stored using git-like content-addressed storage:

- **Blobs**: Immutable content storage (SHA-1 hashed)
- **Trees**: Module structure (maps filenames to blob hashes)
- **Commits**: Versions with parent references
- **Refs**: Named pointers to commits (latest version)

### Sandboxed Execution

All code execution happens in isolated V8 contexts via the `ai-evaluate` package:

- Network access blocked by default
- Dangerous globals (process, require, fs) unavailable
- Timeout enforcement for runaway code
- Memory limits via tracking wrappers

## Package Structure

The project uses pnpm workspaces with two packages:

```
esm.do/
├── core/           # @dotdo/esm - Platform-agnostic core
│   ├── esm.ts      # ESM class
│   ├── executor/   # SandboxExecutor
│   ├── resolver/   # DependencyResolver
│   └── storage/    # Storage types and InMemoryStorage
│
└── src/            # esm.do - Cloudflare Workers implementation
    ├── worker/     # Worker entry point
    ├── api/        # HTTP API handlers
    ├── storage/    # GitxStorage, CloudflareStorage
    └── cli/        # Command-line interface
```

## Design Principles

### 1. Types First

Every module starts with a TypeScript declaration file that defines the contract.
The module implementation must match the declared exports.

### 2. Test-Driven

Tests are a first-class citizen, stored alongside the module code.
When writing a module, tests run automatically and must pass.

### 3. Version Everything

Every change creates a new version with a content-based SHA hash.
Full history is preserved and accessible via version queries.

### 4. Platform Agnostic Core

The `@dotdo/esm` core package has zero Cloudflare dependencies.
It can run in Node.js, browsers, or any JavaScript runtime.

### 5. Secure by Default

- No dynamic imports (`import()` blocked)
- No `eval()` or `new Function()`
- No prototype pollution (`__proto__`, `Object.prototype`)
- No Node.js built-ins (fs, child_process, etc.)
- No external URL imports

### 6. Explicit Dependencies

Modules can only import:
- Relative imports (`./`, `../`)
- Other esm.do modules (`esm.do/@scope/name`)

External npm packages are not allowed in the sandbox.

## Request Flow

1. **Request arrives** at Cloudflare Worker
2. **Rate limiting** checked (100 req/min write, 500 req/min read)
3. **Path parsing** extracts scope, name, version, extension
4. **Route matching** dispatches to appropriate handler
5. **Storage layer** reads/writes module data
6. **Executor layer** runs tests or scripts (if requested)
7. **Response** returned with CORS headers

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:scope/:name` | Module info (JSON) |
| GET | `/:scope/:name.d.ts` | TypeScript declarations |
| GET | `/:scope/:name.mjs` | ESM module code |
| GET | `/:scope/:name.test.js` | Test file |
| GET | `/:scope/:name.script.js` | Script file |
| GET | `/:scope/:name@:version` | Specific version |
| POST | `/:scope/:name` | Create/update module |
| POST | `/:scope/:name/test` | Run tests |
| POST | `/:scope/:name/run` | Execute script |
| DELETE | `/:scope/:name` | Delete module |

## Related Documentation

- [Component Breakdown](./components.md)
- [Storage Architecture](./storage.md)
- [Execution Model](./execution.md)
- [Security Documentation](./security.md)
- [Architecture Decision Records](./adr/)

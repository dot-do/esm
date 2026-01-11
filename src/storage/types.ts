/**
 * Storage layer types for esm.do
 *
 * Re-exports shared types from @dotdo/esm core and defines
 * src-specific types for gitx.do content-addressed storage.
 */

// =============================================================================
// Re-export shared types from @dotdo/esm for backward compatibility
// =============================================================================

export type {
  StorageTier,
  ModuleInput,
} from '@dotdo/esm'

export {
  ModuleStorageSymbol,
} from '@dotdo/esm'

// =============================================================================
// Src-specific types for gitx.do integration
// These differ from core types to support git-like versioning semantics
// =============================================================================

/**
 * A stored ESM module with all four files
 *
 * This extends the core StoredModule with optional version/timestamp fields
 * for gitx.do compatibility (versions come from git commits).
 */
export interface StoredModule {
  /** Module name (e.g., "@math/add") */
  name: string
  /** TypeScript declaration file content (.d.ts) */
  types: string
  /** ESM module implementation (.mjs) */
  module: string
  /** Test file content (.test.js) */
  tests: string
  /** Script file content (.script.js) */
  script: string
  /** Version hash (set when read from storage, from git commit SHA) */
  version?: string
  /** Timestamp when the module was first created */
  createdAt?: Date
  /** Timestamp when the module was last updated */
  updatedAt?: Date
}

/**
 * Result of writing a module to storage
 *
 * Includes module name for gitx.do reference tracking.
 */
export interface WriteResult {
  /** The commit hash for this version */
  version: string
  /** The module name */
  name: string
}

/**
 * Version information from commit history
 *
 * This uses git-style versioning with parent commit tracking.
 */
export interface ModuleVersion {
  /** Version identifier (commit hash) */
  version: string
  /** Commit message */
  message: string
  /** Timestamp when version was created */
  timestamp: Date
  /** Parent commit hash (if any) */
  parent?: string
}

/**
 * GitX client interface for content-addressed storage
 *
 * This mirrors the gitx.do API for blob/tree/commit/ref operations.
 * Unique to src/ - not in core package.
 */
export interface GitxClient {
  // Blob operations
  writeBlob(content: string): Promise<string>
  readBlob(hash: string): Promise<string>

  // Tree operations
  writeTree(entries: Record<string, string>): Promise<string>
  readTree(hash: string): Promise<Record<string, string>>

  // Commit operations
  commit(treeHash: string, message: string, parent?: string): Promise<string>
  getCommit(hash: string): Promise<{
    tree: string
    parent?: string
    message: string
    timestamp: number
  }>

  // Ref operations
  updateRef(ref: string, commitHash: string): Promise<void>
  getRef(ref: string): Promise<string | null>
  listRefs(prefix?: string): Promise<Record<string, string>>
  deleteRef(ref: string): Promise<void>

  // History traversal
  log(startCommit: string, limit?: number): Promise<Array<{
    hash: string
    tree: string
    parent?: string
    message: string
    timestamp: number
  }>>
}

/**
 * Storage interface for ESM modules
 *
 * This interface is compatible with core ModuleStorage but uses
 * src-specific StoredModule and WriteResult types for gitx.do.
 */
export interface ModuleStorage {
  /**
   * Read a module from storage
   * @param name Module name (e.g., "@math/add")
   * @param version Optional version hash (defaults to latest)
   * @returns The module or null if not found
   */
  read(name: string, version?: string): Promise<StoredModule | null>

  /**
   * Write a module to storage atomically
   * @param name Module name
   * @param module Module content
   * @returns Write result with version hash
   */
  write(name: string, module: StoredModule): Promise<WriteResult>

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
   * @returns Array of version info
   */
  versions(name: string, limit?: number): Promise<ModuleVersion[]>
}

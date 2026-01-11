/**
 * ModuleStorage Interface and Types for esm.do
 *
 * This file defines the core storage interface for ESM modules,
 * supporting pluggable backends (InMemory, Gitx, Cloudflare, etc.)
 *
 * ZERO Cloudflare dependencies - platform agnostic.
 */

/**
 * Storage tier for tiered storage backends (e.g., Cloudflare)
 * - hot: Frequently accessed, low latency (KV/edge cache)
 * - warm: Moderately accessed (regional cache)
 * - cold: Rarely accessed, archived (R2/blob storage)
 */
export type StorageTier = 'hot' | 'warm' | 'cold'

/**
 * Version information for a module
 */
export interface ModuleVersion {
  version: string
  createdAt: Date
  message?: string
}

/**
 * Result of writing a module to storage
 */
export interface WriteResult {
  version: string
  created: boolean
}

/**
 * A stored module with all required fields
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
  /** Version hash (set when read from storage) */
  version: string
  /** Timestamp when the module was first created */
  createdAt: Date
  /** Timestamp when the module was last updated */
  updatedAt: Date
}

/**
 * Input for creating/updating a module (without version/timestamps)
 */
export interface ModuleInput {
  name: string
  types: string
  module: string
  tests: string
  script: string
}

/**
 * ModuleStorage interface - pluggable storage backend for ESM modules
 *
 * Implementations:
 * - InMemoryStorage: Fast in-memory storage for testing/development
 * - GitxStorage: Content-addressed git-like storage via gitx.do
 * - CloudflareStorage: Edge storage using KV, D1, and R2
 */
export interface ModuleStorage {
  /**
   * Read a module from storage
   * @param name Module name (e.g., "@math/add")
   * @param version Optional version hash (defaults to latest)
   * @returns The stored module or null if not found
   */
  read(name: string, version?: string): Promise<StoredModule | null>

  /**
   * Write a module to storage
   * @param name Module name
   * @param module Module content
   * @returns Write result with version and created flag
   */
  write(name: string, module: ModuleInput): Promise<WriteResult>

  /**
   * Delete a module from storage
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

  // Optional tier management (for tiered storage backends like Cloudflare)

  /**
   * Get the storage tier for a module (optional)
   * @param name Module name
   * @returns Current storage tier
   */
  getTier?(name: string): Promise<StorageTier>

  /**
   * Set the storage tier for a module (optional)
   * @param name Module name
   * @param tier Target storage tier
   */
  setTier?(name: string, tier: StorageTier): Promise<void>
}

// Export a runtime value so the test can import it
// This allows `const { ModuleStorage } = await import(...)` to work
export const ModuleStorage = Symbol('ModuleStorage')

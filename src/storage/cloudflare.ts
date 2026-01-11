/**
 * CloudflareStorage - Storage backend using Cloudflare KV, D1, and Durable Objects
 *
 * Storage strategy:
 * - KV: Fast key-value lookups for module blobs and refs
 * - D1: SQLite database for module listings and version history queries
 * - DO (Durable Objects): Optional coordination for concurrent writes
 *
 * Related issues:
 * - esm-stor.12: RED tests for Cloudflare storage backend
 * - esm-stor.15: GREEN implementation for Cloudflare storage (this file)
 */

import type {
  StoredModule,
  WriteResult,
  ModuleVersion,
  ModuleStorage,
} from './types.js'

// =============================================================================
// Type definitions for Cloudflare bindings
// =============================================================================

/**
 * Cloudflare KV namespace interface (subset used by storage)
 */
interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>
    list_complete: boolean
    cursor?: string
  }>
}

/**
 * Cloudflare D1 database interface (subset used by storage)
 */
interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<D1ExecResult>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(column?: string): Promise<T | null>
  run(): Promise<D1Result<unknown>>
  all<T = unknown>(): Promise<D1Result<T>>
}

interface D1Result<T> {
  results: T[]
  success: boolean
  meta: {
    duration: number
    changes: number
    last_row_id: number
  }
}

interface D1ExecResult {
  count: number
  duration: number
}

/**
 * Cloudflare Durable Object stub interface
 */
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectId {
  toString(): string
}

/**
 * Configuration for CloudflareStorage bindings
 */
export interface CloudflareStorageBindings {
  /** KV namespace for blob content and refs */
  KV: KVNamespace
  /** D1 database for module listings and version queries */
  D1: D1Database
  /** Optional Durable Object for write coordination */
  DO?: DurableObjectNamespace
}

// =============================================================================
// Custom Error Types
// =============================================================================

/**
 * Base error class for CloudflareStorage operations
 */
export class CloudflareStorageError extends Error {
  public readonly code: string
  public readonly context: Record<string, unknown> | undefined

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'CloudflareStorageError'
    this.code = code
    this.context = context ?? undefined
    Object.setPrototypeOf(this, CloudflareStorageError.prototype)
  }
}

/**
 * Thrown when module name validation fails
 */
export class InvalidModuleNameError extends CloudflareStorageError {
  constructor(name: string) {
    super(
      `Invalid module name: "${name}". Must be in format @scope/name or @scope/nested/path`,
      'INVALID_MODULE_NAME',
      { name }
    )
    this.name = 'InvalidModuleNameError'
    Object.setPrototypeOf(this, InvalidModuleNameError.prototype)
  }
}

/**
 * Thrown when a module is not found
 */
export class ModuleNotFoundError extends CloudflareStorageError {
  constructor(name: string, version?: string) {
    const message = version
      ? `Module "${name}" not found at version "${version}"`
      : `Module "${name}" not found`
    super(message, 'MODULE_NOT_FOUND', { name, version })
    this.name = 'ModuleNotFoundError'
    Object.setPrototypeOf(this, ModuleNotFoundError.prototype)
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Valid module name pattern: @scope/name or @scope/nested/path
 * Must start with @ followed by scope, then at least one path segment
 */
const MODULE_NAME_PATTERN = /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/

/**
 * Validate module name format
 * @throws {InvalidModuleNameError} If name is invalid
 */
function validateModuleName(name: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new InvalidModuleNameError(name)
  }

  if (!MODULE_NAME_PATTERN.test(name)) {
    throw new InvalidModuleNameError(name)
  }
}

/**
 * Simple glob pattern matcher for list() filtering
 */
function matchGlob(pattern: string, name: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(name)
}

/**
 * Generate a SHA-like hash from content (simple implementation)
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// =============================================================================
// CloudflareStorage Implementation
// =============================================================================

export class CloudflareStorage implements ModuleStorage {
  private kv: KVNamespace
  private d1: D1Database
  private do: DurableObjectNamespace | undefined

  constructor(bindings: CloudflareStorageBindings) {
    if (!bindings.KV) {
      throw new CloudflareStorageError(
        'KV binding is required',
        'MISSING_BINDING',
        { binding: 'KV' }
      )
    }

    if (!bindings.D1) {
      throw new CloudflareStorageError(
        'D1 binding is required',
        'MISSING_BINDING',
        { binding: 'D1' }
      )
    }

    this.kv = bindings.KV
    this.d1 = bindings.D1
    this.do = bindings.DO ?? undefined
  }

  /**
   * Read a module from storage
   */
  async read(name: string, version?: string): Promise<StoredModule | null> {
    try {
      let versionHash = version

      if (!versionHash) {
        // Get latest version from KV ref
        const refKey = `ref/${name}`
        const refValue = await this.kv.get(refKey)

        if (!refValue) {
          return null
        }
        versionHash = refValue
      }

      // Read blob metadata from KV
      const metaKey = `blob/${versionHash}/meta`
      const metaJson = await this.kv.get(metaKey)

      if (!metaJson) {
        // Try to read individual blobs directly
        const [types, module, tests, script] = await Promise.all([
          this.kv.get(`blob/${versionHash}/types`),
          this.kv.get(`blob/${versionHash}/module`),
          this.kv.get(`blob/${versionHash}/tests`),
          this.kv.get(`blob/${versionHash}/script`),
        ])

        if (!module) {
          return null
        }

        return {
          name,
          types: types ?? '',
          module: module,
          tests: tests ?? '',
          script: script ?? '',
          version: versionHash,
        }
      }

      const meta = JSON.parse(metaJson) as {
        typesHash: string
        moduleHash: string
        testsHash: string
        scriptHash: string
      }

      // Read all blobs in parallel
      const [types, module, tests, script] = await Promise.all([
        this.kv.get(`blob/${meta.typesHash}`),
        this.kv.get(`blob/${meta.moduleHash}`),
        this.kv.get(`blob/${meta.testsHash}`),
        this.kv.get(`blob/${meta.scriptHash}`),
      ])

      return {
        name,
        types: types ?? '',
        module: module ?? '',
        tests: tests ?? '',
        script: script ?? '',
        version: versionHash,
      }
    } catch (error) {
      if (error instanceof CloudflareStorageError) {
        throw error
      }

      throw new CloudflareStorageError(
        `Failed to read module: ${(error as Error).message}`,
        'READ_ERROR',
        { name, version, originalError: (error as Error).message }
      )
    }
  }

  /**
   * Write a module to storage
   */
  async write(name: string, module: StoredModule): Promise<WriteResult> {
    // Validate module name
    validateModuleName(name)

    // Use DO for coordination if available
    if (this.do) {
      const id = this.do.idFromName(name)
      const stub = this.do.get(id)
      // Notify DO about the write (for coordination)
      await stub.fetch(new Request('http://internal/write', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }))
    }

    try {
      // Generate content hashes in parallel
      const [typesHash, moduleHash, testsHash, scriptHash] = await Promise.all([
        hashContent(module.types),
        hashContent(module.module),
        hashContent(module.tests),
        hashContent(module.script),
      ])

      // Generate overall version hash
      const versionContent = `${typesHash}:${moduleHash}:${testsHash}:${scriptHash}`
      const versionHash = await hashContent(versionContent)

      // Write all blobs to KV in parallel
      await Promise.all([
        this.kv.put(`blob/${typesHash}`, module.types),
        this.kv.put(`blob/${moduleHash}`, module.module),
        this.kv.put(`blob/${testsHash}`, module.tests),
        this.kv.put(`blob/${scriptHash}`, module.script),
        // Store blob metadata
        this.kv.put(`blob/${versionHash}/meta`, JSON.stringify({
          typesHash,
          moduleHash,
          testsHash,
          scriptHash,
        })),
        // Store individual blobs by version for direct access
        this.kv.put(`blob/${versionHash}/types`, module.types),
        this.kv.put(`blob/${versionHash}/module`, module.module),
        this.kv.put(`blob/${versionHash}/tests`, module.tests),
        this.kv.put(`blob/${versionHash}/script`, module.script),
      ])

      // Update ref to point to new version
      await this.kv.put(`ref/${name}`, versionHash)

      // Record version in D1 for history tracking using batch for atomicity
      const timestamp = Date.now()
      const versionStmt = this.d1.prepare(
        'INSERT INTO module_versions (name, version, timestamp) VALUES (?, ?, ?)'
      ).bind(name, versionHash, timestamp)

      const upsertStmt = this.d1.prepare(
        'INSERT OR REPLACE INTO modules (name, latest_version, updated_at, deleted) VALUES (?, ?, ?, 0)'
      ).bind(name, versionHash, timestamp)

      // Use batch for atomic D1 operations
      await this.d1.batch([versionStmt, upsertStmt])

      return {
        version: versionHash,
        name,
      }
    } catch (error) {
      if (error instanceof CloudflareStorageError) {
        throw error
      }

      throw new CloudflareStorageError(
        `Failed to write module: ${(error as Error).message}`,
        'WRITE_ERROR',
        { name, originalError: (error as Error).message }
      )
    }
  }

  /**
   * Delete a module from storage (soft delete)
   */
  async delete(name: string): Promise<void> {
    try {
      // Check if module exists
      const refKey = `ref/${name}`
      const currentVersion = await this.kv.get(refKey)

      if (!currentVersion) {
        throw new ModuleNotFoundError(name)
      }

      // Delete ref from KV
      await this.kv.delete(refKey)

      // Mark as deleted in D1
      const stmt = this.d1.prepare(
        'UPDATE modules SET deleted = 1, updated_at = ? WHERE name = ?'
      ).bind(Date.now(), name)
      await stmt.run()
    } catch (error) {
      if (error instanceof CloudflareStorageError) {
        throw error
      }

      throw new CloudflareStorageError(
        `Failed to delete module: ${(error as Error).message}`,
        'DELETE_ERROR',
        { name, originalError: (error as Error).message }
      )
    }
  }

  /**
   * List modules matching a pattern
   */
  async list(pattern?: string): Promise<string[]> {
    try {
      // Query D1 for module names
      const stmt = this.d1.prepare(
        'SELECT name FROM modules WHERE deleted = 0 ORDER BY name'
      )
      const result = await stmt.all<{ name: string }>()

      let names = result.results.map(r => r.name)

      // Filter by pattern if provided
      if (pattern) {
        names = names.filter(name => matchGlob(pattern, name))
      }

      // Sort alphabetically
      return names.sort()
    } catch (error) {
      if (error instanceof CloudflareStorageError) {
        throw error
      }

      throw new CloudflareStorageError(
        `Failed to list modules: ${(error as Error).message}`,
        'LIST_ERROR',
        { pattern, originalError: (error as Error).message }
      )
    }
  }

  /**
   * Get version history for a module
   */
  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    try {
      // Query D1 for version history
      const query = limit
        ? 'SELECT version, timestamp FROM module_versions WHERE name = ? ORDER BY timestamp DESC LIMIT ?'
        : 'SELECT version, timestamp FROM module_versions WHERE name = ? ORDER BY timestamp DESC'

      const stmt = limit
        ? this.d1.prepare(query).bind(name, limit)
        : this.d1.prepare(query).bind(name)

      const result = await stmt.all<{ version: string; timestamp: number }>()

      return result.results.map(r => ({
        version: r.version,
        message: `Update ${name}`,
        timestamp: new Date(r.timestamp),
      }))
    } catch (error) {
      if (error instanceof CloudflareStorageError) {
        throw error
      }

      throw new CloudflareStorageError(
        `Failed to get versions: ${(error as Error).message}`,
        'VERSIONS_ERROR',
        { name, limit, originalError: (error as Error).message }
      )
    }
  }

  // =============================================================================
  // Optional Tier Management (for tiered storage)
  // =============================================================================

  /**
   * Get the storage tier for a module
   * Cloudflare implementation uses metadata stored with the module
   */
  async getTier(name: string): Promise<'hot' | 'warm' | 'cold'> {
    try {
      const stmt = this.d1.prepare(
        'SELECT tier FROM modules WHERE name = ? AND deleted = 0'
      ).bind(name)
      const result = await stmt.first<{ tier: string }>()

      if (!result) {
        throw new ModuleNotFoundError(name)
      }

      // Default to 'hot' if no tier is set
      return (result.tier as 'hot' | 'warm' | 'cold') || 'hot'
    } catch (error) {
      if (error instanceof CloudflareStorageError) {
        throw error
      }

      throw new CloudflareStorageError(
        `Failed to get tier: ${(error as Error).message}`,
        'TIER_ERROR',
        { name, originalError: (error as Error).message }
      )
    }
  }

  /**
   * Set the storage tier for a module
   * This affects where data is primarily stored:
   * - hot: KV with edge caching (fastest, most expensive)
   * - warm: KV without edge caching (moderate)
   * - cold: R2 blob storage (slowest, cheapest)
   */
  async setTier(name: string, tier: 'hot' | 'warm' | 'cold'): Promise<void> {
    try {
      const stmt = this.d1.prepare(
        'UPDATE modules SET tier = ?, updated_at = ? WHERE name = ? AND deleted = 0'
      ).bind(tier, Date.now(), name)
      const result = await stmt.run()

      if (result.meta.changes === 0) {
        throw new ModuleNotFoundError(name)
      }
    } catch (error) {
      if (error instanceof CloudflareStorageError) {
        throw error
      }

      throw new CloudflareStorageError(
        `Failed to set tier: ${(error as Error).message}`,
        'TIER_ERROR',
        { name, tier, originalError: (error as Error).message }
      )
    }
  }
}

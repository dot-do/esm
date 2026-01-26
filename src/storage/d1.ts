/**
 * D1Storage - SQLite-based storage backend for ESM modules
 *
 * Uses Cloudflare D1 (SQLite) for persistent module storage.
 * Unlike CloudflareStorage (KV+D1), this stores everything in D1
 * for simpler deployment and consistent transactional behavior.
 *
 * Features:
 * - Persistent storage (survives restarts)
 * - Full version history with content
 * - Transactional writes using D1 batch
 * - Pattern matching for module listing
 * - Automatic schema migration
 */

import type {
  StoredModule,
  WriteResult,
  ModuleVersion,
  ModuleStorage,
} from './types.js'

// =============================================================================
// Type definitions for Cloudflare D1
// =============================================================================

/**
 * Cloudflare D1 database interface (subset used by storage)
 */
export interface D1Database {
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

// =============================================================================
// Schema
// =============================================================================

/**
 * SQL schema for D1 module storage
 */
export const D1_SCHEMA = `
-- Main modules table with current version data
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  types TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  tests TEXT NOT NULL DEFAULT '',
  script TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  UNIQUE(name, version)
);

-- Index for fast lookups by name
CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(name);

-- Index for listing non-deleted modules
CREATE INDEX IF NOT EXISTS idx_modules_deleted ON modules(deleted);

-- Module versions table for history tracking
CREATE TABLE IF NOT EXISTS module_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  types TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  tests TEXT NOT NULL DEFAULT '',
  script TEXT NOT NULL DEFAULT '',
  message TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(name, version)
);

-- Index for version history queries
CREATE INDEX IF NOT EXISTS idx_module_versions_name ON module_versions(name);
CREATE INDEX IF NOT EXISTS idx_module_versions_created ON module_versions(name, created_at DESC);
`

// =============================================================================
// Custom Error Types
// =============================================================================

/**
 * Base error class for D1Storage operations
 */
export class D1StorageError extends Error {
  public readonly code: string
  public readonly context: Record<string, unknown> | undefined

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'D1StorageError'
    this.code = code
    this.context = context ?? undefined
    Object.setPrototypeOf(this, D1StorageError.prototype)
  }
}

/**
 * Thrown when module name validation fails
 */
export class InvalidModuleNameError extends D1StorageError {
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
export class ModuleNotFoundError extends D1StorageError {
  constructor(name: string, version?: string | number) {
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
 * Generate a unique module ID from name and version
 */
function generateModuleId(name: string, version: number): string {
  return `${name}@${version}`
}

// =============================================================================
// D1Storage Implementation
// =============================================================================

/**
 * D1Storage - SQLite-based persistent storage for ESM modules
 *
 * Implements the ModuleStorage interface using Cloudflare D1.
 */
export class D1Storage implements ModuleStorage {
  private d1: D1Database
  private initialized = false

  constructor(d1: D1Database) {
    if (!d1) {
      throw new D1StorageError(
        'D1 database binding is required',
        'MISSING_BINDING',
        { binding: 'D1' }
      )
    }

    this.d1 = d1
  }

  /**
   * Initialize the database schema (create tables if not exist)
   * Called automatically on first operation, but can be called explicitly
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      await this.d1.exec(D1_SCHEMA)
      this.initialized = true
    } catch (error) {
      throw new D1StorageError(
        `Failed to initialize database: ${(error as Error).message}`,
        'INIT_ERROR',
        { originalError: (error as Error).message }
      )
    }
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * Read a module from storage
   * @param name Module name (e.g., "@math/add")
   * @param version Optional version number (defaults to latest)
   * @returns The stored module or null if not found
   */
  async read(name: string, version?: string): Promise<StoredModule | null> {
    await this.ensureInitialized()

    try {
      let row: ModuleRow | null

      if (version) {
        // Read specific version from module_versions table
        const versionNum = parseInt(version, 10)
        if (isNaN(versionNum)) {
          // Try to find by version as string (could be a hash in other implementations)
          return null
        }

        const stmt = this.d1.prepare(
          `SELECT name, version, types, code, tests, script, created_at
           FROM module_versions
           WHERE name = ? AND version = ?`
        ).bind(name, versionNum)

        row = await stmt.first<ModuleRow>()
      } else {
        // Read latest non-deleted version from modules table
        const stmt = this.d1.prepare(
          `SELECT name, version, types, code, tests, script, created_at, updated_at
           FROM modules
           WHERE name = ? AND deleted = 0
           ORDER BY version DESC
           LIMIT 1`
        ).bind(name)

        row = await stmt.first<ModuleRow>()
      }

      if (!row) {
        return null
      }

      const result: StoredModule = {
        name: row.name,
        types: row.types,
        module: row.code,
        tests: row.tests,
        script: row.script,
        version: String(row.version),
        createdAt: new Date(row.created_at),
      }
      if (row.updated_at) {
        result.updatedAt = new Date(row.updated_at)
      }
      return result
    } catch (error) {
      if (error instanceof D1StorageError) {
        throw error
      }

      throw new D1StorageError(
        `Failed to read module: ${(error as Error).message}`,
        'READ_ERROR',
        { name, version, originalError: (error as Error).message }
      )
    }
  }

  /**
   * Write a module to storage
   * Creates a new version and updates the latest pointer
   * @param name Module name
   * @param module Module content
   * @returns Write result with version number
   */
  async write(name: string, module: StoredModule): Promise<WriteResult> {
    await this.ensureInitialized()

    // Validate module name
    validateModuleName(name)

    try {
      const now = new Date().toISOString()

      // Get the current latest version (if any)
      const existingStmt = this.d1.prepare(
        `SELECT version FROM modules WHERE name = ? AND deleted = 0 ORDER BY version DESC LIMIT 1`
      ).bind(name)
      const existing = await existingStmt.first<{ version: number }>()

      const newVersion = existing ? existing.version + 1 : 1
      const moduleId = generateModuleId(name, newVersion)

      // Prepare batch statements for atomic write
      const statements: D1PreparedStatement[] = []

      // Insert into module_versions for history
      statements.push(
        this.d1.prepare(
          `INSERT INTO module_versions (name, version, types, code, tests, script, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          name,
          newVersion,
          module.types,
          module.module,
          module.tests,
          module.script,
          `Update ${name}`,
          now
        )
      )

      // Upsert into modules table (latest version)
      statements.push(
        this.d1.prepare(
          `INSERT INTO modules (id, name, version, types, code, tests, script, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT(name, version) DO UPDATE SET
             types = excluded.types,
             code = excluded.code,
             tests = excluded.tests,
             script = excluded.script,
             updated_at = excluded.updated_at`
        ).bind(
          moduleId,
          name,
          newVersion,
          module.types,
          module.module,
          module.tests,
          module.script,
          existing ? now : now, // created_at
          now // updated_at
        )
      )

      // Execute batch atomically
      await this.d1.batch(statements)

      return {
        version: String(newVersion),
        name,
      }
    } catch (error) {
      if (error instanceof D1StorageError) {
        throw error
      }

      throw new D1StorageError(
        `Failed to write module: ${(error as Error).message}`,
        'WRITE_ERROR',
        { name, originalError: (error as Error).message }
      )
    }
  }

  /**
   * Delete a module from storage (soft delete)
   * Preserves version history but marks module as deleted
   * @param name Module name
   */
  async delete(name: string): Promise<void> {
    await this.ensureInitialized()

    try {
      // Check if module exists
      const existingStmt = this.d1.prepare(
        `SELECT id FROM modules WHERE name = ? AND deleted = 0 LIMIT 1`
      ).bind(name)
      const existing = await existingStmt.first<{ id: string }>()

      if (!existing) {
        throw new ModuleNotFoundError(name)
      }

      // Mark all versions as deleted
      const stmt = this.d1.prepare(
        `UPDATE modules SET deleted = 1, updated_at = ? WHERE name = ?`
      ).bind(new Date().toISOString(), name)

      await stmt.run()
    } catch (error) {
      if (error instanceof D1StorageError) {
        throw error
      }

      throw new D1StorageError(
        `Failed to delete module: ${(error as Error).message}`,
        'DELETE_ERROR',
        { name, originalError: (error as Error).message }
      )
    }
  }

  /**
   * List modules matching a pattern
   * @param pattern Optional glob pattern (e.g., "@math/*")
   * @returns Array of module names sorted alphabetically
   */
  async list(pattern?: string): Promise<string[]> {
    await this.ensureInitialized()

    try {
      // Query for distinct non-deleted module names
      const stmt = this.d1.prepare(
        `SELECT DISTINCT name FROM modules WHERE deleted = 0 ORDER BY name`
      )
      const result = await stmt.all<{ name: string }>()

      let names = result.results.map(r => r.name)

      // Filter by pattern if provided
      if (pattern) {
        names = names.filter(name => matchGlob(pattern, name))
      }

      return names.sort()
    } catch (error) {
      if (error instanceof D1StorageError) {
        throw error
      }

      throw new D1StorageError(
        `Failed to list modules: ${(error as Error).message}`,
        'LIST_ERROR',
        { pattern, originalError: (error as Error).message }
      )
    }
  }

  /**
   * Get version history for a module
   * @param name Module name
   * @param limit Maximum number of versions to return
   * @returns Array of version info in reverse chronological order
   */
  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    await this.ensureInitialized()

    try {
      const query = limit
        ? `SELECT version, message, created_at
           FROM module_versions
           WHERE name = ?
           ORDER BY version DESC
           LIMIT ?`
        : `SELECT version, message, created_at
           FROM module_versions
           WHERE name = ?
           ORDER BY version DESC`

      const stmt = limit
        ? this.d1.prepare(query).bind(name, limit)
        : this.d1.prepare(query).bind(name)

      const result = await stmt.all<{
        version: number
        message: string | null
        created_at: string
      }>()

      return result.results.map(r => ({
        version: String(r.version),
        message: r.message || `Version ${r.version}`,
        timestamp: new Date(r.created_at),
      }))
    } catch (error) {
      if (error instanceof D1StorageError) {
        throw error
      }

      throw new D1StorageError(
        `Failed to get versions: ${(error as Error).message}`,
        'VERSIONS_ERROR',
        { name, limit, originalError: (error as Error).message }
      )
    }
  }
}

// =============================================================================
// Internal Types
// =============================================================================

interface ModuleRow {
  name: string
  version: number
  types: string
  code: string
  tests: string
  script: string
  created_at: string
  updated_at?: string
}

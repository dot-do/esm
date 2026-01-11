/**
 * GitxStorage - Content-addressed storage for ESM modules via gitx.do
 *
 * Uses git primitives for storage:
 * - Blobs for file content (types, module, tests, script)
 * - Trees for module structure
 * - Commits for versions with SHA hash
 * - Refs for latest version pointers
 *
 * Related issues:
 * - esm-xv9: GitxStorage.read() implementation
 * - esm-55y: GitxStorage.write() implementation
 * - esm-n31: GitxStorage.list/delete/versions implementation
 */

import type {
  GitxClient,
  StoredModule,
  WriteResult,
  ModuleVersion,
  ModuleStorage,
} from './types.js'

/**
 * Valid module name pattern: @scope/name or @scope/nested/path
 * Must start with @ followed by scope, then at least one path segment
 */
const MODULE_NAME_PATTERN = /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/

// =============================================================================
// Custom Error Types
// =============================================================================

/**
 * Base error class for GitxStorage operations
 */
export class GitxStorageError extends Error {
  public readonly code: string
  public readonly context: Record<string, unknown> | undefined

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'GitxStorageError'
    this.code = code
    this.context = context ?? undefined
    Object.setPrototypeOf(this, GitxStorageError.prototype)
  }
}

/**
 * Thrown when module name validation fails
 */
export class InvalidModuleNameError extends GitxStorageError {
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
 * Thrown when a module is not found during read
 */
export class ModuleNotFoundError extends GitxStorageError {
  constructor(name: string, version?: string) {
    const message = version
      ? `Module "${name}" not found at version "${version}"`
      : `Module "${name}" not found`
    super(message, 'MODULE_NOT_FOUND', { name, version })
    this.name = 'ModuleNotFoundError'
    Object.setPrototypeOf(this, ModuleNotFoundError.prototype)
  }
}

/**
 * Thrown when module content is invalid or incomplete
 */
export class InvalidModuleContentError extends GitxStorageError {
  constructor(name: string, reason: string) {
    super(
      `Invalid module content for "${name}": ${reason}`,
      'INVALID_MODULE_CONTENT',
      { name, reason }
    )
    this.name = 'InvalidModuleContentError'
    Object.setPrototypeOf(this, InvalidModuleContentError.prototype)
  }
}

/**
 * Thrown when gitx client operations fail
 */
export class GitxClientError extends GitxStorageError {
  constructor(operation: string, originalError: Error) {
    super(
      `Gitx client error during ${operation}: ${originalError.message}`,
      'GITX_CLIENT_ERROR',
      { operation, originalMessage: originalError.message }
    )
    this.name = 'GitxClientError'
    Object.setPrototypeOf(this, GitxClientError.prototype)
  }
}

// =============================================================================
// Logging/Tracing Hooks
// =============================================================================

type TraceLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Tracing hook interface for monitoring storage operations
 */
export interface StorageTraceHook {
  trace(level: TraceLevel, message: string, context?: Record<string, unknown>): void
}

/**
 * Default no-op trace hook
 */
const DEFAULT_TRACE_HOOK: StorageTraceHook = {
  trace: () => {
    // No-op
  },
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert module name to ref path
 * e.g., "@math/add" -> "refs/modules/@math/add"
 */
function moduleToRef(name: string): string {
  return `refs/modules/${name}`
}

/**
 * Convert ref path back to module name
 * e.g., "refs/modules/@math/add" -> "@math/add"
 */
function refToModule(ref: string): string {
  return ref.replace('refs/modules/', '')
}

/**
 * Simple glob pattern matcher
 * Supports * for single segment and ** for multiple segments
 */
function matchGlob(pattern: string, name: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*\*/g, '{{DOUBLE_STAR}}') // Temporarily replace **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*') // ** matches anything including /

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(name)
}

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
 * Validate module content completeness
 * @throws {InvalidModuleContentError} If content is invalid
 */
function validateModuleContent(module: StoredModule): void {
  if (!module || typeof module !== 'object') {
    throw new InvalidModuleContentError(
      (module as StoredModule | null)?.name || 'unknown',
      'Module must be an object'
    )
  }

  // Validate required fields exist and are strings
  if (typeof module.types !== 'string') {
    throw new InvalidModuleContentError(
      module.name || 'unknown',
      'types must be a non-null string'
    )
  }

  if (typeof module.module !== 'string') {
    throw new InvalidModuleContentError(
      module.name || 'unknown',
      'module must be a non-null string'
    )
  }

  if (typeof module.tests !== 'string') {
    throw new InvalidModuleContentError(
      module.name || 'unknown',
      'tests must be a non-null string (can be empty)'
    )
  }

  if (typeof module.script !== 'string') {
    throw new InvalidModuleContentError(
      module.name || 'unknown',
      'script must be a non-null string (can be empty)'
    )
  }
}

export class GitxStorage implements ModuleStorage {
  private client: GitxClient
  private trace: StorageTraceHook['trace']

  constructor(client: GitxClient, traceHook: StorageTraceHook = DEFAULT_TRACE_HOOK) {
    this.client = client
    this.trace = traceHook.trace.bind(traceHook)
  }

  /**
   * Read a module from storage
   * @param name Module name (e.g., "@math/add")
   * @param version Optional version hash (defaults to latest)
   * @returns The module or null if not found
   * @throws {ModuleNotFoundError} If version is specified but not found
   * @throws {GitxClientError} If gitx client operations fail
   */
  async read(name: string, version?: string): Promise<StoredModule | null> {
    this.trace('debug', 'read: starting', { name, version })

    let commitHash: string

    try {
      if (version) {
        // Use specific version
        this.trace('debug', 'read: using specific version', { name, version })
        commitHash = version
      } else {
        // Get latest version from ref
        this.trace('debug', 'read: fetching latest version', { name })
        const ref = moduleToRef(name)
        const latestHash = await this.client.getRef(ref)

        if (!latestHash) {
          // Module doesn't exist - return null (not an error)
          this.trace('info', 'read: module not found (returns null)', { name })
          return null
        }

        commitHash = latestHash
        this.trace('debug', 'read: found latest version', { name, version: commitHash })
      }

      // If we have a commit hash, any error from here is a real error that should throw
      this.trace('debug', 'read: fetching commit', { name, commitHash })
      const commit = await this.client.getCommit(commitHash)

      this.trace('debug', 'read: reading tree', { name, treeHash: commit.tree })
      const tree = await this.client.readTree(commit.tree)

      // Validate tree structure has all required files
      const requiredFiles = ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js']
      const missingFiles = requiredFiles.filter(file => !tree[file])

      if (missingFiles.length > 0) {
        this.trace('error', 'read: missing files in tree', { name, missingFiles })
        throw new InvalidModuleContentError(
          name,
          `Missing required files: ${missingFiles.join(', ')}`
        )
      }

      // Read all blob contents in parallel
      this.trace('debug', 'read: reading blobs', { name })
      const typesHash = tree['index.d.ts']
      const moduleHash = tree['index.mjs']
      const testsHash = tree['index.test.js']
      const scriptHash = tree['index.script.js']
      if (!typesHash || !moduleHash || !testsHash || !scriptHash) {
        throw new InvalidModuleContentError(
          name,
          'Missing required file hashes in tree'
        )
      }
      const [types, module, tests, script] = await Promise.all([
        this.client.readBlob(typesHash),
        this.client.readBlob(moduleHash),
        this.client.readBlob(testsHash),
        this.client.readBlob(scriptHash),
      ])

      const result: StoredModule = {
        name,
        types,
        module,
        tests,
        script,
        version: commitHash,
      }

      this.trace('info', 'read: completed successfully', { name, version: commitHash })
      return result
    } catch (error) {
      if (error instanceof GitxStorageError) {
        throw error
      }

      if (version) {
        // If specific version was requested and not found
        if (error instanceof Error && error.message.includes('not found')) {
          const err = new ModuleNotFoundError(name, version)
          this.trace('warn', 'read: module version not found', { name, version })
          throw err
        }

        // Wrap other gitx client errors
        const err = new GitxClientError('read', error as Error)
        this.trace('error', 'read: gitx client error', {
          name,
          version,
          error: (error as Error).message,
        })
        throw err
      }

      // Re-throw non-storage errors for latest version reads
      if (error instanceof Error) {
        const err = new GitxClientError('read', error)
        this.trace('error', 'read: gitx client error', { name, error: error.message })
        throw err
      }

      throw error
    }
  }

  /**
   * Write a module to storage atomically
   * @param name Module name
   * @param data Module content
   * @returns Write result with version hash
   * @throws {InvalidModuleNameError} If module name is invalid
   * @throws {InvalidModuleContentError} If module content is invalid
   * @throws {GitxClientError} If gitx client operations fail
   */
  async write(name: string, data: StoredModule): Promise<WriteResult> {
    this.trace('debug', 'write: starting', { name })

    try {
      // Validate module name
      validateModuleName(name)
      this.trace('debug', 'write: name validated', { name })

      // Validate module content
      validateModuleContent(data)
      this.trace('debug', 'write: content validated', { name })

      // Write all blobs in parallel
      this.trace('debug', 'write: writing blobs', { name })
      const [typesHash, moduleHash, testsHash, scriptHash] = await Promise.all([
        this.client.writeBlob(data.types),
        this.client.writeBlob(data.module),
        this.client.writeBlob(data.tests),
        this.client.writeBlob(data.script),
      ])

      this.trace('debug', 'write: blobs written', { name })

      // Create tree with all four files
      this.trace('debug', 'write: creating tree', { name })
      const treeHash = await this.client.writeTree({
        'index.d.ts': typesHash,
        'index.mjs': moduleHash,
        'index.test.js': testsHash,
        'index.script.js': scriptHash,
      })

      this.trace('debug', 'write: tree created', { name, treeHash })

      // Get current HEAD for this module (if any) to use as parent
      const ref = moduleToRef(name)
      const parentHash = await this.client.getRef(ref)

      if (parentHash) {
        this.trace('debug', 'write: found parent commit', { name, parentHash })
      } else {
        this.trace('debug', 'write: first version (no parent)', { name })
      }

      // Create commit with descriptive message
      const message = `Update ${name}`
      this.trace('debug', 'write: creating commit', { name })
      const commitHash = await this.client.commit(
        treeHash,
        message,
        parentHash ?? undefined
      )

      this.trace('debug', 'write: commit created', { name, commitHash })

      // Update ref to point to new commit
      this.trace('debug', 'write: updating ref', { name, commitHash })
      await this.client.updateRef(ref, commitHash)

      this.trace('info', 'write: completed successfully', { name, version: commitHash })

      return {
        version: commitHash,
        name,
      }
    } catch (error) {
      if (error instanceof GitxStorageError) {
        this.trace('error', 'write: storage error', { name, error: error.message })
        throw error
      }

      const err = new GitxClientError('write', error as Error)
      this.trace('error', 'write: gitx client error', {
        name,
        error: (error as Error).message,
      })
      throw err
    }
  }

  /**
   * Delete a module from storage (soft delete)
   * Removes the ref but preserves version history
   * @param name Module name
   * @throws {ModuleNotFoundError} If module doesn't exist
   * @throws {GitxClientError} If gitx client operations fail
   */
  async delete(name: string): Promise<void> {
    this.trace('debug', 'delete: starting', { name })

    try {
      const ref = moduleToRef(name)
      const exists = await this.client.getRef(ref)

      if (!exists) {
        this.trace('warn', 'delete: module not found', { name })
        throw new ModuleNotFoundError(name)
      }

      this.trace('debug', 'delete: removing ref', { name })
      await this.client.deleteRef(ref)

      this.trace('info', 'delete: completed successfully', { name })
    } catch (error) {
      if (error instanceof GitxStorageError) {
        throw error
      }

      const err = new GitxClientError('delete', error as Error)
      this.trace('error', 'delete: gitx client error', {
        name,
        error: (error as Error).message,
      })
      throw err
    }
  }

  /**
   * List modules matching a pattern
   * @param pattern Optional glob pattern (e.g., "@math/*")
   * @returns Array of module names sorted alphabetically (empty array if none found)
   * @throws {GitxClientError} If gitx client operations fail
   */
  async list(pattern?: string): Promise<string[]> {
    this.trace('debug', 'list: starting', { pattern })

    try {
      const refs = await this.client.listRefs('refs/modules/')

      this.trace('debug', 'list: refs retrieved', {
        pattern,
        count: Object.keys(refs).length,
      })

      // Convert refs to module names
      const moduleNames = Object.keys(refs).map(refToModule)

      // Filter by pattern if provided
      const filtered = pattern
        ? moduleNames.filter((name) => matchGlob(pattern, name))
        : moduleNames

      // Sort alphabetically
      const result = filtered.sort()

      this.trace('info', 'list: completed successfully', {
        pattern,
        count: result.length,
      })

      return result
    } catch (error) {
      const err = new GitxClientError('list', error as Error)
      this.trace('error', 'list: gitx client error', {
        pattern,
        error: (error as Error).message,
      })
      throw err
    }
  }

  /**
   * Get version history for a module
   * @param name Module name
   * @param limit Maximum number of versions to return
   * @returns Array of version info in reverse chronological order (empty if module not found)
   * @throws {GitxClientError} If gitx client operations fail
   */
  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    this.trace('debug', 'versions: starting', { name, limit })

    try {
      const ref = moduleToRef(name)
      const headHash = await this.client.getRef(ref)

      if (!headHash) {
        this.trace('info', 'versions: module not found (returns empty)', { name })
        return []
      }

      // Use git log to traverse history
      this.trace('debug', 'versions: fetching history', { name, headHash })
      const history = await this.client.log(headHash, limit)

      const result: ModuleVersion[] = history.map((commit) => {
        const entry: ModuleVersion = {
          version: commit.hash,
          message: commit.message,
          timestamp: new Date(commit.timestamp),
        }
        if (commit.parent) entry.parent = commit.parent
        return entry
      })

      this.trace('info', 'versions: completed successfully', {
        name,
        count: result.length,
        limit,
      })

      return result
    } catch (error) {
      const err = new GitxClientError('versions', error as Error)
      this.trace('error', 'versions: gitx client error', {
        name,
        limit,
        error: (error as Error).message,
      })
      throw err
    }
  }
}

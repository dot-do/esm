/**
 * ESM - Core class for esm.do module management
 *
 * This class provides the core functionality for managing ESM modules,
 * including reading, writing, running, and testing.
 */

import type { StoredModule, ModuleVersion, ModuleStorage, WriteResult as StorageWriteResult } from './storage/types.js'
import * as crypto from 'node:crypto'
import { SandboxExecutor } from './executor/sandbox.js'
import { sanitizeTypeDefinitions } from './executor/sanitize.js'

/**
 * Options for writing a module
 */
export interface WriteOptions {
  name: string
  types: string
  module: string
  tests?: string
  script?: string
}

/**
 * Result of writing a module
 */
export interface WriteResult {
  name: string
  version: string
  testResults?: TestResult
  value?: unknown
}

/**
 * Result of reading a module
 */
export interface ReadResult {
  name: string
  types: string
  module: string
  tests?: string
  script?: string
  version: string
}

/**
 * Result of running a module
 */
export interface RunResult {
  value: unknown
  logs: string
}

/**
 * Result of a single test
 */
export interface SingleTestResult {
  name: string
  status: 'passed' | 'failed'
  error?: string
}

/**
 * Result of testing a module
 */
export interface TestResult {
  passed: number
  failed: number
  total: number
  results: SingleTestResult[]
  failures?: Array<{ name: string; error: string }>
  duration: number
}

/**
 * Result of deleting a module
 */
export interface DeleteResult {
  deleted: boolean
  name: string
}

/**
 * In-memory storage for ESM modules
 */
class InMemoryStorage implements ModuleStorage {
  private modules: Map<string, { current: StoredModule; versions: Map<string, StoredModule>; history: ModuleVersion[] }> = new Map()

  async read(name: string, version?: string): Promise<StoredModule | null> {
    const entry = this.modules.get(name)
    if (!entry) return null

    if (version) {
      const versionedModule = entry.versions.get(version)
      return versionedModule || null
    }

    return entry.current
  }

  async write(name: string, module: StoredModule): Promise<StorageWriteResult> {
    // Generate content-based hash
    const content = JSON.stringify({
      types: module.types,
      module: module.module,
      tests: module.tests || '',
      script: module.script || '',
    })
    const version = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12)

    const storedModule: StoredModule = { ...module, version }

    let entry = this.modules.get(name)
    if (!entry) {
      entry = { current: storedModule, versions: new Map(), history: [] }
      this.modules.set(name, entry)
    }

    entry.current = storedModule
    entry.versions.set(version, storedModule)
    entry.history.unshift({
      hash: version,
      message: 'Module updated',
      timestamp: Date.now(),
    })

    return { version, name }
  }

  async delete(name: string): Promise<void> {
    this.modules.delete(name)
  }

  async list(pattern?: string): Promise<string[]> {
    const names = Array.from(this.modules.keys())
    if (!pattern) return names

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    const regex = new RegExp(`^${regexPattern}$`)
    return names.filter(name => regex.test(name))
  }

  async versions(name: string, limit = 10): Promise<ModuleVersion[]> {
    const entry = this.modules.get(name)
    if (!entry) return []
    return entry.history.slice(0, limit)
  }
}

/**
 * Options for creating ESM instance
 */
export interface ESMOptions {
  storage?: ModuleStorage
  enableCaching?: boolean
  cacheSize?: number
  validateOnWrite?: boolean
}

/**
 * ESM class for managing modules
 */
export class ESM {
  private storage: ModuleStorage
  // Storage for module resolution (for imports)
  private moduleCache: Map<string, Record<string, unknown>> = new Map()
  private options: Required<ESMOptions>
  private sandbox: SandboxExecutor

  /**
   * Create a new ESM instance with configuration
   * @param options Configuration options for the ESM instance
   * @returns A new ESM instance
   */
  static create(options?: ESMOptions): ESM {
    return new ESM(options)
  }

  /**
   * Create a new ESM instance with custom storage
   * @param storage Custom storage implementation
   * @returns A new ESM instance with the custom storage
   */
  static withStorage(storage: ModuleStorage): ESM {
    return new ESM({ storage })
  }

  constructor(options?: ESMOptions | ModuleStorage) {
    let resolvedOptions: ESMOptions

    // Support both legacy usage (ModuleStorage) and new options
    if (options && 'read' in options && typeof options.read === 'function') {
      resolvedOptions = { storage: options }
    } else {
      resolvedOptions = options as ESMOptions | undefined || {}
    }

    // Validate options
    this.validateOptions(resolvedOptions)

    // Set storage
    this.storage = resolvedOptions.storage || new InMemoryStorage()

    // Set default options
    this.options = {
      storage: this.storage,
      enableCaching: resolvedOptions.enableCaching ?? true,
      cacheSize: resolvedOptions.cacheSize ?? 1000,
      validateOnWrite: resolvedOptions.validateOnWrite ?? true,
    }

    // Initialize sandbox executor for safe code execution
    this.sandbox = new SandboxExecutor()
  }

  /**
   * Validate configuration options
   */
  private validateOptions(options: ESMOptions): void {
    if (options.cacheSize !== undefined) {
      if (!Number.isInteger(options.cacheSize) || options.cacheSize < 1) {
        throw new Error('cacheSize must be a positive integer')
      }
    }

    if (options.storage !== undefined) {
      if (
        typeof options.storage.read !== 'function' ||
        typeof options.storage.write !== 'function' ||
        typeof options.storage.delete !== 'function' ||
        typeof options.storage.list !== 'function' ||
        typeof options.storage.versions !== 'function'
      ) {
        throw new Error('Invalid storage implementation: must implement ModuleStorage interface')
      }
    }
  }

  /**
   * Add a module to cache, respecting cache size limits
   */
  private addToCache(name: string, exports: Record<string, unknown>): void {
    if (!this.options.enableCaching) {
      return
    }

    // If cache is full, remove oldest entry (simple FIFO)
    if (this.moduleCache.size >= this.options.cacheSize) {
      const firstKey = this.moduleCache.keys().next().value
      if (firstKey) {
        this.moduleCache.delete(firstKey)
      }
    }

    this.moduleCache.set(name, exports)
  }

  /**
   * Validate that a module name has the correct @scope/name format
   * Aligns with GitxStorage's MODULE_NAME_PATTERN: /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/
   * Only allows alphanumeric characters and hyphens in path segments
   */
  private validateName(name: string): void {
    if (!name) {
      throw new Error('Module name is required')
    }

    // Use pattern aligned with GitxStorage MODULE_NAME_PATTERN
    // Format: @scope/name or @scope/nested/path/name
    // Only alphanumeric chars and hyphens allowed in each segment
    const MODULE_NAME_PATTERN = /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/

    if (!MODULE_NAME_PATTERN.test(name)) {
      // Provide helpful error messages for common issues
      if (!name.startsWith('@')) {
        throw new Error('Module name must include scope (e.g., @scope/name)')
      }
      if (name.includes('..')) {
        throw new Error('Module name cannot contain path traversal (..) patterns')
      }
      if (name.includes('//')) {
        throw new Error('Module name cannot contain empty path segments (//)')
      }
      if (name.endsWith('/')) {
        throw new Error('Module name cannot end with a trailing slash')
      }
      if (/[._@\s]/.test(name.slice(1))) {
        throw new Error('Module name can only contain alphanumeric characters and hyphens in path segments')
      }
      // Generic fallback
      throw new Error('Module name must be in format @scope/name with alphanumeric characters and hyphens only')
    }
  }

  /**
   * Validate TypeScript type definitions
   */
  private validateTypes(types: string): void {
    // Check for obviously invalid types
    const invalidTypePattern = /:\s*invalid_type\b/
    if (invalidTypePattern.test(types)) {
      throw new Error('Invalid type definition: unknown type "invalid_type"')
    }

    // Check for basic syntax issues
    const braceCount = (types.match(/{/g) || []).length
    const closeBraceCount = (types.match(/}/g) || []).length
    if (braceCount !== closeBraceCount) {
      throw new Error('Invalid type definition: mismatched braces')
    }
  }

  /**
   * Execute module code and return the exports using SandboxExecutor
   */
  private async executeModuleSandboxed(moduleCode: string): Promise<Record<string, unknown>> {
    // Use SandboxExecutor.run to execute the module and extract exports
    // The sandbox extracts exports automatically based on export statements
    const exportNames = this.extractExportNames(moduleCode)

    // Build a script that returns all exports as an object
    const returnScript = exportNames.length > 0
      ? `return { ${exportNames.join(', ')} }`
      : 'return {}'

    const result = await this.sandbox.run(moduleCode, returnScript)

    if (!result.success) {
      throw new Error(result.error || 'Module execution failed')
    }

    return (result.value as Record<string, unknown>) || {}
  }

  /**
   * Extract export names from module code
   */
  private extractExportNames(moduleCode: string): string[] {
    const names: string[] = []

    // Match export function name
    const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g
    let match
    while ((match = funcRegex.exec(moduleCode)) !== null) {
      names.push(match[1])
    }

    // Match export const name
    const constRegex = /export\s+const\s+(\w+)/g
    while ((match = constRegex.exec(moduleCode)) !== null) {
      names.push(match[1])
    }

    // Match export let name
    const letRegex = /export\s+let\s+(\w+)/g
    while ((match = letRegex.exec(moduleCode)) !== null) {
      names.push(match[1])
    }

    return names
  }

  /**
   * Execute tests and return results using SandboxExecutor
   */
  private async executeTests(moduleCode: string, testsCode: string, _resolveModule?: (name: string) => Record<string, unknown>): Promise<TestResult> {
    // Use SandboxExecutor.test for safe test execution
    const sandboxResult = await this.sandbox.test(moduleCode, testsCode)

    // Convert SandboxExecutor test results to ESM TestResult format
    const results: SingleTestResult[] = sandboxResult.tests.map(t => ({
      name: t.name,
      status: t.status === 'skipped' ? 'failed' : t.status,
      error: t.error,
    }))

    const failures = results
      .filter(r => r.status === 'failed' && r.error)
      .map(r => ({ name: r.name, error: r.error! }))

    return {
      passed: sandboxResult.passed,
      failed: sandboxResult.failed,
      total: sandboxResult.total,
      results,
      failures: failures.length > 0 ? failures : undefined,
      duration: sandboxResult.duration,
    }
  }

  /**
   * Execute a script in the context of module exports using SandboxExecutor
   */
  private async executeScriptSandboxed(
    moduleCode: string,
    script: string,
    args?: Record<string, unknown>
  ): Promise<{ value: unknown; logs: string }> {
    // Use SandboxExecutor.run for safe script execution
    const result = await this.sandbox.run(moduleCode, script, args)

    // Convert log entries to string
    const logs = result.logs.map(log => log.args.map(a => String(a)).join(' ')).join('\n')

    if (!result.success) {
      throw new Error(result.error || 'Script execution failed')
    }

    return { value: result.value, logs }
  }

  /**
   * Write a module
   */
  async write(options: WriteOptions): Promise<WriteResult> {
    // Validate required fields
    if (!options.name) {
      throw new Error('Module name is required')
    }
    if (!options.types) {
      throw new Error('Module types are required')
    }
    if (!options.module) {
      throw new Error('Module code is required')
    }

    // Validate name format
    this.validateName(options.name)

    // Sanitize type definitions
    const typesSanitization = sanitizeTypeDefinitions(options.types)
    if (!typesSanitization.valid) {
      throw new Error(`Type definitions sanitization failed: ${typesSanitization.errors.join('; ')}`)
    }

    // Validate type definitions (respecting configuration)
    if (this.options.validateOnWrite) {
      this.validateTypes(typesSanitization.sanitized)
    }

    // If tests are provided, run them first using sandbox
    let testResults: TestResult | undefined
    if (options.tests) {
      testResults = await this.executeTests(options.module, options.tests)
      // Only reject if ALL tests fail (no tests passed)
      if (testResults.failed > 0 && testResults.passed === 0) {
        throw new Error(`Tests failed: ${testResults.failed} of ${testResults.total} tests failed`)
      }
    }

    // If script is provided, try to execute it to get the value using sandbox
    // But don't fail the write if the script throws - that will be caught during run()
    let value: unknown
    if (options.script) {
      try {
        const result = await this.executeScriptSandboxed(options.module, options.script, undefined)
        value = result.value
      } catch {
        // Script execution failed - that's okay for write, run() will throw
        value = undefined
      }
    }

    // Store the module with sanitized types
    const storedModule: StoredModule = {
      name: options.name,
      types: typesSanitization.sanitized,
      module: options.module,
      tests: options.tests || '',
      script: options.script || '',
    }

    const writeResult = await this.storage.write(options.name, storedModule)

    // Cache the module exports for future imports using sandbox
    const exports = await this.executeModuleSandboxed(options.module)
    this.moduleCache.set(options.name, exports)

    return {
      name: writeResult.name,
      version: writeResult.version,
      testResults,
      value,
    }
  }

  /**
   * Read a module by name and optional version
   */
  async read(name: string, version?: string): Promise<ReadResult> {
    this.validateName(name)

    const module = await this.storage.read(name, version)
    if (!module) {
      if (version) {
        throw new Error(`Module ${name} version ${version} not found`)
      }
      throw new Error(`Module ${name} not found`)
    }

    return {
      name: module.name,
      types: module.types,
      module: module.module,
      tests: module.tests || undefined,
      script: module.script || undefined,
      version: module.version || '',
    }
  }

  /**
   * Run a module's script
   */
  async run(name: string, args?: Record<string, unknown>): Promise<RunResult> {
    this.validateName(name)

    const module = await this.storage.read(name)
    if (!module) {
      throw new Error(`Module ${name} not found`)
    }

    if (!module.script || module.script.trim() === '') {
      throw new Error(`Module ${name} has no script`)
    }

    // Use sandboxed script execution
    const result = await this.executeScriptSandboxed(module.module, module.script, args)
    return result
  }

  /**
   * Run a module's tests
   */
  async test(name: string): Promise<TestResult> {
    this.validateName(name)

    const module = await this.storage.read(name)
    if (!module) {
      throw new Error(`Module ${name} not found`)
    }

    if (!module.tests || module.tests.trim() === '') {
      throw new Error(`Module ${name} has no tests`)
    }

    return await this.executeTests(module.module, module.tests)
  }

  /**
   * List modules matching a pattern
   */
  async list(pattern?: string): Promise<string[]> {
    return await this.storage.list(pattern)
  }

  /**
   * Get version history for a module
   */
  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    this.validateName(name)

    const versions = await this.storage.versions(name, limit)
    if (versions.length === 0) {
      throw new Error(`Module ${name} not found`)
    }

    return versions
  }

  /**
   * Delete a module
   */
  async delete(name: string): Promise<DeleteResult> {
    this.validateName(name)

    const module = await this.storage.read(name)
    if (!module) {
      throw new Error(`Module ${name} not found`)
    }

    await this.storage.delete(name)

    return {
      deleted: true,
      name,
    }
  }
}

export default ESM

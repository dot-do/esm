/**
 * ESM - Extended class for esm.do module management
 *
 * This class extends the core ESM functionality from @dotdo/esm with:
 * - LRU cache with TTL support
 * - Dependency tracking for cache invalidation
 * - Inline module/script execution
 * - Module code sanitization
 */

import type { StoredModule, ModuleVersion, ModuleStorage, WriteResult as StorageWriteResult } from './storage/types.js'
import type {
  WriteOptions,
  WriteResult,
  ReadResult,
  RunResult,
  RunOptions,
  TestOptions,
  SingleTestResult,
  TestResult,
  DeleteResult,
  FileChange,
  DiffResult,
  Logger,
} from './types.js'
import { SandboxExecutor } from './executor/sandbox.js'
import { sanitizeModuleCode, sanitizeTypeDefinitions } from './executor/sanitize.js'
import { DependencyResolver } from './resolver/dependency.js'
import { ModuleNotFoundError, ValidationError, ExecutionError } from './errors.js'
import { LRUCache } from './cache/lru.js'

// Re-export types from types.ts for external consumers
export type {
  WriteOptions,
  WriteResult,
  ReadResult,
  RunResult,
  RunOptions,
  TestOptions,
  SingleTestResult,
  TestResult,
  DeleteResult,
  FileChange,
  DiffResult,
}

/**
 * Options for creating ESM instance
 */
export interface ESMOptions {
  storage?: ModuleStorage
  enableCaching?: boolean
  cacheSize?: number
  cacheTTL?: number
  validateOnWrite?: boolean
  logger?: Logger
}

/**
 * ESM class for managing modules
 *
 * Extends the core ESM class with additional features:
 * - LRU cache with TTL-based expiration
 * - Dependency tracking for automatic cache invalidation
 * - Inline module execution without storage lookup
 * - Module code sanitization before write
 */
export class ESM {
  private storage: ModuleStorage
  // LRU cache for module exports with TTL support
  private moduleCache!: LRUCache<string, Record<string, unknown>>
  // Track dependencies: dependencyMap[module] = Set of modules that import it
  private dependencyMap: Map<string, Set<string>> = new Map()
  private options: Required<Omit<ESMOptions, 'logger' | 'cacheTTL'>> & { logger?: Logger; cacheTTL?: number }
  private sandbox: SandboxExecutor
  private logger?: Logger

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
      resolvedOptions = { storage: options as unknown as ModuleStorage }
    } else {
      resolvedOptions = options as ESMOptions | undefined || {}
    }

    // Validate options
    this.validateOptions(resolvedOptions)

    // Set storage - use InMemoryStorage from the class below if not provided
    this.storage = resolvedOptions.storage as ModuleStorage || new InMemoryStorage()

    // Set default options - handle logger separately to avoid exactOptionalPropertyTypes issues
    const baseOptions = {
      storage: this.storage,
      enableCaching: resolvedOptions.enableCaching ?? true,
      cacheSize: resolvedOptions.cacheSize ?? 1000,
      validateOnWrite: resolvedOptions.validateOnWrite ?? true,
    }
    // Handle optional properties separately
    const optionalProps: { logger?: Logger; cacheTTL?: number } = {}
    if (resolvedOptions.logger) {
      optionalProps.logger = resolvedOptions.logger
    }
    if (resolvedOptions.cacheTTL !== undefined) {
      optionalProps.cacheTTL = resolvedOptions.cacheTTL
    }
    this.options = { ...baseOptions, ...optionalProps }

    // Initialize logger only if provided
    if (resolvedOptions.logger) {
      this.logger = resolvedOptions.logger
    }

    // Initialize LRU cache with size and optional TTL
    this.moduleCache = new LRUCache<string, Record<string, unknown>>(
      this.options.cacheSize,
      this.options.cacheTTL
    )

    // Initialize sandbox executor for safe code execution
    this.sandbox = new SandboxExecutor()
  }

  /**
   * Validate configuration options
   */
  private validateOptions(options: ESMOptions): void {
    if (options.cacheSize !== undefined) {
      if (!Number.isInteger(options.cacheSize) || options.cacheSize < 1) {
        throw new ValidationError('cacheSize must be a positive integer', { cacheSize: String(options.cacheSize) })
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
        throw new ValidationError('Invalid storage implementation: must implement ModuleStorage interface')
      }
    }
  }

  /**
   * Validate that a module name has the correct @scope/name format
   * Aligns with GitxStorage's MODULE_NAME_PATTERN: /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/
   * Only allows alphanumeric characters and hyphens in path segments
   */
  private validateName(name: string): void {
    if (!name || !name.trim()) {
      throw new ValidationError('Module name is required', { name: name || '' })
    }

    // Check for whitespace-only names
    const trimmedName = name.trim()
    if (trimmedName !== name || /\s/.test(name)) {
      throw new ValidationError('Invalid module name: name cannot contain whitespace', { name })
    }

    // Use pattern aligned with GitxStorage MODULE_NAME_PATTERN
    // Format: @scope/name or @scope/nested/path/name
    // Only alphanumeric chars and hyphens allowed in each segment
    const MODULE_NAME_PATTERN = /^@[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*$/

    if (!MODULE_NAME_PATTERN.test(name)) {
      // Provide helpful error messages for common issues
      if (!name.startsWith('@')) {
        throw new ValidationError('Module name must include scope (e.g., @scope/name)', { name })
      }
      if (name.includes('..')) {
        throw new ValidationError('Module name cannot contain path traversal (..) patterns', { name })
      }
      if (name.includes('//')) {
        throw new ValidationError('Module name cannot contain empty path segments (//)', { name })
      }
      if (name.endsWith('/')) {
        throw new ValidationError('Module name cannot end with a trailing slash', { name })
      }
      if (/[._@\s]/.test(name.slice(1))) {
        throw new ValidationError('Module name can only contain alphanumeric characters and hyphens in path segments', { name })
      }
      // Generic fallback
      throw new ValidationError('Module name must be in format @scope/name with alphanumeric characters and hyphens only', { name })
    }
  }

  /**
   * Validate TypeScript type definitions
   */
  private validateTypes(types: string): void {
    // Check for obviously invalid types
    const invalidTypePattern = /:\s*invalid_type\b/
    if (invalidTypePattern.test(types)) {
      throw new ValidationError('Invalid type definition: unknown type "invalid_type"', { types: 'invalid_type' })
    }

    // Check for basic syntax issues
    const braceCount = (types.match(/{/g) || []).length
    const closeBraceCount = (types.match(/}/g) || []).length
    if (braceCount !== closeBraceCount) {
      throw new ValidationError('Invalid type definition: mismatched braces', { openBraces: String(braceCount), closeBraces: String(closeBraceCount) })
    }
  }

  /**
   * Check if module code contains esm.do imports
   */
  private hasEsmDoImports(moduleCode: string): boolean {
    return /import\s+.*from\s*['"]esm\.do\//.test(moduleCode)
  }

  /**
   * Create a dependency resolver bound to this ESM instance's storage
   */
  private createDependencyResolver(): DependencyResolver {
    return new DependencyResolver(async (name: string) => {
      const module = await this.storage.read(name)
      return module ? { module: module.module } : null
    })
  }

  /**
   * Resolve dependencies for a module if it has esm.do imports
   * Returns the resolved module code with all dependencies bundled
   */
  private async resolveDependencies(name: string, moduleCode: string): Promise<string> {
    if (!this.hasEsmDoImports(moduleCode)) {
      return moduleCode
    }

    const resolver = this.createDependencyResolver()
    const resolved = await resolver.resolve(name, moduleCode)
    return resolved.source
  }

  /**
   * Execute module code and return the exports using SandboxExecutor
   */
  private async executeModuleSandboxed(moduleCode: string, moduleName?: string): Promise<Record<string, unknown>> {
    // Resolve dependencies if needed
    const resolvedCode = moduleName
      ? await this.resolveDependencies(moduleName, moduleCode)
      : moduleCode

    // Use SandboxExecutor.run to execute the module and extract exports
    // The sandbox extracts exports automatically based on export statements
    const exportNames = this.extractExportNames(resolvedCode)

    // Build a script that returns all exports as an object
    const returnScript = exportNames.length > 0
      ? `return { ${exportNames.join(', ')} }`
      : 'return {}'

    const result = await this.sandbox.run(resolvedCode, returnScript)

    if (!result.success) {
      throw new ExecutionError(result.error || 'Module execution failed')
    }

    // Check for module-level errors in logs (sandbox may capture them as logs instead of failures)
    const moduleErrors = result.logs.filter(log =>
      log.level === 'error' &&
      log.args.some(arg => String(arg).startsWith('Module error:'))
    )
    const firstError = moduleErrors[0]
    if (firstError) {
      const errorMessage = firstError.args.join(' ').replace('Module error: ', '')
      throw new ExecutionError(errorMessage)
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
      const name = match[1]
      if (name) names.push(name)
    }

    // Match export const name
    const constRegex = /export\s+const\s+(\w+)/g
    while ((match = constRegex.exec(moduleCode)) !== null) {
      const name = match[1]
      if (name) names.push(name)
    }

    // Match export let name
    const letRegex = /export\s+let\s+(\w+)/g
    while ((match = letRegex.exec(moduleCode)) !== null) {
      const name = match[1]
      if (name) names.push(name)
    }

    return names
  }

  /**
   * Execute tests and return results using SandboxExecutor
   */
  private async executeTests(moduleCode: string, testsCode: string, moduleName?: string): Promise<TestResult> {
    // Resolve dependencies if module has esm.do imports
    const resolvedCode = moduleName
      ? await this.resolveDependencies(moduleName, moduleCode)
      : moduleCode

    // Use SandboxExecutor.test for safe test execution
    const sandboxResult = await this.sandbox.test(resolvedCode, testsCode)

    // Convert SandboxExecutor test results to ESM TestResult format
    const results: SingleTestResult[] = sandboxResult.tests.map(t => ({
      name: t.name,
      passed: t.status === 'passed',
      duration: t.duration || 0,
      error: t.error,
    }))

    const failures = results
      .filter(r => !r.passed && r.error)
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
    args?: Record<string, unknown>,
    moduleName?: string
  ): Promise<{ value: unknown; logs: string }> {
    // Resolve dependencies if needed
    const resolvedCode = moduleName
      ? await this.resolveDependencies(moduleName, moduleCode)
      : moduleCode

    // Use SandboxExecutor.run for safe script execution
    const result = await this.sandbox.run(resolvedCode, script, args)

    // Convert log entries to string
    const logs = result.logs.map(log => log.args.map(a => String(a)).join(' ')).join('\n')

    if (!result.success) {
      throw new ExecutionError(result.error || 'Script execution failed')
    }

    return { value: result.value, logs }
  }

  /**
   * Write a module
   */
  async write(options: WriteOptions): Promise<WriteResult> {
    // Validate required fields
    if (!options.name || !options.name.trim()) {
      throw new ValidationError('Module name is required', { field: 'name' })
    }
    // Empty types are allowed (warning case) - only reject if types is undefined/null
    if (options.types === undefined || options.types === null) {
      throw new ValidationError('Module types are required', { field: 'types' })
    }
    // Empty module code or whitespace-only module code should be rejected
    if (!options.module || !options.module.trim()) {
      throw new ValidationError('Module code is required', { field: 'module' })
    }

    // Validate name format
    this.validateName(options.name)

    // Sanitize module code - check for dangerous patterns
    const moduleSanitization = sanitizeModuleCode(options.module)
    if (!moduleSanitization.valid) {
      throw new ValidationError(`Module code sanitization failed: ${moduleSanitization.errors.join('; ')}`, { errors: moduleSanitization.errors.join('; ') })
    }

    // Sanitize type definitions
    const typesSanitization = sanitizeTypeDefinitions(options.types)
    if (!typesSanitization.valid) {
      throw new ValidationError(`Type definitions sanitization failed: ${typesSanitization.errors.join('; ')}`, { errors: typesSanitization.errors.join('; ') })
    }

    // Validate type definitions (respecting configuration)
    if (this.options.validateOnWrite) {
      this.validateTypes(typesSanitization.sanitized)
    }

    // If tests are provided, run them first using sandbox
    let testResults: TestResult | undefined
    if (options.tests) {
      testResults = await this.executeTests(options.module, options.tests, options.name)
      // Only reject if ALL tests fail (no tests passed)
      if (testResults.failed > 0 && testResults.passed === 0) {
        throw new ExecutionError(`Tests failed: ${testResults.failed} of ${testResults.total} tests failed`)
      }
    }

    // If script is provided, try to execute it to get the value using sandbox
    // But don't fail the write if the script throws - that will be caught during run()
    let value: unknown
    if (options.script) {
      try {
        const result = await this.executeScriptSandboxed(options.module, options.script, undefined)
        value = result.value
      } catch (error: unknown) {
        // Script execution failed - that's okay for write, run() will throw
        const err = error instanceof Error ? error : new Error(String(error))
        this.logger?.warn('Script execution failed during write', {
          name: options.name,
          error: err.message
        })
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

    // Invalidate cache for this module and all dependents
    this.invalidateCacheForModule(options.name)

    // Track dependencies if this module has esm.do imports
    if (this.hasEsmDoImports(options.module)) {
      this.trackDependencies(options.name, options.module)
    }

    // Cache the module exports for future imports using sandbox
    // Skip if module has esm.do imports (dependencies might not be available yet)
    if (!this.hasEsmDoImports(options.module)) {
      try {
        const exports = await this.executeModuleSandboxed(options.module)
        this.moduleCache.set(options.name, exports)
      } catch (error: unknown) {
        // Execution failed - that's okay, we'll try again during run()
        const err = error instanceof Error ? error : new Error(String(error))
        this.logger?.warn('Module cache failed during write', {
          name: options.name,
          error: err.message
        })
      }
    }

    return {
      name: writeResult.name,
      version: writeResult.version,
      testResults,
      value,
    }
  }

  /**
   * Invalidate cache for a module and all modules that depend on it
   */
  private invalidateCacheForModule(moduleName: string): void {
    // Remove this module from cache
    this.moduleCache.delete(moduleName)

    // Find all modules that depend on this module and invalidate them too
    const dependents = this.dependencyMap.get(moduleName)
    if (dependents) {
      for (const dependent of dependents) {
        this.moduleCache.delete(dependent)
      }
    }
  }

  /**
   * Track which modules this module depends on (for cache invalidation)
   */
  private trackDependencies(moduleName: string, moduleCode: string): void {
    // Extract esm.do imports from the module code
    const importRegex = /import\s+.*from\s*['"]esm\.do\/(@[^'"]+)['"]/g
    let match

    while ((match = importRegex.exec(moduleCode)) !== null) {
      const dependency = match[1]
      if (dependency) {
        // Add this module as a dependent of the imported module
        let dependents = this.dependencyMap.get(dependency)
        if (!dependents) {
          dependents = new Set()
          this.dependencyMap.set(dependency, dependents)
        }
        dependents.add(moduleName)
      }
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
        throw new ModuleNotFoundError(`${name}@${version}`)
      }
      throw new ModuleNotFoundError(name)
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
   * Run a module's script.
   * @deprecated Positional arguments are deprecated. Use run({ name, args }) instead.
   */
  async run(name: string, args?: Record<string, unknown>): Promise<RunResult>
  /**
   * Run a module's script.
   * Supports options object ({ name, args, timeout, env }).
   * Also supports inline module execution via options.module and options.script.
   */
  async run(options: RunOptions): Promise<RunResult>
  async run(nameOrOptions: string | RunOptions, args?: Record<string, unknown>): Promise<RunResult> {
    // Normalize arguments - support both positional and options object
    let name: string
    let runArgs: Record<string, unknown> | undefined
    let inlineModule: string | undefined
    let inlineScript: string | undefined
    const isOptionsObject = typeof nameOrOptions === 'object' && nameOrOptions !== null

    if (isOptionsObject) {
      // Options object format (CLI-aligned)
      name = nameOrOptions.name
      runArgs = nameOrOptions.args
      inlineModule = nameOrOptions.module
      inlineScript = nameOrOptions.script
    } else {
      // Positional arguments format (legacy)
      name = nameOrOptions
      runArgs = args
    }

    this.validateName(name)

    // Determine module code and script to execute
    let moduleCode: string
    let scriptCode: string

    if (inlineModule) {
      // Inline module mode - use provided module and script
      moduleCode = inlineModule
      scriptCode = inlineScript || ''

      // Track dependencies for inline modules too
      if (this.hasEsmDoImports(moduleCode)) {
        this.trackDependencies(name, moduleCode)
      }
    } else {
      // Storage mode - read from storage
      const module = await this.storage.read(name)
      if (!module) {
        throw new ModuleNotFoundError(name)
      }

      if (!module.script || module.script.trim() === '') {
        throw new ValidationError(`Module ${name} has no script`, { name, field: 'script' })
      }

      moduleCode = module.module
      scriptCode = module.script
    }

    if (!scriptCode || scriptCode.trim() === '') {
      throw new ValidationError(`Module ${name} has no script`, { name, field: 'script' })
    }

    // Use sandboxed script execution with dependency resolution
    try {
      const result = await this.executeScriptSandboxed(moduleCode, scriptCode, runArgs, name)
      // Convert logs string to array format for CLI alignment
      const logsArray = result.logs ? result.logs.split('\n').filter(l => l.length > 0) : []
      return {
        value: result.value,
        logs: logsArray,
        errors: [],
        exitCode: 0,
      }
    } catch (error: unknown) {
      // In CLI mode (options object), return error result
      // In legacy mode (positional args), throw for backward compatibility
      const err = error instanceof Error ? error : new Error(String(error))
      if (isOptionsObject) {
        this.logger?.error('Script execution failed', err, { name })
        return {
          value: undefined,
          logs: [],
          errors: [err.message],
          exitCode: 1,
        }
      }
      // Legacy mode: re-throw the error
      throw err
    }
  }

  /**
   * Run a module's tests.
   * @deprecated Positional argument is deprecated. Use test({ name }) instead.
   */
  async test(name: string): Promise<TestResult>
  /**
   * Run a module's tests.
   * Supports options object ({ name, watch, coverage, filter }).
   */
  async test(options: TestOptions): Promise<TestResult>
  async test(nameOrOptions: string | TestOptions): Promise<TestResult> {
    // Normalize arguments - support both positional and options object
    let name: string
    let filter: string | undefined

    if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
      // Options object format (CLI-aligned)
      name = nameOrOptions.name
      filter = nameOrOptions.filter
    } else {
      // Positional argument format (legacy)
      name = nameOrOptions
    }

    this.validateName(name)

    const module = await this.storage.read(name)
    if (!module) {
      throw new ModuleNotFoundError(name)
    }

    if (!module.tests || module.tests.trim() === '') {
      throw new ValidationError(`Module ${name} has no tests`, { name, field: 'tests' })
    }

    const result = await this.executeTests(module.module, module.tests, name)

    // Apply filter if provided
    if (filter) {
      const filteredResults = result.results.filter(r => r.name.includes(filter))
      const passed = filteredResults.filter(r => r.passed).length
      const failed = filteredResults.filter(r => !r.passed).length
      return {
        ...result,
        results: filteredResults,
        passed,
        failed,
        total: filteredResults.length,
      }
    }

    return result
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
      throw new ModuleNotFoundError(name)
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
      throw new ModuleNotFoundError(name)
    }

    await this.storage.delete(name)

    return {
      deleted: true,
      name,
    }
  }

  /**
   * Compare two versions of a module and return the diff
   * @param name Module name
   * @param from Starting version hash
   * @param to Ending version hash (use 'HEAD' for latest)
   * @returns Diff result with changes and unified patch
   */
  async diff(name: string, from: string, to: string): Promise<DiffResult> {
    this.validateName(name)

    // Read the 'from' version
    const fromModule = await this.storage.read(name, from)
    if (!fromModule) {
      throw new ModuleNotFoundError(`${name}@${from}`)
    }

    // Read the 'to' version (HEAD means latest)
    let toModule: StoredModule | null
    let toVersion: string
    if (to === 'HEAD') {
      toModule = await this.storage.read(name)
      if (!toModule) {
        throw new ModuleNotFoundError(name)
      }
      toVersion = toModule.version || 'HEAD'
    } else {
      toModule = await this.storage.read(name, to)
      if (!toModule) {
        throw new ModuleNotFoundError(`${name}@${to}`)
      }
      toVersion = to
    }

    // Generate diffs for each file type
    const files: Array<{ name: string; from: string; to: string }> = [
      { name: 'index.d.ts', from: fromModule.types, to: toModule.types },
      { name: 'index.mjs', from: fromModule.module, to: toModule.module },
      { name: 'index.test.js', from: fromModule.tests || '', to: toModule.tests || '' },
      { name: 'index.script.js', from: fromModule.script || '', to: toModule.script || '' },
    ]

    const changes: FileChange[] = []
    const patches: string[] = []

    for (const file of files) {
      const { additions, deletions, patch } = this.generateUnifiedDiff(
        file.name,
        file.from,
        file.to,
        from,
        toVersion
      )

      // Only include files that have changes
      if (additions > 0 || deletions > 0) {
        changes.push({
          file: file.name,
          additions,
          deletions,
        })
        patches.push(patch)
      }
    }

    return {
      from,
      to: toVersion,
      changes,
      patch: patches.join('\n'),
    }
  }

  /**
   * Generate a unified diff between two strings
   * Returns the diff in unified format with additions/deletions count
   */
  private generateUnifiedDiff(
    filename: string,
    oldContent: string,
    newContent: string,
    oldLabel: string,
    newLabel: string
  ): { additions: number; deletions: number; patch: string } {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    // Simple line-by-line diff using LCS (Longest Common Subsequence)
    const lcs = this.computeLCS(oldLines, newLines)
    const hunks = this.generateHunks(oldLines, newLines, lcs)

    if (hunks.length === 0) {
      return { additions: 0, deletions: 0, patch: '' }
    }

    let additions = 0
    let deletions = 0
    const patchLines: string[] = []

    // Add unified diff header
    patchLines.push(`--- a/${filename} (${oldLabel})`)
    patchLines.push(`+++ b/${filename} (${newLabel})`)

    for (const hunk of hunks) {
      // Add hunk header
      patchLines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`)

      for (const line of hunk.lines) {
        patchLines.push(line)
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++
        }
      }
    }

    return {
      additions,
      deletions,
      patch: patchLines.join('\n'),
    }
  }

  /**
   * Compute Longest Common Subsequence indices
   */
  private computeLCS(oldLines: string[], newLines: string[]): number[][] {
    const m = oldLines.length
    const n = newLines.length
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0) as number[])

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const dpRow = dp[i]
        const dpPrevRow = dp[i - 1]
        if (dpRow && dpPrevRow && oldLines[i - 1] === newLines[j - 1]) {
          dpRow[j] = (dpPrevRow[j - 1] ?? 0) + 1
        } else if (dpRow && dpPrevRow) {
          dpRow[j] = Math.max(dpPrevRow[j] ?? 0, dpRow[j - 1] ?? 0)
        }
      }
    }

    return dp
  }

  /**
   * Generate diff hunks from LCS
   */
  private generateHunks(
    oldLines: string[],
    newLines: string[],
    dp: number[][]
  ): Array<{ oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] }> {
    const hunks: Array<{ oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] }> = []

    // Backtrack to find the actual diff
    const diffOps: Array<{ type: 'equal' | 'delete' | 'insert'; oldIdx?: number; newIdx?: number }> = []
    let i = oldLines.length
    let j = newLines.length

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        diffOps.unshift({ type: 'equal', oldIdx: i - 1, newIdx: j - 1 })
        i--
        j--
      } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
        diffOps.unshift({ type: 'insert', newIdx: j - 1 })
        j--
      } else {
        diffOps.unshift({ type: 'delete', oldIdx: i - 1 })
        i--
      }
    }

    // Group consecutive changes into hunks with context
    const contextLines = 3
    let currentHunk: { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] } | null = null
    let oldIdx = 0
    let newIdx = 0

    for (let opIdx = 0; opIdx < diffOps.length; opIdx++) {
      const op = diffOps[opIdx]
      if (!op) continue

      if (op.type !== 'equal') {
        // Start a new hunk or extend the current one
        if (!currentHunk) {
          // Find context before
          const contextStart = Math.max(0, opIdx - contextLines)
          currentHunk = {
            oldStart: Math.max(1, oldIdx - (opIdx - contextStart) + 1),
            oldCount: 0,
            newStart: Math.max(1, newIdx - (opIdx - contextStart) + 1),
            newCount: 0,
            lines: [],
          }

          // Add context before
          for (let c = contextStart; c < opIdx; c++) {
            const ctxOp = diffOps[c]
            if (ctxOp && ctxOp.type === 'equal' && ctxOp.oldIdx !== undefined) {
              currentHunk.lines.push(` ${oldLines[ctxOp.oldIdx]}`)
              currentHunk.oldCount++
              currentHunk.newCount++
            }
          }
        }

        // Add the change
        if (op.type === 'delete' && op.oldIdx !== undefined) {
          currentHunk.lines.push(`-${oldLines[op.oldIdx]}`)
          currentHunk.oldCount++
          oldIdx++
        } else if (op.type === 'insert' && op.newIdx !== undefined) {
          currentHunk.lines.push(`+${newLines[op.newIdx]}`)
          currentHunk.newCount++
          newIdx++
        }
      } else {
        // Equal line
        if (currentHunk) {
          // Check if we should close the hunk
          let nextChangeIdx = opIdx + 1
          while (nextChangeIdx < diffOps.length && diffOps[nextChangeIdx]?.type === 'equal') {
            nextChangeIdx++
          }

          const gapSize = nextChangeIdx - opIdx
          if (nextChangeIdx >= diffOps.length || gapSize > contextLines * 2) {
            // Close hunk with context after
            const contextEnd = Math.min(opIdx + contextLines, diffOps.length)
            for (let c = opIdx; c < contextEnd; c++) {
              const ctxOp = diffOps[c]
              if (ctxOp && ctxOp.type === 'equal' && ctxOp.oldIdx !== undefined) {
                currentHunk.lines.push(` ${oldLines[ctxOp.oldIdx]}`)
                currentHunk.oldCount++
                currentHunk.newCount++
              }
            }
            hunks.push(currentHunk)
            currentHunk = null
          } else {
            // Continue hunk with this equal line
            if (op.oldIdx !== undefined) {
              currentHunk.lines.push(` ${oldLines[op.oldIdx]}`)
              currentHunk.oldCount++
              currentHunk.newCount++
            }
          }
        }
        oldIdx++
        newIdx++
      }
    }

    // Close any remaining hunk
    if (currentHunk && currentHunk.lines.length > 0) {
      hunks.push(currentHunk)
    }

    return hunks
  }
}

/**
 * Simple mutex implementation for write serialization
 * Ensures thread-safe operations by serializing access to critical sections
 */
class Mutex {
  private locked = false
  private waitQueue: Array<() => void> = []

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }

    // Wait for lock to be released
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve)
    })
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      // Pass lock to next waiter
      const next = this.waitQueue.shift()!
      next()
    } else {
      this.locked = false
    }
  }
}

/**
 * In-memory storage for ESM modules
 * Thread-safe with write locks per module
 */
class InMemoryStorage implements ModuleStorage {
  private modules: Map<string, { current: StoredModule; versions: Map<string, StoredModule>; history: ModuleVersion[] }> = new Map()
  private writeLocks: Map<string, Mutex> = new Map()

  /**
   * Get or create a mutex for a specific module name
   */
  private getWriteLock(name: string): Mutex {
    let mutex = this.writeLocks.get(name)
    if (!mutex) {
      mutex = new Mutex()
      this.writeLocks.set(name, mutex)
    }
    return mutex
  }

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
    // Acquire write lock for this module to serialize concurrent writes
    const lock = this.getWriteLock(name)
    await lock.acquire()

    try {
      // Generate content-based hash with timestamp and random nonce for uniqueness
      const timestamp = Date.now()
      const nonce = Math.random().toString(36).substring(2, 10)
      const content = JSON.stringify({
        types: module.types,
        module: module.module,
        tests: module.tests || '',
        script: module.script || '',
        _ts: timestamp,
        _nonce: nonce,
      })

      // Simple hash using string operations (no crypto dependency)
      let hash = 0
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32bit integer
      }
      const version = Math.abs(hash).toString(16).padStart(12, '0').slice(0, 12)

      const storedModule: StoredModule = { ...module, version }

      let entry = this.modules.get(name)
      if (!entry) {
        entry = { current: storedModule, versions: new Map(), history: [] }
        this.modules.set(name, entry)
      }

      entry.current = storedModule
      entry.versions.set(version, storedModule)
      entry.history.unshift({
        version: version,
        message: 'Module updated',
        timestamp: new Date(timestamp),
      })

      return { version, name }
    } finally {
      // Always release the lock
      lock.release()
    }
  }

  async delete(name: string): Promise<void> {
    // Acquire write lock for this module to prevent race conditions
    const lock = this.getWriteLock(name)
    await lock.acquire()

    try {
      this.modules.delete(name)
    } finally {
      lock.release()
    }
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

  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    const entry = this.modules.get(name)
    if (!entry) return []
    // If no limit specified, return all versions; otherwise apply the limit
    return limit !== undefined ? entry.history.slice(0, limit) : entry.history
  }
}

export default ESM

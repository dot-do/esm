/**
 * ESM - Core class for esm.do module management
 *
 * This class provides the core functionality for managing ESM modules,
 * including reading, writing, running, and testing.
 *
 * ZERO Cloudflare dependencies - platform agnostic.
 */

import type { ModuleStorage, StoredModule, ModuleVersion as StorageModuleVersion, ModuleInput } from './storage/types.js'
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
import { sanitizeTypeDefinitions } from './executor/sanitize.js'
import type { Executor } from './executor/types.js'
import { DependencyResolver } from './resolver/dependency.js'
import { ModuleNotFoundError, ValidationError, ExecutionError } from './errors.js'
import { InMemoryStorage } from './storage/memory.js'

/**
 * Options for creating ESM instance
 */
export interface ESMOptions {
  storage?: ModuleStorage
  executor?: Executor
  enableCaching?: boolean
  cacheSize?: number
  validateOnWrite?: boolean
  logger?: Logger
}

/**
 * ESM class for managing modules
 */
export class ESM {
  private storage: ModuleStorage
  // Storage for module resolution (for imports)
  private moduleCache: Map<string, Record<string, unknown>> = new Map()
  private options: Required<Omit<ESMOptions, 'logger' | 'executor'>> & { logger?: Logger; executor?: Executor }
  private executor: Executor
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
      resolvedOptions = { storage: options }
    } else {
      resolvedOptions = options as ESMOptions | undefined || {}
    }

    // Validate options
    this.validateOptions(resolvedOptions)

    // Set storage
    this.storage = resolvedOptions.storage || new InMemoryStorage()

    // Set default options - build object conditionally to satisfy exactOptionalPropertyTypes
    const baseOptions = {
      storage: this.storage,
      enableCaching: resolvedOptions.enableCaching ?? true,
      cacheSize: resolvedOptions.cacheSize ?? 1000,
      validateOnWrite: resolvedOptions.validateOnWrite ?? true,
    }
    // Only add optional properties if they are defined
    this.options = resolvedOptions.logger !== undefined && resolvedOptions.executor !== undefined
      ? { ...baseOptions, logger: resolvedOptions.logger, executor: resolvedOptions.executor }
      : resolvedOptions.logger !== undefined
        ? { ...baseOptions, logger: resolvedOptions.logger }
        : resolvedOptions.executor !== undefined
          ? { ...baseOptions, executor: resolvedOptions.executor }
          : baseOptions

    // Initialize logger - only set if defined to satisfy exactOptionalPropertyTypes
    if (resolvedOptions.logger !== undefined) {
      this.logger = resolvedOptions.logger
    }

    // Initialize executor for safe code execution
    // Use injected executor if provided, otherwise default to SandboxExecutor
    this.executor = resolvedOptions.executor ?? new SandboxExecutor()
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

    const result = await this.executor.run(resolvedCode, returnScript)

    if (!result.success) {
      throw new ExecutionError(result.error || 'Module execution failed')
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
      if (name !== undefined) {
        names.push(name)
      }
    }

    // Match export const name
    const constRegex = /export\s+const\s+(\w+)/g
    while ((match = constRegex.exec(moduleCode)) !== null) {
      const name = match[1]
      if (name !== undefined) {
        names.push(name)
      }
    }

    // Match export let name
    const letRegex = /export\s+let\s+(\w+)/g
    while ((match = letRegex.exec(moduleCode)) !== null) {
      const name = match[1]
      if (name !== undefined) {
        names.push(name)
      }
    }

    return names
  }

  /**
   * Execute tests and return results using Executor
   */
  private async executeTests(moduleCode: string, testsCode: string, _resolveModule?: (name: string) => Record<string, unknown>): Promise<TestResult> {
    // Use Executor.test for safe test execution
    const executorResult = await this.executor.test(moduleCode, testsCode)

    // Get test results from executor - use 'results' (new standard) with fallback to 'tests' (legacy)
    const testResults = executorResult.results ?? (executorResult as unknown as { tests?: typeof executorResult.results }).tests ?? []

    // Convert Executor test results to ESM TestResult format
    const results: SingleTestResult[] = testResults.map(t => ({
      name: t.name,
      passed: t.status === 'passed',
      duration: t.duration || 0,
      error: t.error,
    }))

    const failures = results
      .filter(r => !r.passed && r.error)
      .map(r => ({ name: r.name, error: r.error! }))

    return {
      passed: executorResult.passed,
      failed: executorResult.failed,
      total: executorResult.total ?? results.length,
      results,
      failures: failures.length > 0 ? failures : undefined,
      duration: executorResult.duration ?? 0,
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
    const result = await this.executor.run(resolvedCode, script, args)

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
      testResults = await this.executeTests(options.module, options.tests)
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
    const moduleInput: ModuleInput = {
      name: options.name,
      types: typesSanitization.sanitized,
      module: options.module,
      tests: options.tests || '',
      script: options.script || '',
    }

    const writeResult = await this.storage.write(options.name, moduleInput)

    // Cache the module exports for future imports using sandbox
    // Skip if module has esm.do imports (dependencies might not be available yet)
    if (!this.hasEsmDoImports(options.module)) {
      try {
        const exports = await this.executeModuleSandboxed(options.module)
        this.addToCache(options.name, exports)
      } catch (error: unknown) {
        // Execution failed - that's okay, we'll try again during run()
        const err = error instanceof Error ? error : new Error(String(error))
        this.logger?.warn('Module caching failed during write', {
          name: options.name,
          error: err.message
        })
      }
    }

    return {
      name: options.name,
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
   */
  async run(options: RunOptions): Promise<RunResult>
  async run(nameOrOptions: string | RunOptions, args?: Record<string, unknown>): Promise<RunResult> {
    // Normalize arguments - support both positional and options object
    let name: string
    let runArgs: Record<string, unknown> | undefined
    const isOptionsObject = typeof nameOrOptions === 'object' && nameOrOptions !== null

    if (isOptionsObject) {
      // Options object format (CLI-aligned)
      name = nameOrOptions.name
      runArgs = nameOrOptions.args
    } else {
      // Positional arguments format (legacy)
      name = nameOrOptions
      runArgs = args
    }

    this.validateName(name)

    const module = await this.storage.read(name)
    if (!module) {
      throw new ModuleNotFoundError(name)
    }

    if (!module.script || module.script.trim() === '') {
      throw new ValidationError(`Module ${name} has no script`, { name, field: 'script' })
    }

    // Use sandboxed script execution with dependency resolution
    try {
      const result = await this.executeScriptSandboxed(module.module, module.script, runArgs, name)
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

    const result = await this.executeTests(module.module, module.tests)

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
  async versions(name: string, limit?: number): Promise<StorageModuleVersion[]> {
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
        if (!dpRow || !dpPrevRow) continue
        if (oldLines[i - 1] === newLines[j - 1]) {
          dpRow[j] = (dpPrevRow[j - 1] ?? 0) + 1
        } else {
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
              const oldLine = oldLines[ctxOp.oldIdx]
              if (oldLine !== undefined) {
                currentHunk.lines.push(` ${oldLine}`)
                currentHunk.oldCount++
                currentHunk.newCount++
              }
            }
          }
        }

        // Add the change
        if (op.type === 'delete' && op.oldIdx !== undefined) {
          const oldLine = oldLines[op.oldIdx]
          if (oldLine !== undefined) {
            currentHunk.lines.push(`-${oldLine}`)
            currentHunk.oldCount++
          }
          oldIdx++
        } else if (op.type === 'insert' && op.newIdx !== undefined) {
          const newLine = newLines[op.newIdx]
          if (newLine !== undefined) {
            currentHunk.lines.push(`+${newLine}`)
            currentHunk.newCount++
          }
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
                const oldLine = oldLines[ctxOp.oldIdx]
                if (oldLine !== undefined) {
                  currentHunk.lines.push(` ${oldLine}`)
                  currentHunk.oldCount++
                  currentHunk.newCount++
                }
              }
            }
            hunks.push(currentHunk)
            currentHunk = null
          } else {
            // Continue hunk with this equal line
            if (op.oldIdx !== undefined) {
              const oldLine = oldLines[op.oldIdx]
              if (oldLine !== undefined) {
                currentHunk.lines.push(` ${oldLine}`)
                currentHunk.oldCount++
                currentHunk.newCount++
              }
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

export default ESM

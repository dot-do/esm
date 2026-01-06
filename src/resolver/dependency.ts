/**
 * DependencyResolver - Resolves esm.do module imports
 *
 * This module provides dependency resolution for ESM modules that import
 * from other esm.do modules using the esm.do/@scope/name import syntax.
 *
 * Features:
 * - Parse import statements from module source
 * - Build dependency graph
 * - Resolve esm.do/@ imports to actual module content
 * - Detect and report circular dependencies
 * - Handle missing dependencies gracefully
 *
 * Performance optimizations:
 * - Caching for resolved modules and dependency graphs
 * - Memoized import parsing
 * - Pre-compiled regex patterns
 * - Early return optimizations
 */

/**
 * Parsed import information
 */
export interface ParsedImport {
  /** The full import statement */
  statement: string
  /** The imported module specifier (e.g., 'esm.do/@math/base') */
  specifier: string
  /** The module name extracted from specifier (e.g., '@math/base') */
  moduleName: string
  /** Named imports (e.g., ['double', 'triple']) */
  namedImports: string[]
  /** Default import name if present */
  defaultImport?: string
  /** Namespace import name if present (import * as name) */
  namespaceImport?: string
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  /** Module name */
  module: string
  /** Direct dependencies */
  dependencies: string[]
  /** Whether this module has been resolved */
  resolved: boolean
  /** Module source code (after resolution) */
  source?: string
}

/**
 * Dependency graph
 */
export interface DependencyGraph {
  /** Entry point module */
  entry: string
  /** All nodes in the graph */
  nodes: Map<string, DependencyNode>
}

/**
 * Resolved module with all dependencies inlined
 */
export interface ResolvedModule {
  /** Original module name */
  name: string
  /** Resolved source code with imports replaced */
  source: string
  /** List of resolved dependencies in topological order */
  dependencies: string[]
}

/**
 * Module fetcher interface - allows ESM class to provide module lookup
 */
export interface ModuleFetcher {
  (name: string): Promise<{ module: string } | null>
}

/**
 * Cache entry for resolved modules
 */
interface ResolvedCacheEntry {
  result: ResolvedModule
  timestamp: number
}

/**
 * Cache entry for dependency graphs
 */
interface GraphCacheEntry {
  graph: DependencyGraph
  sourceHash: string
}

// Pre-compiled regex patterns for performance
const IMPORT_REGEX = /import\s+(?:(\w+)\s*,?\s*)?(?:\*\s+as\s+(\w+)|{([^}]+)})?\s*from\s*['"]esm\.do\/(@[^'"]+)['"]/g
const ALIAS_REGEX = /(\w+)\s+as\s+(\w+)/
const EXPORT_FUNC_REGEX = /export\s+(?:async\s+)?function\s+(\w+)/g
const EXPORT_CONST_REGEX = /export\s+const\s+(\w+)/g
const EXPORT_LET_REGEX = /export\s+let\s+(\w+)/g
const EXPORT_CLASS_REGEX = /export\s+class\s+(\w+)/g
const STRIP_IMPORTS_REGEX = /import\s+(?:(\w+)\s*,?\s*)?(?:\*\s+as\s+(\w+)|{([^}]+)})?\s*from\s*['"]esm\.do\/[^'"]+['"]\s*;?/g

// Quick check pattern (non-capturing for speed)
const HAS_ESM_IMPORT = /import[^]*esm\.do\/@/

/**
 * DependencyResolver class
 *
 * Resolves imports from esm.do modules and builds a dependency graph.
 * Includes caching and memoization for improved performance.
 */
export class DependencyResolver {
  private fetcher: ModuleFetcher
  private moduleCache: Map<string, string> = new Map()

  // Caches for performance optimization
  private parseCache: Map<string, ParsedImport[]> = new Map()
  private resolvedCache: Map<string, ResolvedCacheEntry> = new Map()
  private graphCache: Map<string, GraphCacheEntry> = new Map()
  private exportNamesCache: Map<string, string[]> = new Map()
  private safeNameCache: Map<string, string> = new Map()

  // Cache TTL in milliseconds (5 minutes)
  private static readonly CACHE_TTL = 5 * 60 * 1000

  constructor(fetcher: ModuleFetcher) {
    this.fetcher = fetcher
  }

  /**
   * Clear all caches - useful for testing or when modules are updated
   */
  clearCache(): void {
    this.parseCache.clear()
    this.resolvedCache.clear()
    this.graphCache.clear()
    this.exportNamesCache.clear()
    this.moduleCache.clear()
  }

  /**
   * Generate a simple hash for cache keys
   */
  private hashSource(source: string): string {
    // Simple hash using string length and a sample of characters
    // Fast but sufficient for cache invalidation
    let hash = source.length
    const step = Math.max(1, Math.floor(source.length / 100))
    for (let i = 0; i < source.length; i += step) {
      hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
    }
    return hash.toString(36)
  }

  /**
   * Parse import statements from module source
   * Results are cached based on source content hash
   */
  parseImports(source: string): ParsedImport[] {
    // Early return if no esm.do imports exist (fast path)
    if (!HAS_ESM_IMPORT.test(source)) {
      return []
    }

    // Check cache first
    const cacheKey = this.hashSource(source)
    const cached = this.parseCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const imports: ParsedImport[] = []

    // Match import statements for esm.do modules
    // Patterns:
    // - import { name } from 'esm.do/@scope/module'
    // - import { name, other } from 'esm.do/@scope/module'
    // - import { name as alias } from 'esm.do/@scope/module'
    // - import defaultExport from 'esm.do/@scope/module'
    // - import * as namespace from 'esm.do/@scope/module'
    // - import defaultExport, { named } from 'esm.do/@scope/module'

    // Reset regex lastIndex for fresh matching
    IMPORT_REGEX.lastIndex = 0

    let match
    while ((match = IMPORT_REGEX.exec(source)) !== null) {
      const [statement, defaultImport, namespaceImport, namedImportsStr, moduleName] = match

      const namedImports: string[] = []
      if (namedImportsStr) {
        // Parse named imports, handling aliases
        const parts = namedImportsStr.split(',')
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i].trim()
          if (!part) continue
          // Handle "name as alias" pattern - we want the original name
          const asMatch = ALIAS_REGEX.exec(part)
          if (asMatch) {
            namedImports.push(asMatch[1])
          } else {
            namedImports.push(part)
          }
        }
      }

      imports.push({
        statement,
        specifier: `esm.do/${moduleName}`,
        moduleName,
        namedImports,
        defaultImport: defaultImport || undefined,
        namespaceImport: namespaceImport || undefined,
      })
    }

    // Cache the result
    this.parseCache.set(cacheKey, imports)

    return imports
  }

  /**
   * Build dependency graph starting from entry module
   * Includes caching and parallel dependency fetching for performance
   */
  async buildGraph(entryName: string, entrySource: string): Promise<DependencyGraph> {
    // Check graph cache first
    const sourceHash = this.hashSource(entrySource)
    const cacheKey = `${entryName}:${sourceHash}`
    const cachedGraph = this.graphCache.get(cacheKey)
    if (cachedGraph && cachedGraph.sourceHash === sourceHash) {
      return cachedGraph.graph
    }

    const graph: DependencyGraph = {
      entry: entryName,
      nodes: new Map(),
    }

    // Queue of modules to process
    const queue: Array<{ name: string; source: string }> = [{ name: entryName, source: entrySource }]
    const visited = new Set<string>()
    const pending = new Set<string>() // Track in-flight fetches

    while (queue.length > 0) {
      const current = queue.shift()!

      if (visited.has(current.name)) {
        continue
      }
      visited.add(current.name)

      const imports = this.parseImports(current.source)
      const dependencies = imports.map(imp => imp.moduleName)

      graph.nodes.set(current.name, {
        module: current.name,
        dependencies,
        resolved: true,
        source: current.source,
      })

      // Collect unvisited dependencies for parallel fetching
      const toFetch = dependencies.filter(dep => !visited.has(dep) && !pending.has(dep))

      if (toFetch.length > 0) {
        // Mark as pending to avoid duplicate fetches
        for (const dep of toFetch) {
          pending.add(dep)
        }

        // Fetch dependencies in parallel
        const fetchPromises = toFetch.map(async (dep) => {
          // Check module cache first
          const cachedModule = this.moduleCache.get(dep)
          if (cachedModule) {
            return { name: dep, source: cachedModule }
          }

          const depModule = await this.fetcher(dep)
          if (!depModule) {
            throw new Error(`Module '${dep}' not found`)
          }

          // Cache the fetched module
          this.moduleCache.set(dep, depModule.module)
          return { name: dep, source: depModule.module }
        })

        const fetched = await Promise.all(fetchPromises)

        // Add all fetched modules to queue
        for (const result of fetched) {
          queue.push(result)
        }
      }
    }

    // Cache the built graph
    this.graphCache.set(cacheKey, { graph, sourceHash })

    return graph
  }

  /**
   * Detect circular dependencies in the graph
   * Returns the cycle path if found, null otherwise
   */
  detectCircular(graph: DependencyGraph): string[] | null {
    const WHITE = 0 // Unvisited
    const GRAY = 1  // Currently being visited (in current path)
    const BLACK = 2 // Fully visited

    const colors = new Map<string, number>()
    const parent = new Map<string, string>()

    // Initialize all nodes as unvisited
    for (const name of graph.nodes.keys()) {
      colors.set(name, WHITE)
    }

    const dfs = (node: string): string[] | null => {
      colors.set(node, GRAY)

      const nodeData = graph.nodes.get(node)
      if (nodeData) {
        for (const dep of nodeData.dependencies) {
          const depColor = colors.get(dep)

          if (depColor === GRAY) {
            // Found a cycle - reconstruct the path
            const cycle: string[] = [dep]
            let current = node
            while (current !== dep) {
              cycle.unshift(current)
              current = parent.get(current)!
            }
            cycle.unshift(dep)
            return cycle
          }

          if (depColor === WHITE) {
            parent.set(dep, node)
            const result = dfs(dep)
            if (result) return result
          }
        }
      }

      colors.set(node, BLACK)
      return null
    }

    // Start DFS from entry point
    const result = dfs(graph.entry)
    return result
  }

  /**
   * Get topologically sorted list of dependencies
   * Returns modules in order they should be loaded (dependencies first)
   */
  topologicalSort(graph: DependencyGraph): string[] {
    const result: string[] = []
    const visited = new Set<string>()

    const visit = (name: string) => {
      if (visited.has(name)) return
      visited.add(name)

      const node = graph.nodes.get(name)
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep)
        }
      }

      result.push(name)
    }

    visit(graph.entry)
    return result
  }

  /**
   * Resolve a module and all its dependencies
   * Returns the resolved module with imports transformed
   * Results are cached based on module name and source hash
   */
  async resolve(name: string, source: string): Promise<ResolvedModule> {
    // Check resolved cache first
    const sourceHash = this.hashSource(source)
    const cacheKey = `${name}:${sourceHash}`
    const cachedResolved = this.resolvedCache.get(cacheKey)
    if (cachedResolved) {
      // Check if cache entry is still valid (within TTL)
      if (Date.now() - cachedResolved.timestamp < DependencyResolver.CACHE_TTL) {
        return cachedResolved.result
      }
      // Remove stale entry
      this.resolvedCache.delete(cacheKey)
    }

    // Build dependency graph
    const graph = await this.buildGraph(name, source)

    // Check for circular dependencies
    const cycle = this.detectCircular(graph)
    if (cycle) {
      throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`)
    }

    // Get dependencies in topological order
    const sortedDeps = this.topologicalSort(graph)

    // Remove entry from dependencies list
    const dependencies = sortedDeps.filter(d => d !== name)

    // Build the resolved source by:
    // 1. Collecting all dependency exports
    // 2. Replacing imports with references to pre-resolved exports

    // Use string array for efficient concatenation
    const sourceParts: string[] = []

    // First, add all dependency modules with their imports rewritten
    for (const depName of dependencies) {
      const node = graph.nodes.get(depName)
      if (node && node.source) {
        // Rewrite imports to use resolved namespaces and strip exports
        const rewrittenSource = this.stripExportKeywords(this.rewriteImports(node.source))
        // Wrap in a scope to avoid name conflicts, expose exports via a namespace
        const safeName = this.toSafeName(depName)
        const exportNames = this.extractExportNames(node.source)
        sourceParts.push(`
// === Dependency: ${depName} ===
const ${safeName} = (() => {
${rewrittenSource}
return { ${exportNames.join(', ')} };
})();
`)
      }
    }

    // Now add the entry module with imports rewritten (keep exports for the entry module)
    const entryNode = graph.nodes.get(name)
    if (entryNode && entryNode.source) {
      const entrySource = this.rewriteImports(entryNode.source)

      sourceParts.push(`
// === Entry: ${name} ===
${entrySource}
`)
    }

    const resolvedSource = sourceParts.join('')

    const result: ResolvedModule = {
      name,
      source: resolvedSource,
      dependencies,
    }

    // Cache the result
    this.resolvedCache.set(cacheKey, { result, timestamp: Date.now() })

    return result
  }

  /**
   * Rewrite imports in module source to use resolved namespaces
   */
  private rewriteImports(source: string): string {
    const imports = this.parseImports(source)
    if (imports.length === 0) {
      return source
    }

    let rewritten = source
    for (const imp of imports) {
      const safeName = this.toSafeName(imp.moduleName)

      // Build replacement based on import type
      let replacement = ''
      if (imp.namedImports.length > 0) {
        replacement = `const { ${imp.namedImports.join(', ')} } = ${safeName};`
      } else if (imp.namespaceImport) {
        replacement = `const ${imp.namespaceImport} = ${safeName};`
      } else if (imp.defaultImport) {
        replacement = `const ${imp.defaultImport} = ${safeName}.default;`
      }

      rewritten = rewritten.replace(imp.statement, replacement)
    }
    return rewritten
  }

  /**
   * Strip export keywords from module source
   */
  private stripExportKeywords(source: string): string {
    return source
      .replace(/export\s+async\s+function\s+/g, 'async function ')
      .replace(/export\s+function\s+/g, 'function ')
      .replace(/export\s+const\s+/g, 'const ')
      .replace(/export\s+let\s+/g, 'let ')
      .replace(/export\s+class\s+/g, 'class ')
  }

  /**
   * Strip import statements from source
   */
  private stripImports(source: string): string {
    // Early return if no esm.do imports
    if (!HAS_ESM_IMPORT.test(source)) {
      return source
    }
    // Reset regex lastIndex and remove esm.do import statements
    STRIP_IMPORTS_REGEX.lastIndex = 0
    return source.replace(STRIP_IMPORTS_REGEX, '')
  }

  /**
   * Convert module name to safe JavaScript identifier
   * Results are cached for repeated lookups
   */
  private toSafeName(moduleName: string): string {
    // Check cache first
    const cached = this.safeNameCache.get(moduleName)
    if (cached) {
      return cached
    }

    // @scope/name -> _scope_name
    const safeName = moduleName
      .replace(/^@/, '_')
      .replace(/\//g, '_')
      .replace(/-/g, '_')

    // Cache the result
    this.safeNameCache.set(moduleName, safeName)
    return safeName
  }

  /**
   * Extract export names from module source
   * Results are cached based on source hash
   */
  private extractExportNames(source: string): string[] {
    // Check cache first
    const cacheKey = this.hashSource(source)
    const cached = this.exportNamesCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const names: string[] = []

    // Reset regex lastIndex values for fresh matching
    EXPORT_FUNC_REGEX.lastIndex = 0
    EXPORT_CONST_REGEX.lastIndex = 0
    EXPORT_LET_REGEX.lastIndex = 0
    EXPORT_CLASS_REGEX.lastIndex = 0

    // Match export function name
    let match
    while ((match = EXPORT_FUNC_REGEX.exec(source)) !== null) {
      names.push(match[1])
    }

    // Match export const name
    while ((match = EXPORT_CONST_REGEX.exec(source)) !== null) {
      names.push(match[1])
    }

    // Match export let name
    while ((match = EXPORT_LET_REGEX.exec(source)) !== null) {
      names.push(match[1])
    }

    // Match export class name
    while ((match = EXPORT_CLASS_REGEX.exec(source)) !== null) {
      names.push(match[1])
    }

    // Cache the result
    this.exportNamesCache.set(cacheKey, names)

    return names
  }
}

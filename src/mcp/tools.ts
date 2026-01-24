/**
 * MCP Tool Handlers for esm.do
 *
 * Implements the search/fetch/do pattern following the MCP server library.
 * Provides 3 core tools with the `esm` binding for module operations.
 */

/**
 * ESM interface representing the ESM class methods
 * This is the binding exposed in the DoScope for code execution
 */
export interface ESM {
  write(options: {
    name: string
    types?: string
    module?: string
    tests?: string
    script?: string
  }): Promise<{
    version: string
    name: string
    testResults?: { passed: number; failed: number }
    value?: unknown
  }>

  read(
    name: string,
    version?: string
  ): Promise<{
    name: string
    version: string
    types: string
    module: string
    tests?: string
    script?: string
  }>

  run(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{
    value: unknown
    logs: string[]
  }>

  test(
    name: string,
    filter?: string
  ): Promise<{
    passed: number
    failed: number
    results: Array<{ name: string; status: string; error?: string }>
  }>

  list(options?: {
    pattern?: string
    scope?: string
  }): Promise<Array<{ name: string; version: string }>>

  versions(
    name: string,
    limit?: number
  ): Promise<Array<{ version: string; message: string; date: string }>>

  diff(
    name: string,
    from: string,
    to: string
  ): Promise<{
    from: string
    to: string
    changes: Array<{ file: string; additions: number; deletions: number }>
    patch: string
  }>

  delete(
    name: string,
    force: boolean
  ): Promise<{
    deleted: boolean
    name?: string
  }>
}

/**
 * MCP Tool response format
 */
export interface MCPToolResponse {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Search result from module search
 */
export interface SearchResult {
  id: string
  title: string
  snippet?: string
  url?: string
  score?: number
  metadata?: Record<string, unknown>
}

/**
 * Fetch result from module fetch
 */
export interface FetchResult {
  content: string
  contentType?: string
  metadata?: Record<string, unknown>
}

/**
 * DoScope configuration for the do tool
 */
export interface DoScope {
  bindings: Record<string, unknown>
  types: string
  timeout?: number
}

/**
 * Tool definition interface
 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required?: string[]
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Search tool - searches modules by pattern/scope
 */
export const searchTool: MCPTool = {
  name: 'search',
  description: 'Search for ESM modules by pattern or scope. Returns matching modules with their versions.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query - can be a module name pattern or scope (e.g., "@math" or "add")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
      },
    },
    required: ['query'],
  },
}

/**
 * Fetch tool - gets module content by name
 */
export const fetchTool: MCPTool = {
  name: 'fetch',
  description: 'Retrieve an ESM module by name. Returns the module content including types, code, tests, and script.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Module identifier - name with optional version (e.g., "@math/add" or "@math/add@v1")',
      },
    },
    required: ['resource'],
  },
}

/**
 * Do tool - executes code with esm binding available
 */
export const doTool: MCPTool = {
  name: 'do',
  description: `Execute code in a sandboxed environment with access to the esm binding. The esm binding provides:
- esm.write(options) - Create or update a module
- esm.read(name, version?) - Read a module
- esm.run(name, args?) - Execute a module's script
- esm.test(name, filter?) - Run module tests
- esm.list(options?) - List modules
- esm.versions(name, limit?) - Get version history
- esm.diff(name, from, to) - Compare versions
- esm.delete(name, force) - Delete a module`,
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'TypeScript/JavaScript code to execute. Has access to the `esm` binding.',
      },
    },
    required: ['code'],
  },
}

/**
 * Registry of all MCP tools
 */
export const mcpTools: Record<string, MCPTool> = {
  search: searchTool,
  fetch: fetchTool,
  do: doTool,
  // Legacy tool names for backward compatibility
  esm_write: {
    name: 'esm_write',
    description: 'Create or update an ESM module with types, code, tests, and script',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The module name (e.g., "@math/add")' },
        types: { type: 'string', description: 'TypeScript declarations (.d.ts content)' },
        module: { type: 'string', description: 'ESM module implementation (.mjs content)' },
        tests: { type: 'string', description: 'Module test file content for validation' },
        script: { type: 'string', description: 'Executable script file for the module' },
      },
      required: ['name'],
    },
  },
  esm_read: {
    name: 'esm_read',
    description: 'Read an ESM module by name, optionally at a specific version',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The module name to read' },
        version: { type: 'string', description: 'Specific version hash to read (defaults to latest)' },
        file: { type: 'string', enum: ['types', 'module', 'tests', 'script'], description: 'Specific file to read from the module' },
      },
      required: ['name'],
    },
  },
  esm_run: {
    name: 'esm_run',
    description: 'Execute a module script and return the result',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The module name to run' },
        args: { type: 'object', description: 'Arguments to pass to the script execution' },
      },
      required: ['name'],
    },
  },
  esm_test: {
    name: 'esm_test',
    description: 'Run tests for an ESM module',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The module name to test' },
        filter: { type: 'string', description: 'Pattern to filter tests by name' },
      },
      required: ['name'],
    },
  },
  esm_list: {
    name: 'esm_list',
    description: 'List ESM modules matching a pattern or scope',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Filter modules by name pattern (e.g., "add")' },
        scope: { type: 'string', description: 'Filter modules by scope (e.g., "@math")' },
      },
    },
  },
  esm_versions: {
    name: 'esm_versions',
    description: 'Get version history for an ESM module',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The module name' },
        limit: { type: 'number', description: 'Maximum number of versions to return' },
      },
      required: ['name'],
    },
  },
  esm_diff: {
    name: 'esm_diff',
    description: 'Compare two versions of an ESM module',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The module name' },
        from: { type: 'string', description: 'Starting version hash' },
        to: { type: 'string', description: 'Ending version hash (defaults to HEAD)' },
      },
      required: ['name', 'from'],
    },
  },
  esm_delete: {
    name: 'esm_delete',
    description: 'Delete an ESM module',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The module name to delete' },
        force: { type: 'boolean', description: 'Force delete even if module has dependents' },
      },
      required: ['name'],
    },
  },
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Format a success response
 */
function successResponse(text: string): MCPToolResponse {
  return { content: [{ type: 'text', text }] }
}

/**
 * Format an error response
 */
function errorResponse(message: string, details?: Record<string, string>): MCPToolResponse {
  let text = `Error: ${message}`
  if (details && Object.keys(details).length > 0) {
    text += '\n\nDetails:'
    for (const [key, value] of Object.entries(details)) {
      text += `\n  - ${key}: ${value}`
    }
  }
  return { isError: true, content: [{ type: 'text', text }] }
}

// ============================================================================
// Search Handler
// ============================================================================

/**
 * Create a search handler for the search tool
 */
export function createSearchHandler(esm: ESM): (input: { query: string; limit?: number }) => Promise<MCPToolResponse> {
  return async (input) => {
    try {
      // Parse query to determine if it's a scope or pattern
      const query = input.query
      const isScope = query.startsWith('@')

      const options: { pattern?: string; scope?: string } = {}
      if (isScope) {
        options.scope = query
      } else {
        options.pattern = query
      }

      const results = await esm.list(options)

      // Apply limit if specified
      const limitedResults = input.limit ? results.slice(0, input.limit) : results

      // Transform to SearchResult format
      const searchResults: SearchResult[] = limitedResults.map((m) => ({
        id: m.name,
        title: m.name,
        snippet: `Version: ${m.version}`,
        metadata: { version: m.version },
      }))

      return successResponse(JSON.stringify(searchResults, null, 2))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      return errorResponse(message)
    }
  }
}

// ============================================================================
// Fetch Handler
// ============================================================================

/**
 * Parse a resource identifier into name and optional version
 */
function parseResourceId(resource: string): { name: string; version?: string } {
  // Format: @scope/name or @scope/name@version
  const atIndex = resource.lastIndexOf('@')
  if (atIndex > 0 && resource[atIndex - 1] !== '/') {
    // Has version suffix
    return {
      name: resource.slice(0, atIndex),
      version: resource.slice(atIndex + 1),
    }
  }
  return { name: resource }
}

/**
 * Create a fetch handler for the fetch tool
 */
export function createFetchHandler(esm: ESM): (input: { resource: string }) => Promise<MCPToolResponse> {
  return async (input) => {
    try {
      const { name, version } = parseResourceId(input.resource)
      const result = await esm.read(name, version)

      const text = `Module: ${result.name}\nVersion: ${result.version}\n\nTypes:\n${result.types}\n\nModule:\n${result.module}${result.tests ? `\n\nTests:\n${result.tests}` : ''}${result.script ? `\n\nScript:\n${result.script}` : ''}`

      return {
        content: [
          { type: 'text', text },
          { type: 'text', text: JSON.stringify({ metadata: { version: result.version } }, null, 2) },
        ],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      return errorResponse(message)
    }
  }
}

// ============================================================================
// Do Handler
// ============================================================================

/**
 * Create a DoScope with the esm binding
 */
export function createEsmDoScope(esm: ESM, timeout?: number): DoScope {
  const types = `
/** ESM binding for module operations */
declare const esm: {
  /** Create or update a module */
  write(options: {
    name: string;
    types?: string;
    module?: string;
    tests?: string;
    script?: string;
  }): Promise<{
    version: string;
    name: string;
    testResults?: { passed: number; failed: number };
    value?: unknown;
  }>;

  /** Read a module by name */
  read(name: string, version?: string): Promise<{
    name: string;
    version: string;
    types: string;
    module: string;
    tests?: string;
    script?: string;
  }>;

  /** Execute a module's script */
  run(name: string, args?: Record<string, unknown>): Promise<{
    value: unknown;
    logs: string[];
  }>;

  /** Run module tests */
  test(name: string, filter?: string): Promise<{
    passed: number;
    failed: number;
    results: Array<{ name: string; status: string; error?: string }>;
  }>;

  /** List modules */
  list(options?: { pattern?: string; scope?: string }): Promise<Array<{ name: string; version: string }>>;

  /** Get version history */
  versions(name: string, limit?: number): Promise<Array<{ version: string; message: string; date: string }>>;

  /** Compare two versions */
  diff(name: string, from: string, to: string): Promise<{
    from: string;
    to: string;
    changes: Array<{ file: string; additions: number; deletions: number }>;
    patch: string;
  }>;

  /** Delete a module */
  delete(name: string, force: boolean): Promise<{ deleted: boolean; name?: string }>;
};
`

  return {
    bindings: { esm },
    types,
    timeout: timeout ?? 30000,
  }
}

/**
 * Execute code in a sandboxed environment with the esm binding
 * This is a simplified implementation - in production, use ai-evaluate
 */
async function executeInSandbox(code: string, scope: DoScope): Promise<{ success: boolean; value?: unknown; error?: string; logs: string[] }> {
  const logs: string[] = []

  try {
    // Create a sandbox console
    const sandboxConsole = {
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(String).join(' ')}`),
      warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(String).join(' ')}`),
      info: (...args: unknown[]) => logs.push(`[INFO] ${args.map(String).join(' ')}`),
    }

    // Wrap code in async function to support top-level await
    const wrappedCode = `
      return (async () => {
        ${code}
      })()
    `

    // Create function with bindings as scope
    const fn = new Function('esm', 'console', wrappedCode)
    const result = await fn(scope.bindings.esm, sandboxConsole)

    return {
      success: true,
      value: result,
      logs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: message,
      logs,
    }
  }
}

/**
 * Create a do handler for the do tool
 */
export function createDoHandler(scope: DoScope): (input: { code: string }) => Promise<MCPToolResponse> {
  return async (input) => {
    try {
      const result = await executeInSandbox(input.code, scope)

      const output = {
        success: result.success,
        value: result.value,
        logs: result.logs,
        error: result.error,
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        isError: !result.success,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      return errorResponse(message)
    }
  }
}

// ============================================================================
// Legacy Tool Handlers (for backward compatibility)
// ============================================================================

/**
 * Validate required parameters
 */
function validateRequired(input: Record<string, unknown>, required: string[]): string | null {
  for (const param of required) {
    if (input[param] === undefined || input[param] === null || input[param] === '') {
      return `Required parameter "${param}" is missing or empty`
    }
  }
  return null
}

/**
 * Handle legacy esm_* tool calls
 */
async function handleLegacyToolCall(
  toolName: string,
  input: Record<string, unknown>,
  esm: ESM
): Promise<MCPToolResponse> {
  try {
    switch (toolName) {
      case 'esm_write': {
        const validationError = validateRequired(input, ['name'])
        if (validationError) {
          return errorResponse('Input validation failed', { name: validationError })
        }

        const writeOptions: { name: string; types?: string; module?: string; tests?: string; script?: string } = {
          name: input.name as string,
        }
        if (input.types) writeOptions.types = input.types as string
        if (input.module) writeOptions.module = input.module as string
        if (input.tests) writeOptions.tests = input.tests as string
        if (input.script) writeOptions.script = input.script as string

        const result = await esm.write(writeOptions)
        return successResponse(
          `Module written successfully.\nVersion: ${result.version}` +
            (result.testResults
              ? `\nTests: ${result.testResults.passed} passed, ${result.testResults.failed} failed`
              : '') +
            (result.value !== undefined ? `\nScript result: ${JSON.stringify(result.value)}` : '')
        )
      }

      case 'esm_read': {
        const validationError = validateRequired(input, ['name'])
        if (validationError) {
          return errorResponse('Input validation failed', { name: validationError })
        }

        const result = await esm.read(input.name as string, input.version as string | undefined)
        const file = input.file as string | undefined
        if (file) {
          const content = result[file as keyof typeof result]
          return successResponse(`${file}:\n${content}`)
        }
        return successResponse(
          `Module: ${result.name}\nVersion: ${result.version}\n\nTypes:\n${result.types}\n\nModule:\n${result.module}` +
            (result.tests ? `\n\nTests:\n${result.tests}` : '') +
            (result.script ? `\n\nScript:\n${result.script}` : '')
        )
      }

      case 'esm_run': {
        const validationError = validateRequired(input, ['name'])
        if (validationError) {
          return errorResponse('Input validation failed', { name: validationError })
        }

        const result = await esm.run(input.name as string, input.args as Record<string, unknown> | undefined)
        return successResponse(
          `Result: ${JSON.stringify(result.value)}` +
            (result.logs.length > 0 ? `\n\nLogs:\n${result.logs.join('\n')}` : '')
        )
      }

      case 'esm_test': {
        const validationError = validateRequired(input, ['name'])
        if (validationError) {
          return errorResponse('Input validation failed', { name: validationError })
        }

        const result = await esm.test(input.name as string, input.filter as string | undefined)
        const summary = `Tests: ${result.passed} passed, ${result.failed} failed`
        const details = result.results
          .map(
            (r) =>
              `  ${r.status === 'passed' ? '[PASS]' : '[FAIL]'} ${r.name}` + (r.error ? `\n    Error: ${r.error}` : '')
          )
          .join('\n')
        return successResponse(`${summary}\n\n${details}`)
      }

      case 'esm_list': {
        const pattern = input.pattern as string | undefined
        const scope = input.scope as string | undefined

        const listOptions: { pattern?: string; scope?: string } = {}
        if (pattern) listOptions.pattern = pattern
        if (scope) listOptions.scope = scope

        const result = await esm.list(listOptions)

        // Apply client-side filtering
        let filtered = result
        if (scope) {
          filtered = filtered.filter((m) => m.name.startsWith(scope))
        }
        if (pattern) {
          filtered = filtered.filter((m) => m.name.includes(pattern))
        }

        if (filtered.length === 0) {
          return successResponse('No modules found.')
        }
        const list = filtered.map((m) => `  ${m.name} (${m.version})`).join('\n')
        return successResponse(`Modules:\n${list}`)
      }

      case 'esm_versions': {
        const validationError = validateRequired(input, ['name'])
        if (validationError) {
          return errorResponse('Input validation failed', { name: validationError })
        }

        const result = await esm.versions(input.name as string, input.limit as number | undefined)
        if (result.length === 0) {
          return successResponse('No versions found.')
        }
        const list = result.map((v) => `  ${v.version} - ${v.message} (${v.date})`).join('\n')
        return successResponse(`Versions:\n${list}`)
      }

      case 'esm_diff': {
        const validationError = validateRequired(input, ['name', 'from'])
        if (validationError) {
          return errorResponse('Input validation failed', { fields: validationError })
        }

        const result = await esm.diff(input.name as string, input.from as string, (input.to as string) || 'HEAD')
        const summary = `Diff from ${result.from} to ${result.to}`
        const totalAdditions = result.changes.reduce((sum, c) => sum + c.additions, 0)
        const totalDeletions = result.changes.reduce((sum, c) => sum + c.deletions, 0)
        const stats = `${totalAdditions} additions, ${totalDeletions} deletions`
        const changes = result.changes.map((c) => `  ${c.file}: +${c.additions} -${c.deletions}`).join('\n')
        return successResponse(`${summary}\n${stats}\n\nChanges:\n${changes}\n\nPatch:\n${result.patch}`)
      }

      case 'esm_delete': {
        const validationError = validateRequired(input, ['name'])
        if (validationError) {
          return errorResponse('Input validation failed', { name: validationError })
        }

        const result = await esm.delete(input.name as string, (input.force as boolean) || false)
        return successResponse(`Module ${result.name || input.name} deleted successfully.`)
      }

      default:
        return errorResponse(`Unknown tool: ${toolName}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message)
  }
}

// ============================================================================
// Main Tool Call Handler
// ============================================================================

/**
 * Handle an MCP tool call
 * Supports both new (search/fetch/do) and legacy (esm_*) tool names
 */
export async function handleToolCall(
  toolName: string,
  input: Record<string, unknown>,
  esm: ESM
): Promise<MCPToolResponse> {
  // Check for unknown tool
  if (!mcpTools[toolName]) {
    return errorResponse(`Unknown tool: ${toolName}`)
  }

  try {
    // Handle new tools
    if (toolName === 'search') {
      const handler = createSearchHandler(esm)
      return handler(input as { query: string; limit?: number })
    }

    if (toolName === 'fetch') {
      const handler = createFetchHandler(esm)
      return handler(input as { resource: string })
    }

    if (toolName === 'do') {
      const scope = createEsmDoScope(esm)
      const handler = createDoHandler(scope)
      return handler(input as { code: string })
    }

    // Handle legacy tools
    return handleLegacyToolCall(toolName, input, esm)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message)
  }
}

// ============================================================================
// Tool Registration Helper
// ============================================================================

/**
 * Tool registry for MCP server
 */
export interface ToolRegistry {
  tools: Record<string, MCPTool>
  handlers: Record<string, (input: unknown) => Promise<MCPToolResponse>>
  register: (tool: MCPTool, handler: (input: unknown) => Promise<MCPToolResponse>) => void
  getHandler: (name: string) => ((input: unknown) => Promise<MCPToolResponse>) | undefined
  list: () => MCPTool[]
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  const tools: Record<string, MCPTool> = {}
  const handlers: Record<string, (input: unknown) => Promise<MCPToolResponse>> = {}

  return {
    tools,
    handlers,
    register(tool, handler) {
      tools[tool.name] = tool
      handlers[tool.name] = handler
    },
    getHandler(name) {
      return handlers[name]
    },
    list() {
      return Object.values(tools)
    },
  }
}

/**
 * Register the three core MCP tools (search, fetch, do) with esm binding
 */
export function registerTools(esm: ESM): ToolRegistry {
  const registry = createToolRegistry()

  // Register search tool
  const searchHandler = createSearchHandler(esm)
  registry.register(searchTool, searchHandler as (input: unknown) => Promise<MCPToolResponse>)

  // Register fetch tool
  const fetchHandler = createFetchHandler(esm)
  registry.register(fetchTool, fetchHandler as (input: unknown) => Promise<MCPToolResponse>)

  // Register do tool
  const scope = createEsmDoScope(esm)
  const doHandler = createDoHandler(scope)
  registry.register(doTool, doHandler as (input: unknown) => Promise<MCPToolResponse>)

  return registry
}

/**
 * Get tool definitions from a registry
 */
export function getToolDefinitions(registry: ToolRegistry): MCPTool[] {
  return registry.list()
}

/**
 * Create a tool call handler that routes to the correct tool
 */
export function createToolCallHandler(registry: ToolRegistry) {
  return async (toolName: string, input: unknown) => {
    const handler = registry.getHandler(toolName)

    if (!handler) {
      return errorResponse(`Unknown tool: ${toolName}`)
    }

    return handler(input)
  }
}

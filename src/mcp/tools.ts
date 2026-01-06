/**
 * MCP Tool Handlers for esm.do
 *
 * This module provides MCP-compatible tool definitions and handlers
 * for interacting with ESM modules.
 */

/**
 * ESM interface representing the ESM class methods
 * This allows for dependency injection and mocking in tests
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
 * Metadata for a tool property in the input schema
 */
export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object'
  description?: string
  enum?: string[]
}

/**
 * MCP Tool definition interface with proper typing
 */
export interface MCPTool<T extends Record<string, unknown> = Record<string, unknown>> {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<keyof T | string, PropertySchema>
    required?: (keyof T | string)[]
  }
  handler?: (input: T, esm: ESM) => Promise<MCPToolResponse>
}

/**
 * MCP Tool response interface
 */
export interface MCPToolResponse {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Validation error with detailed information
 */
export interface ValidationError {
  isValid: false
  error: string
  details?: Record<string, string>
}

/**
 * Successful validation result
 */
export interface ValidationSuccess {
  isValid: true
}

/**
 * Typed registry of all MCP tools with proper input schema validation
 */
export const mcpTools: Record<string, MCPTool<any>> = {
  esm_write: {
    name: 'esm_write',
    description: 'Create or update an ESM module with types, code, tests, and script',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The module name (e.g., "@math/add")',
        },
        types: {
          type: 'string',
          description: 'TypeScript declarations (.d.ts content)',
        },
        module: {
          type: 'string',
          description: 'ESM module implementation (.mjs content)',
        },
        tests: {
          type: 'string',
          description: 'Module test file content for validation',
        },
        script: {
          type: 'string',
          description: 'Executable script file for the module',
        },
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
        name: {
          type: 'string',
          description: 'The module name to read',
        },
        version: {
          type: 'string',
          description: 'Specific version hash to read (defaults to latest)',
        },
        file: {
          type: 'string',
          enum: ['types', 'module', 'tests', 'script'],
          description: 'Specific file to read from the module',
        },
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
        name: {
          type: 'string',
          description: 'The module name to run',
        },
        args: {
          type: 'object',
          description: 'Arguments to pass to the script execution',
        },
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
        name: {
          type: 'string',
          description: 'The module name to test',
        },
        filter: {
          type: 'string',
          description: 'Pattern to filter tests by name',
        },
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
        pattern: {
          type: 'string',
          description: 'Filter modules by name pattern (e.g., "add")',
        },
        scope: {
          type: 'string',
          description: 'Filter modules by scope (e.g., "@math")',
        },
      },
    },
  },

  esm_versions: {
    name: 'esm_versions',
    description: 'Get version history for an ESM module',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The module name',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of versions to return',
        },
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
        name: {
          type: 'string',
          description: 'The module name',
        },
        from: {
          type: 'string',
          description: 'Starting version hash',
        },
        to: {
          type: 'string',
          description: 'Ending version hash (defaults to HEAD)',
        },
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
        name: {
          type: 'string',
          description: 'The module name to delete',
        },
        force: {
          type: 'boolean',
          description: 'Force delete even if module has dependents',
        },
      },
      required: ['name'],
    },
  },
}

/**
 * Validate input against a tool's schema with detailed error reporting
 */
function validateInput(
  toolName: string,
  input: Record<string, unknown>
): ValidationError | ValidationSuccess {
  const tool = mcpTools[toolName]
  if (!tool) {
    return {
      isValid: false,
      error: `Unknown tool: ${toolName}`,
    }
  }

  const errors: Record<string, string> = {}
  const required = tool.inputSchema.required || []

  // Validate required parameters
  for (const param of required) {
    const value = input[param]
    if (value === undefined || value === null || value === '') {
      errors[String(param)] = `Required parameter "${String(param)}" is missing or empty`
    }
  }

  // Validate parameter types against schema
  for (const [paramName, paramValue] of Object.entries(input)) {
    const schema = tool.inputSchema.properties[paramName]
    if (!schema) continue

    // Type validation
    const actualType = Array.isArray(paramValue) ? 'array' : typeof paramValue
    if (schema.type !== 'object' && actualType !== schema.type) {
      errors[paramName] = `Parameter "${paramName}" must be of type ${schema.type}, got ${actualType}`
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(String(paramValue))) {
      errors[paramName] = `Parameter "${paramName}" must be one of: ${schema.enum.join(', ')}`
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      isValid: false,
      error: `Input validation failed`,
      details: errors,
    }
  }

  return { isValid: true }
}

/**
 * Format an error for MCP response with proper structure
 */
function formatMCPError(message: string, details?: Record<string, string>): MCPToolResponse {
  let text = `Error: ${message}`

  if (details && Object.keys(details).length > 0) {
    text += '\n\nDetails:'
    for (const [key, value] of Object.entries(details)) {
      text += `\n  - ${key}: ${value}`
    }
  }

  return {
    isError: true,
    content: [{ type: 'text', text }],
  }
}

/**
 * Format a success response for MCP
 */
function formatMCPSuccess(text: string): MCPToolResponse {
  return {
    content: [{ type: 'text', text }],
  }
}

// Aliases for cleaner handler code
const successResponse = formatMCPSuccess
const errorResponse = formatMCPError

/**
 * Validation middleware for tool input
 */
function createValidationMiddleware(toolName: string) {
  return (input: Record<string, unknown>): ValidationError | ValidationSuccess => {
    return validateInput(toolName, input)
  }
}

/**
 * Handle an MCP tool call with validation middleware
 */
export async function handleToolCall(
  toolName: string,
  input: Record<string, unknown>,
  esm: ESM
): Promise<MCPToolResponse> {
  // Check for unknown tool
  if (!mcpTools[toolName]) {
    return formatMCPError(`Unknown tool: ${toolName}`)
  }

  // Apply validation middleware
  const validate = createValidationMiddleware(toolName)
  const validation = validate(input)
  if (!validation.isValid) {
    return formatMCPError(validation.error, validation.details)
  }

  try {
    switch (toolName) {
      case 'esm_write': {
        const result = await esm.write({
          name: input.name as string,
          types: input.types as string | undefined,
          module: input.module as string | undefined,
          tests: input.tests as string | undefined,
          script: input.script as string | undefined,
        })
        return successResponse(
          `Module written successfully.\nVersion: ${result.version}` +
            (result.testResults
              ? `\nTests: ${result.testResults.passed} passed, ${result.testResults.failed} failed`
              : '') +
            (result.value !== undefined ? `\nScript result: ${JSON.stringify(result.value)}` : '')
        )
      }

      case 'esm_read': {
        const result = await esm.read(
          input.name as string,
          input.version as string | undefined
        )
        const file = input.file as string | undefined
        if (file) {
          const content = result[file as keyof typeof result]
          return successResponse(`${file}:\n${content}`)
        }
        return successResponse(
          `Module: ${result.name}\n` +
            `Version: ${result.version}\n\n` +
            `Types:\n${result.types}\n\n` +
            `Module:\n${result.module}` +
            (result.tests ? `\n\nTests:\n${result.tests}` : '') +
            (result.script ? `\n\nScript:\n${result.script}` : '')
        )
      }

      case 'esm_run': {
        const result = await esm.run(
          input.name as string,
          input.args as Record<string, unknown> | undefined
        )
        return successResponse(
          `Result: ${JSON.stringify(result.value)}` +
            (result.logs.length > 0 ? `\n\nLogs:\n${result.logs.join('\n')}` : '')
        )
      }

      case 'esm_test': {
        const result = await esm.test(
          input.name as string,
          input.filter as string | undefined
        )
        const summary = `Tests: ${result.passed} passed, ${result.failed} failed`
        const details = result.results
          .map(
            (r) =>
              `  ${r.status === 'passed' ? '[PASS]' : '[FAIL]'} ${r.name}` +
              (r.error ? `\n    Error: ${r.error}` : '')
          )
          .join('\n')
        return successResponse(`${summary}\n\n${details}`)
      }

      case 'esm_list': {
        const pattern = input.pattern as string | undefined
        const scope = input.scope as string | undefined

        // Pass filter parameters to esm.list
        const result = await esm.list({ pattern, scope })

        // Apply client-side filtering for handlers that don't implement filtering
        let filtered = result

        // Filter by scope (module name starts with scope)
        if (scope) {
          filtered = filtered.filter((m) => m.name.startsWith(scope))
        }

        // Filter by pattern (substring match on module name)
        if (pattern) {
          filtered = filtered.filter((m) => m.name.includes(pattern))
        }

        if (filtered.length === 0) {
          return successResponse('No modules found.')
        }
        const list = filtered
          .map((m) => `  ${m.name} (${m.version})`)
          .join('\n')
        return successResponse(`Modules:\n${list}`)
      }

      case 'esm_versions': {
        const result = await esm.versions(
          input.name as string,
          input.limit as number | undefined
        )
        if (result.length === 0) {
          return successResponse('No versions found.')
        }
        const list = result
          .map((v) => `  ${v.version} - ${v.message} (${v.date})`)
          .join('\n')
        return successResponse(`Versions:\n${list}`)
      }

      case 'esm_diff': {
        const result = await esm.diff(
          input.name as string,
          input.from as string,
          (input.to as string) || 'HEAD'
        )
        const summary = `Diff from ${result.from} to ${result.to}`

        // Calculate total additions and deletions
        const totalAdditions = result.changes.reduce((sum, c) => sum + c.additions, 0)
        const totalDeletions = result.changes.reduce((sum, c) => sum + c.deletions, 0)
        const stats = `${totalAdditions} additions, ${totalDeletions} deletions`

        const changes = result.changes
          .map(
            (c) =>
              `  ${c.file}: +${c.additions} -${c.deletions}`
          )
          .join('\n')
        return successResponse(
          `${summary}\n${stats}\n\nChanges:\n${changes}\n\nPatch:\n${result.patch}`
        )
      }

      case 'esm_delete': {
        const result = await esm.delete(
          input.name as string,
          (input.force as boolean) || false
        )
        return successResponse(
          `Module ${result.name || input.name} deleted successfully.`
        )
      }

      default:
        return errorResponse(`Unknown tool: ${toolName}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message)
  }
}

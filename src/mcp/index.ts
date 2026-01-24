/**
 * MCP Module Exports
 *
 * Provides the 3-tool MCP architecture (search, fetch, do) for esm.do.
 * Each tool operates with the `esm` binding for module operations.
 */

// Tool definitions
export { searchTool, fetchTool, doTool, mcpTools } from './tools.js'

// Tool handlers
export { createSearchHandler, createFetchHandler, createDoHandler, handleToolCall } from './tools.js'

// DoScope
export { createEsmDoScope } from './tools.js'

// Tool registry
export { createToolRegistry, registerTools, getToolDefinitions, createToolCallHandler } from './tools.js'

// Types
export type { ESM, MCPTool, MCPToolResponse, DoScope, SearchResult, FetchResult, ToolRegistry } from './tools.js'

// Server
export { MCPServer, createMCPServer } from './server.js'

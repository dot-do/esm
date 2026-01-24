/**
 * MCP Module Exports
 *
 * Exports MCP tool definitions, handlers, and server for esm.do
 * Uses the search/fetch/do pattern with esm binding
 */

// Core tools and handlers
export {
  mcpTools,
  handleToolCall,
  // New pattern tools
  searchTool,
  fetchTool,
  doTool,
  // Handlers
  createSearchHandler,
  createFetchHandler,
  createDoHandler,
  // DoScope creation
  createEsmDoScope,
  // Tool registry
  createToolRegistry,
  registerTools,
  getToolDefinitions,
  createToolCallHandler,
} from './tools.js'

// Types
export type {
  ESM,
  MCPTool,
  MCPToolResponse,
  DoScope,
  SearchResult,
  FetchResult,
  ToolRegistry,
} from './tools.js'

// Server
export { MCPServer, createMCPServer } from './server.js'

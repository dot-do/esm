#!/usr/bin/env node
/**
 * MCP Server for esm.do
 *
 * Full Model Context Protocol server implementation that exposes esm.do
 * functionality as MCP tools for AI assistants like Claude.
 *
 * Usage:
 *   npx esm-mcp
 *   node dist/mcp/server.js
 *
 * Protocol: JSON-RPC 2.0 over stdio
 */

import { mcpTools, handleToolCall, type ESM as ESMInterface } from './tools.js'
import { ESM } from '../esm.js'
import * as readline from 'node:readline'

/**
 * MCP Protocol Version
 */
const MCP_VERSION = '2024-11-05'

/**
 * Create an ESMInterface adapter from an ESM instance
 * This bridges the ESM class API to the ESMInterface expected by MCP tools
 */
function createESMAdapter(esm: ESM): ESMInterface {
  return {
    async write(options) {
      const result = await esm.write({
        name: options.name,
        types: options.types ?? '',
        module: options.module ?? '',
        tests: options.tests,
        script: options.script,
      })
      const response: {
        version: string
        name: string
        testResults?: { passed: number; failed: number }
        value?: unknown
      } = {
        version: result.version,
        name: result.name,
      }
      if (result.testResults) {
        response.testResults = { passed: result.testResults.passed, failed: result.testResults.failed }
      }
      if (result.value !== undefined) {
        response.value = result.value
      }
      return response
    },
    async read(name, version) {
      const result = await esm.read(name, version)
      const response: {
        name: string
        version: string
        types: string
        module: string
        tests?: string
        script?: string
      } = {
        name: result.name,
        version: result.version,
        types: result.types,
        module: result.module,
      }
      if (result.tests) {
        response.tests = result.tests
      }
      if (result.script) {
        response.script = result.script
      }
      return response
    },
    async run(name, args) {
      const result = await esm.run(name, args)
      return {
        value: result.value,
        logs: [...result.logs],
      }
    },
    async test(name, filter) {
      const testArg = filter ? { name, filter } : { name }
      const result = await esm.test(testArg)
      return {
        passed: result.passed,
        failed: result.failed,
        results: result.results.map((r) => {
          const item: { name: string; status: string; error?: string } = {
            name: r.name,
            status: r.passed ? 'passed' : 'failed',
          }
          if (r.error) {
            item.error = r.error
          }
          return item
        }),
      }
    },
    async list(options) {
      const names = await esm.list(options?.pattern)
      // For now, return just names with empty versions since ESM.list returns string[]
      return names.map((name) => ({ name, version: '' }))
    },
    async versions(name, limit) {
      const versions = await esm.versions(name, limit)
      return versions.map((v) => ({
        version: v.version,
        message: v.message,
        date: v.timestamp.toISOString(),
      }))
    },
    async diff(name, from, to) {
      const result = await esm.diff(name, from, to)
      return {
        from: result.from,
        to: result.to,
        changes: result.changes.map((c) => ({ file: c.file, additions: c.additions, deletions: c.deletions })),
        patch: result.patch,
      }
    },
    async delete(name, _force) {
      const result = await esm.delete(name)
      return {
        deleted: result.deleted,
        name: result.name,
      }
    },
  }
}

/**
 * Server information
 */
const SERVER_INFO = {
  name: 'esm-mcp',
  version: '0.0.1',
}

/**
 * JSON-RPC 2.0 Request interface
 */
interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

/**
 * JSON-RPC 2.0 Response interface
 */
interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * Standard JSON-RPC 2.0 error codes
 */
const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
}

/**
 * MCP Server class
 * Implements the Model Context Protocol over stdio
 */
export class MCPServer {
  private esm: ESMInterface
  private initialized = false
  private rl: readline.Interface | null = null

  constructor(esm?: ESMInterface | ESM) {
    // Use provided ESM instance or create a new one
    if (esm) {
      // Check if it's already an ESMInterface (has all required methods with correct signatures)
      if ('write' in esm && 'read' in esm && 'run' in esm && esm instanceof ESM) {
        // It's an ESM instance, wrap it in an adapter
        this.esm = createESMAdapter(esm)
      } else {
        // It's already an ESMInterface
        this.esm = esm as ESMInterface
      }
    } else {
      // Create a new ESM instance and wrap it
      this.esm = createESMAdapter(ESM.create())
    }
  }

  /**
   * Send a JSON-RPC response to stdout
   */
  private sendResponse(response: JSONRPCResponse): void {
    const json = JSON.stringify(response)
    process.stdout.write(json + '\n')
  }

  /**
   * Send an error response
   */
  private sendError(id: string | number | null, code: number, message: string, data?: unknown): void {
    this.sendResponse({
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    })
  }

  /**
   * Handle the initialize request
   */
  private handleInitialize(id: string | number | null, params: Record<string, unknown>): void {
    const clientInfo = params.clientInfo as { name?: string; version?: string } | undefined

    // Log client info for debugging
    if (clientInfo) {
      this.log(`Client connected: ${clientInfo.name || 'unknown'} v${clientInfo.version || 'unknown'}`)
    }

    this.initialized = true

    this.sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: MCP_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: SERVER_INFO,
      },
    })
  }

  /**
   * Handle the initialized notification
   */
  private handleInitialized(): void {
    this.log('Server initialized successfully')
  }

  /**
   * Handle the tools/list request
   */
  private handleToolsList(id: string | number | null): void {
    const tools = Object.values(mcpTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))

    this.sendResponse({
      jsonrpc: '2.0',
      id,
      result: { tools },
    })
  }

  /**
   * Handle the tools/call request
   */
  private async handleToolsCall(
    id: string | number | null,
    params: Record<string, unknown>
  ): Promise<void> {
    const name = params.name as string
    const args = (params.arguments as Record<string, unknown>) || {}

    if (!name) {
      this.sendError(id, ErrorCodes.InvalidParams, 'Missing tool name')
      return
    }

    try {
      const result = await handleToolCall(name, args, this.esm)
      this.sendResponse({
        jsonrpc: '2.0',
        id,
        result,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        },
      })
    }
  }

  /**
   * Handle ping request (health check)
   */
  private handlePing(id: string | number | null): void {
    this.sendResponse({
      jsonrpc: '2.0',
      id,
      result: {},
    })
  }

  /**
   * Handle a JSON-RPC request
   */
  private async handleRequest(request: JSONRPCRequest): Promise<void> {
    const { id, method, params } = request

    // Handle notifications (no id means no response expected)
    if (id === undefined) {
      if (method === 'notifications/initialized') {
        this.handleInitialized()
      }
      // Other notifications are silently ignored
      return
    }

    // Check if server is initialized for non-initialize methods
    if (!this.initialized && method !== 'initialize') {
      this.sendError(id, ErrorCodes.InvalidRequest, 'Server not initialized')
      return
    }

    switch (method) {
      case 'initialize':
        this.handleInitialize(id, params || {})
        break

      case 'ping':
        this.handlePing(id)
        break

      case 'tools/list':
        this.handleToolsList(id)
        break

      case 'tools/call':
        await this.handleToolsCall(id, params || {})
        break

      default:
        this.sendError(id, ErrorCodes.MethodNotFound, `Unknown method: ${method}`)
    }
  }

  /**
   * Parse and handle a line of input
   */
  private async handleLine(line: string): Promise<void> {
    // Skip empty lines
    if (!line.trim()) {
      return
    }

    try {
      const request = JSON.parse(line) as JSONRPCRequest

      // Validate JSON-RPC 2.0 format
      if (request.jsonrpc !== '2.0') {
        this.sendError(null, ErrorCodes.InvalidRequest, 'Invalid JSON-RPC version')
        return
      }

      if (!request.method || typeof request.method !== 'string') {
        this.sendError(request.id ?? null, ErrorCodes.InvalidRequest, 'Missing or invalid method')
        return
      }

      await this.handleRequest(request)
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.sendError(null, ErrorCodes.ParseError, 'Parse error: Invalid JSON')
      } else {
        const message = error instanceof Error ? error.message : String(error)
        this.sendError(null, ErrorCodes.InternalError, `Internal error: ${message}`)
      }
    }
  }

  /**
   * Log a message to stderr (for debugging)
   */
  private log(message: string): void {
    process.stderr.write(`[esm-mcp] ${message}\n`)
  }

  /**
   * Start the MCP server
   */
  start(): void {
    this.log('Starting esm.do MCP server...')

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    })

    this.rl.on('line', (line) => {
      this.handleLine(line).catch((error) => {
        this.log(`Error handling line: ${error}`)
      })
    })

    this.rl.on('close', () => {
      this.log('Server shutting down')
      process.exit(0)
    })

    // Handle process signals
    process.on('SIGINT', () => {
      this.log('Received SIGINT, shutting down')
      this.stop()
    })

    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, shutting down')
      this.stop()
    })
  }

  /**
   * Stop the MCP server
   */
  stop(): void {
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
  }
}

/**
 * Create and return an MCP server instance
 */
export function createMCPServer(esm?: ESMInterface): MCPServer {
  return new MCPServer(esm)
}

// Run server if this is the main module
const isMain = process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')
if (isMain) {
  const server = createMCPServer()
  server.start()
}

export default MCPServer

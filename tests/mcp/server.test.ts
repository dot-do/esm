import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MCPServer, createMCPServer } from '../../src/mcp/server.js'
import type { ESM } from '../../src/mcp/tools.js'

/**
 * MCP Server Tests
 *
 * These tests verify the MCP server implementation handles
 * the Model Context Protocol correctly.
 */

describe('MCP Server', () => {
  let mockEsm: ESM
  let server: MCPServer
  let stdoutWrite: ReturnType<typeof vi.spyOn>
  let stderrWrite: ReturnType<typeof vi.spyOn>
  let outputs: string[]

  beforeEach(() => {
    outputs = []

    // Mock ESM interface
    mockEsm = {
      write: vi.fn().mockResolvedValue({
        version: 'abc123',
        name: '@test/module',
        testResults: { passed: 2, failed: 0 },
      }),
      read: vi.fn().mockResolvedValue({
        name: '@test/module',
        version: 'abc123',
        types: 'export declare function test(): void;',
        module: 'export function test() {}',
        tests: 'it("works", () => {});',
        script: 'return test();',
      }),
      run: vi.fn().mockResolvedValue({
        value: 42,
        logs: ['log1', 'log2'],
      }),
      test: vi.fn().mockResolvedValue({
        passed: 3,
        failed: 0,
        results: [
          { name: 'test 1', status: 'passed' },
          { name: 'test 2', status: 'passed' },
          { name: 'test 3', status: 'passed' },
        ],
      }),
      list: vi.fn().mockResolvedValue([
        { name: '@test/a', version: 'v1' },
        { name: '@test/b', version: 'v2' },
      ]),
      versions: vi.fn().mockResolvedValue([
        { version: 'abc123', message: 'Initial', date: '2024-01-01' },
        { version: 'def456', message: 'Update', date: '2024-01-02' },
      ]),
      diff: vi.fn().mockResolvedValue({
        from: 'abc123',
        to: 'def456',
        changes: [{ file: 'index.mjs', additions: 5, deletions: 2 }],
        patch: '--- a/index.mjs\n+++ b/index.mjs\n',
      }),
      delete: vi.fn().mockResolvedValue({
        deleted: true,
        name: '@test/module',
      }),
    }

    // Create server with mock ESM
    server = new MCPServer(mockEsm)

    // Mock stdout to capture responses
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      outputs.push(String(chunk))
      return true
    })

    // Mock stderr for logging (silent in tests)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutWrite.mockRestore()
    stderrWrite.mockRestore()
  })

  /**
   * Helper to simulate sending a JSON-RPC request to the server
   */
  function simulateRequest(request: object): void {
    const line = JSON.stringify(request)
    // Access private method for testing
    ;(server as unknown as { handleLine: (line: string) => Promise<void> }).handleLine(line)
  }

  /**
   * Helper to get the last JSON response
   */
  function getLastResponse(): object {
    const lastOutput = outputs[outputs.length - 1]
    if (!lastOutput) {
      throw new Error('No output received')
    }
    return JSON.parse(lastOutput.trim())
  }

  /**
   * Helper to wait for async response
   */
  async function waitForResponse(): Promise<object> {
    // Wait for any pending promises
    await new Promise((resolve) => setTimeout(resolve, 10))
    return getLastResponse()
  }

  describe('createMCPServer', () => {
    it('should create a server instance', () => {
      const srv = createMCPServer()
      expect(srv).toBeInstanceOf(MCPServer)
    })

    it('should create a server with custom ESM', () => {
      const customEsm = {} as ESM
      const srv = createMCPServer(customEsm)
      expect(srv).toBeInstanceOf(MCPServer)
    })
  })

  describe('JSON-RPC protocol', () => {
    it('should reject invalid JSON', async () => {
      ;(server as unknown as { handleLine: (line: string) => Promise<void> }).handleLine(
        'not valid json'
      )
      await waitForResponse()

      const response = getLastResponse() as { error?: { code: number } }
      expect(response.error?.code).toBe(-32700) // Parse Error
    })

    it('should reject invalid JSON-RPC version', async () => {
      simulateRequest({
        jsonrpc: '1.0',
        id: 1,
        method: 'test',
      })
      await waitForResponse()

      const response = getLastResponse() as { error?: { code: number } }
      expect(response.error?.code).toBe(-32600) // Invalid Request
    })

    it('should reject missing method', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
      })
      await waitForResponse()

      const response = getLastResponse() as { error?: { code: number } }
      expect(response.error?.code).toBe(-32600) // Invalid Request
    })

    it('should reject requests before initialization', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      })
      await waitForResponse()

      const response = getLastResponse() as { error?: { message: string } }
      expect(response.error?.message).toContain('not initialized')
    })
  })

  describe('initialize', () => {
    it('should handle initialize request', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        jsonrpc: string
        id: number
        result: {
          protocolVersion: string
          capabilities: { tools: object }
          serverInfo: { name: string; version: string }
        }
      }
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(1)
      expect(response.result.protocolVersion).toBe('2024-11-05')
      expect(response.result.capabilities.tools).toBeDefined()
      expect(response.result.serverInfo.name).toBe('esm-mcp')
    })

    it('should handle initialize without client info', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      })
      await waitForResponse()

      const response = getLastResponse() as { result?: object }
      expect(response.result).toBeDefined()
    })
  })

  describe('ping', () => {
    it('should respond to ping after initialization', async () => {
      // Initialize first
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      })
      await waitForResponse()

      // Then ping
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
      })
      await waitForResponse()

      const response = getLastResponse() as { id: number; result: object }
      expect(response.id).toBe(2)
      expect(response.result).toEqual({})
    })
  })

  describe('tools/list', () => {
    beforeEach(async () => {
      // Initialize server
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      })
      await waitForResponse()
    })

    it('should list all available tools', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { tools: Array<{ name: string; description: string; inputSchema: object }> }
      }
      expect(response.result.tools).toBeDefined()
      expect(Array.isArray(response.result.tools)).toBe(true)

      const toolNames = response.result.tools.map((t) => t.name)
      // New 3-tool architecture: search, fetch, do
      expect(toolNames).toContain('search')
      expect(toolNames).toContain('fetch')
      expect(toolNames).toContain('do')
      expect(toolNames).toHaveLength(3)
    })

    it('should include tool descriptions and schemas', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { tools: Array<{ name: string; description: string; inputSchema: object }> }
      }
      const searchTool = response.result.tools.find((t) => t.name === 'search')
      expect(searchTool).toBeDefined()
      expect(searchTool?.description).toBeTruthy()
      expect(searchTool?.inputSchema).toBeDefined()
    })
  })

  describe('tools/call', () => {
    beforeEach(async () => {
      // Initialize server
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      })
      await waitForResponse()
    })

    it('should call search tool', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: {
            query: '@test',
          },
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { content: Array<{ type: string; text: string }> }
      }
      expect(response.result.content).toBeDefined()
      expect(response.result.content[0].type).toBe('text')
      expect(response.result.content[0].text).toContain('@test/a')
      expect(mockEsm.list).toHaveBeenCalled()
    })

    it('should call fetch tool', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'fetch',
          arguments: {
            resource: '@test/module',
          },
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { content: Array<{ type: string; text: string }> }
      }
      expect(response.result.content[0].text).toContain('@test/module')
      expect(response.result.content[0].text).toContain('abc123')
      expect(mockEsm.read).toHaveBeenCalledWith('@test/module', undefined)
    })

    it('should call do tool', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'do',
          arguments: {
            code: 'return 1 + 2',
          },
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { content: Array<{ type: string; text: string }> }
      }
      expect(response.result.content[0].text).toContain('3')
      expect(response.result.content[0].text).toContain('success')
    })

    it('should call do tool with esm binding', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'do',
          arguments: {
            code: 'return await esm.list()',
          },
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { content: Array<{ type: string; text: string }> }
      }
      expect(mockEsm.list).toHaveBeenCalled()
    })

    it('should return error for unknown tool', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { isError: boolean; content: Array<{ text: string }> }
      }
      expect(response.result.isError).toBe(true)
      expect(response.result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_read tool', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'esm_read',
          arguments: {
            name: '@test/module',
          },
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { isError: boolean; content: Array<{ text: string }> }
      }
      expect(response.result.isError).toBe(true)
      expect(response.result.content[0].text).toContain('Unknown tool')
    })

    it('should return error when tool name is missing', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          arguments: {},
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        error: { code: number; message: string }
      }
      expect(response.error.code).toBe(-32602) // Invalid params
      expect(response.error.message).toContain('Missing tool name')
    })

    it('should handle tool execution errors gracefully', async () => {
      mockEsm.read = vi.fn().mockRejectedValue(new Error('Module not found'))

      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'fetch',
          arguments: {
            resource: '@nonexistent/module',
          },
        },
      })
      await waitForResponse()

      const response = getLastResponse() as {
        result: { isError: boolean; content: Array<{ text: string }> }
      }
      expect(response.result.isError).toBe(true)
      expect(response.result.content[0].text).toContain('not found')
    })
  })

  describe('unknown method', () => {
    beforeEach(async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      })
      await waitForResponse()
    })

    it('should return method not found error', async () => {
      simulateRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'unknown/method',
      })
      await waitForResponse()

      const response = getLastResponse() as {
        error: { code: number; message: string }
      }
      expect(response.error.code).toBe(-32601) // Method not found
      expect(response.error.message).toContain('Unknown method')
    })
  })

  describe('notifications', () => {
    it('should silently handle notifications without id', async () => {
      // Initialize first
      simulateRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      })
      await waitForResponse()
      const outputCountAfterInit = outputs.length

      // Send notification (no id)
      simulateRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      })
      await new Promise((resolve) => setTimeout(resolve, 10))

      // No response should be sent for notifications
      expect(outputs.length).toBe(outputCountAfterInit)
    })
  })

  describe('empty lines', () => {
    it('should ignore empty lines', async () => {
      const outputCountBefore = outputs.length
      ;(server as unknown as { handleLine: (line: string) => Promise<void> }).handleLine('')
      ;(server as unknown as { handleLine: (line: string) => Promise<void> }).handleLine('   ')
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(outputs.length).toBe(outputCountBefore)
    })
  })
})

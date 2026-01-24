import { describe, it, expect, vi } from 'vitest'
import { mcpTools, handleToolCall, searchTool, fetchTool, doTool, createEsmDoScope } from '../../src/mcp/tools.js'
import type { ESM, SearchResult, FetchResult } from '../../src/mcp/tools.js'

/**
 * MCP Tools Tests
 *
 * Tests for the 3-tool architecture: search, fetch, do.
 * Verifies tool definitions, handlers, and rejection of unknown tools.
 */

describe('MCP Tools', () => {
  describe('mcpTools registry', () => {
    it('should export exactly 3 tools', () => {
      expect(Object.keys(mcpTools)).toHaveLength(3)
    })

    it('should have search, fetch, and do tools', () => {
      expect(mcpTools).toHaveProperty('search')
      expect(mcpTools).toHaveProperty('fetch')
      expect(mcpTools).toHaveProperty('do')
    })

    it('should have valid tool definitions with name, description, inputSchema', () => {
      const toolNames = ['search', 'fetch', 'do']

      for (const name of toolNames) {
        const tool = mcpTools[name]
        expect(tool.name).toBe(name)
        expect(typeof tool.description).toBe('string')
        expect(tool.description.length).toBeGreaterThan(0)
        expect(tool.inputSchema).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
      }
    })
  })

  describe('search tool', () => {
    it('should have correct name', () => {
      expect(searchTool.name).toBe('search')
    })

    describe('inputSchema', () => {
      it('should require query parameter', () => {
        const schema = mcpTools.search.inputSchema
        expect(schema.required).toContain('query')
        expect(schema.properties.query.type).toBe('string')
      })

      it('should accept optional limit parameter', () => {
        const schema = mcpTools.search.inputSchema
        expect(schema.properties.limit).toBeDefined()
        expect(schema.properties.limit.type).toBe('number')
      })
    })

    describe('handler', () => {
      it('should call esm.list and return search results', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@math/add', version: 'abc123' },
            { name: '@math/subtract', version: 'def456' },
          ]),
        } as unknown as ESM

        const result = await handleToolCall('search', {
          query: 'add',
        }, mockEsm)

        expect(mockEsm.list).toHaveBeenCalled()
        expect(result.content[0].text).toContain('@math/add')
      })

      it('should search by scope when query starts with @', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@math/add', version: 'abc123' },
          ]),
        } as unknown as ESM

        await handleToolCall('search', {
          query: '@math',
        }, mockEsm)

        expect(mockEsm.list).toHaveBeenCalledWith({ scope: '@math' })
      })

      it('should search by pattern when query does not start with @', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@utils/add-helper', version: 'abc123' },
          ]),
        } as unknown as ESM

        await handleToolCall('search', {
          query: 'add',
        }, mockEsm)

        expect(mockEsm.list).toHaveBeenCalledWith({ pattern: 'add' })
      })

      it('should respect limit parameter', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@a/one', version: 'v1' },
            { name: '@a/two', version: 'v2' },
            { name: '@a/three', version: 'v3' },
          ]),
        } as unknown as ESM

        const result = await handleToolCall('search', {
          query: 'a',
          limit: 2,
        }, mockEsm)

        const parsed = JSON.parse(result.content[0].text)
        expect(parsed).toHaveLength(2)
      })
    })
  })

  describe('fetch tool', () => {
    it('should have correct name', () => {
      expect(fetchTool.name).toBe('fetch')
    })

    describe('inputSchema', () => {
      it('should require resource parameter', () => {
        const schema = mcpTools.fetch.inputSchema
        expect(schema.required).toContain('resource')
        expect(schema.properties.resource.type).toBe('string')
      })
    })

    describe('handler', () => {
      it('should call esm.read with module name', async () => {
        const mockEsm = {
          read: vi.fn().mockResolvedValue({
            name: '@math/add',
            version: 'abc123',
            types: 'export declare function add(a: number, b: number): number',
            module: 'export function add(a, b) { return a + b }',
          }),
        } as unknown as ESM

        const result = await handleToolCall('fetch', {
          resource: '@math/add',
        }, mockEsm)

        expect(mockEsm.read).toHaveBeenCalledWith('@math/add', undefined)
        expect(result.content[0].text).toContain('@math/add')
        expect(result.content[0].text).toContain('abc123')
      })

      it('should call esm.read with specific version', async () => {
        const mockEsm = {
          read: vi.fn().mockResolvedValue({
            name: '@math/add',
            version: 'def456',
            types: '...',
            module: '...',
          }),
        } as unknown as ESM

        await handleToolCall('fetch', {
          resource: '@math/add@def456',
        }, mockEsm)

        expect(mockEsm.read).toHaveBeenCalledWith('@math/add', 'def456')
      })

      it('should return error when module not found', async () => {
        const mockEsm = {
          read: vi.fn().mockRejectedValue(new Error('Module not found')),
        } as unknown as ESM

        const result = await handleToolCall('fetch', {
          resource: '@nonexistent/module',
        }, mockEsm)

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('not found')
      })
    })
  })

  describe('do tool', () => {
    it('should have correct name', () => {
      expect(doTool.name).toBe('do')
    })

    describe('inputSchema', () => {
      it('should require code parameter', () => {
        const schema = mcpTools.do.inputSchema
        expect(schema.required).toContain('code')
        expect(schema.properties.code.type).toBe('string')
      })
    })

    describe('handler', () => {
      it('should execute code and return result', async () => {
        const mockEsm = {
          write: vi.fn().mockResolvedValue({ version: 'v1', name: '@test/mod' }),
          read: vi.fn(),
          run: vi.fn(),
          test: vi.fn(),
          list: vi.fn(),
          versions: vi.fn(),
          diff: vi.fn(),
          delete: vi.fn(),
        } as unknown as ESM

        const result = await handleToolCall('do', {
          code: 'return 1 + 2',
        }, mockEsm)

        expect(result.isError).toBeFalsy()
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.success).toBe(true)
        expect(parsed.value).toBe(3)
      })

      it('should provide esm binding in scope', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@test/mod', version: 'v1' },
          ]),
          write: vi.fn(),
          read: vi.fn(),
          run: vi.fn(),
          test: vi.fn(),
          versions: vi.fn(),
          diff: vi.fn(),
          delete: vi.fn(),
        } as unknown as ESM

        const result = await handleToolCall('do', {
          code: 'return await esm.list()',
        }, mockEsm)

        expect(mockEsm.list).toHaveBeenCalled()
        expect(result.isError).toBeFalsy()
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.success).toBe(true)
      })

      it('should capture console.log output', async () => {
        const mockEsm = {} as unknown as ESM

        const result = await handleToolCall('do', {
          code: 'console.log("hello"); return 42',
        }, mockEsm)

        expect(result.isError).toBeFalsy()
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.logs).toContain('hello')
      })

      it('should return error for invalid code', async () => {
        const mockEsm = {} as unknown as ESM

        const result = await handleToolCall('do', {
          code: 'throw new Error("intentional error")',
        }, mockEsm)

        expect(result.isError).toBe(true)
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.success).toBe(false)
        expect(parsed.error).toContain('intentional error')
      })
    })

    describe('createEsmDoScope', () => {
      it('should create a scope with esm binding', () => {
        const mockEsm = {
          write: vi.fn(),
          read: vi.fn(),
          run: vi.fn(),
          test: vi.fn(),
          list: vi.fn(),
          versions: vi.fn(),
          diff: vi.fn(),
          delete: vi.fn(),
        } as unknown as ESM

        const scope = createEsmDoScope(mockEsm)

        expect(scope.bindings).toHaveProperty('esm')
        expect(scope.types).toContain('esm')
        expect(scope.timeout).toBeDefined()
      })

      it('should allow custom timeout', () => {
        const mockEsm = {} as unknown as ESM
        const scope = createEsmDoScope(mockEsm, 60000)

        expect(scope.timeout).toBe(60000)
      })
    })
  })

  // ==========================================================================
  // Type Compatibility Tests (esm-c1iq, esm-c4gy)
  // ==========================================================================
  describe('SearchResult type compatibility', () => {
    it('should have description field for @dotdo/mcp compatibility', () => {
      // RED: SearchResult must have 'description' field to match @dotdo/mcp interface
      const result: SearchResult = {
        id: 'test-id',
        title: 'Test Title',
        description: 'Test description',
      }

      expect(result.description).toBe('Test description')
    })

    it('should support snippet as alias for backwards compatibility', () => {
      // SearchResult can still have snippet for backwards compatibility
      const result: SearchResult = {
        id: 'test-id',
        title: 'Test Title',
        description: 'Test description',
        snippet: 'Test snippet',
      }

      expect(result.snippet).toBe('Test snippet')
      expect(result.description).toBe('Test description')
    })

    it('should return search results with description field from handler', async () => {
      const mockEsm = {
        list: vi.fn().mockResolvedValue([
          { name: '@math/add', version: 'abc123' },
        ]),
      } as unknown as ESM

      const result = await handleToolCall('search', { query: 'math' }, mockEsm)
      const parsed = JSON.parse(result.content[0].text)

      // RED: Each result must have 'description' field
      expect(parsed[0]).toHaveProperty('description')
      expect(typeof parsed[0].description).toBe('string')
    })
  })

  describe('FetchResult type compatibility', () => {
    it('should have mimeType field for @dotdo/mcp compatibility', () => {
      // RED: FetchResult must have 'mimeType' field to match @dotdo/mcp interface
      const result: FetchResult = {
        content: 'Test content',
        mimeType: 'text/plain',
      }

      expect(result.mimeType).toBe('text/plain')
    })

    it('should not have contentType field (deprecated)', () => {
      // FetchResult should use mimeType, not contentType
      const result: FetchResult = {
        content: 'Test content',
        mimeType: 'application/json',
      }

      // contentType should not exist on the interface
      expect('contentType' in result).toBe(false)
    })
  })

  describe('handleToolCall', () => {
    it('should return error for unknown tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('unknown_tool', {}, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_write tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_write', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_read tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_read', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_run tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_run', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_test tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_test', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_list tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_list', {}, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_versions tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_versions', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_diff tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_diff', { name: '@test/mod', from: 'v1' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should return error for legacy esm_delete tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('esm_delete', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })
  })
})

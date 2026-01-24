import { describe, it, expect } from 'vitest'
import { mcpTools, handleToolCall, registerTools, getToolDefinitions } from '../../src/mcp/tools.js'
import type { ESM } from '../../src/mcp/tools.js'

/**
 * MCP Tools Cleanup Tests
 *
 * These tests verify that the MCP server exposes exactly 3 tools:
 * - search: Search for ESM modules
 * - fetch: Retrieve module content
 * - do: Execute code with esm binding
 *
 * The legacy esm_* tools should be removed from mcpTools registry.
 *
 * RED PHASE: These tests are expected to FAIL with current implementation
 * because mcpTools still contains legacy tools (esm_write, esm_read, etc.)
 *
 * Related issue: esm-bz6f
 */

describe('MCP Tools Cleanup - 3-tool architecture', () => {
  describe('mcpTools registry should only have 3 tools', () => {
    it('should have exactly 3 entries in mcpTools', () => {
      const toolCount = Object.keys(mcpTools).length
      expect(toolCount).toBe(3)
    })

    it('should only contain search, fetch, and do tools', () => {
      const toolNames = Object.keys(mcpTools).sort()
      expect(toolNames).toEqual(['do', 'fetch', 'search'])
    })

    it('should NOT contain esm_write tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_write')
    })

    it('should NOT contain esm_read tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_read')
    })

    it('should NOT contain esm_run tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_run')
    })

    it('should NOT contain esm_test tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_test')
    })

    it('should NOT contain esm_list tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_list')
    })

    it('should NOT contain esm_versions tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_versions')
    })

    it('should NOT contain esm_diff tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_diff')
    })

    it('should NOT contain esm_delete tool', () => {
      expect(mcpTools).not.toHaveProperty('esm_delete')
    })
  })

  describe('handleToolCall should reject legacy tool names', () => {
    const mockEsm = {
      write: async () => ({ version: 'v1', name: 'test' }),
      read: async () => ({ name: 'test', version: 'v1', types: '', module: '' }),
      run: async () => ({ value: null, logs: [] }),
      test: async () => ({ passed: 0, failed: 0, results: [] }),
      list: async () => [],
      versions: async () => [],
      diff: async () => ({ from: '', to: '', changes: [], patch: '' }),
      delete: async () => ({ deleted: true }),
    } as unknown as ESM

    it('should return unknown tool error for esm_write', async () => {
      const result = await handleToolCall('esm_write', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_write')
    })

    it('should return unknown tool error for esm_read', async () => {
      const result = await handleToolCall('esm_read', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_read')
    })

    it('should return unknown tool error for esm_run', async () => {
      const result = await handleToolCall('esm_run', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_run')
    })

    it('should return unknown tool error for esm_test', async () => {
      const result = await handleToolCall('esm_test', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_test')
    })

    it('should return unknown tool error for esm_list', async () => {
      const result = await handleToolCall('esm_list', {}, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_list')
    })

    it('should return unknown tool error for esm_versions', async () => {
      const result = await handleToolCall('esm_versions', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_versions')
    })

    it('should return unknown tool error for esm_diff', async () => {
      const result = await handleToolCall('esm_diff', { name: '@test/mod', from: 'v1' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_diff')
    })

    it('should return unknown tool error for esm_delete', async () => {
      const result = await handleToolCall('esm_delete', { name: '@test/mod' }, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
      expect(result.content[0].text).toContain('esm_delete')
    })
  })

  describe('getToolDefinitions should return exactly 3 tools', () => {
    const mockEsm = {
      write: async () => ({ version: 'v1', name: 'test' }),
      read: async () => ({ name: 'test', version: 'v1', types: '', module: '' }),
      run: async () => ({ value: null, logs: [] }),
      test: async () => ({ passed: 0, failed: 0, results: [] }),
      list: async () => [],
      versions: async () => [],
      diff: async () => ({ from: '', to: '', changes: [], patch: '' }),
      delete: async () => ({ deleted: true }),
    } as unknown as ESM

    it('should return exactly 3 tool definitions from registry', () => {
      const registry = registerTools(mockEsm)
      const tools = getToolDefinitions(registry)

      expect(tools).toHaveLength(3)
    })

    it('should return only search, fetch, do tool definitions', () => {
      const registry = registerTools(mockEsm)
      const tools = getToolDefinitions(registry)
      const toolNames = tools.map((t) => t.name).sort()

      expect(toolNames).toEqual(['do', 'fetch', 'search'])
    })
  })

  describe('Core 3 tools should still work', () => {
    const mockEsm = {
      write: async () => ({ version: 'v1', name: 'test' }),
      read: async () => ({
        name: '@test/mod',
        version: 'v1',
        types: 'export declare const x: number',
        module: 'export const x = 1',
      }),
      run: async () => ({ value: 42, logs: [] }),
      test: async () => ({ passed: 1, failed: 0, results: [] }),
      list: async () => [{ name: '@test/mod', version: 'v1' }],
      versions: async () => [],
      diff: async () => ({ from: '', to: '', changes: [], patch: '' }),
      delete: async () => ({ deleted: true }),
    } as unknown as ESM

    it('should successfully handle search tool', async () => {
      const result = await handleToolCall('search', { query: '@test' }, mockEsm)

      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toContain('@test/mod')
    })

    it('should successfully handle fetch tool', async () => {
      const result = await handleToolCall('fetch', { resource: '@test/mod' }, mockEsm)

      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toContain('@test/mod')
    })

    it('should successfully handle do tool', async () => {
      const result = await handleToolCall('do', { code: 'return 1 + 1' }, mockEsm)

      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toContain('2')
    })
  })
})

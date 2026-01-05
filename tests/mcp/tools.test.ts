import { describe, it, expect, vi, beforeEach } from 'vitest'
// These imports will fail until implementation exists - that's expected for RED tests
import { mcpTools, handleToolCall } from '../../src/mcp/tools.js'
import type { ESM } from '../../src/esm.js'

/**
 * MCP Tools Tests
 *
 * These tests define the expected interface for MCP tool handlers.
 * They are RED tests - designed to fail until implementation exists.
 *
 * Related issues:
 * - esm-3c1: MCP esm_write tool
 * - esm-o3m: MCP esm_read tool
 * - esm-6xa: MCP esm_run, esm_test tools
 * - esm-jom: MCP esm_list, esm_versions, esm_diff, esm_delete tools
 */

describe('MCP Tools', () => {
  describe('mcpTools registry', () => {
    it('should export all required tools', () => {
      expect(mcpTools).toBeDefined()
      expect(mcpTools).toHaveProperty('esm_write')
      expect(mcpTools).toHaveProperty('esm_read')
      expect(mcpTools).toHaveProperty('esm_run')
      expect(mcpTools).toHaveProperty('esm_test')
      expect(mcpTools).toHaveProperty('esm_list')
      expect(mcpTools).toHaveProperty('esm_versions')
      expect(mcpTools).toHaveProperty('esm_diff')
      expect(mcpTools).toHaveProperty('esm_delete')
    })

    it('should have valid tool definitions with name, description, inputSchema', () => {
      const toolNames = ['esm_write', 'esm_read', 'esm_run', 'esm_test', 'esm_list', 'esm_versions', 'esm_diff', 'esm_delete']

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

  describe('esm_write tool', () => {
    describe('inputSchema', () => {
      it('should require name parameter', () => {
        const schema = mcpTools.esm_write.inputSchema
        expect(schema.required).toContain('name')
        expect(schema.properties.name).toEqual({
          type: 'string',
          description: expect.stringContaining('module name'),
        })
      })

      it('should accept types parameter', () => {
        const schema = mcpTools.esm_write.inputSchema
        expect(schema.properties.types).toEqual({
          type: 'string',
          description: expect.stringContaining('TypeScript declarations'),
        })
      })

      it('should accept module parameter', () => {
        const schema = mcpTools.esm_write.inputSchema
        expect(schema.properties.module).toEqual({
          type: 'string',
          description: expect.stringContaining('ESM module'),
        })
      })

      it('should accept tests parameter', () => {
        const schema = mcpTools.esm_write.inputSchema
        expect(schema.properties.tests).toEqual({
          type: 'string',
          description: expect.stringContaining('test'),
        })
      })

      it('should accept script parameter', () => {
        const schema = mcpTools.esm_write.inputSchema
        expect(schema.properties.script).toEqual({
          type: 'string',
          description: expect.stringContaining('script'),
        })
      })
    })

    describe('handler', () => {
      it('should call esm.write with provided parameters', async () => {
        const mockEsm = {
          write: vi.fn().mockResolvedValue({
            version: 'abc123',
            testResults: { passed: 2, failed: 0 },
            value: 42,
          }),
        } as unknown as ESM

        const result = await handleToolCall('esm_write', {
          name: '@math/add',
          types: 'export declare function add(a: number, b: number): number',
          module: 'export function add(a, b) { return a + b }',
          tests: 'it("works", () => expect(add(1,2)).toBe(3))',
          script: 'return add(10, 20)',
        }, mockEsm)

        expect(mockEsm.write).toHaveBeenCalledWith({
          name: '@math/add',
          types: 'export declare function add(a: number, b: number): number',
          module: 'export function add(a, b) { return a + b }',
          tests: 'it("works", () => expect(add(1,2)).toBe(3))',
          script: 'return add(10, 20)',
        })
        expect(result).toEqual({
          content: [{
            type: 'text',
            text: expect.stringContaining('abc123'),
          }],
        })
      })

      it('should return error response when name is missing', async () => {
        const mockEsm = {} as ESM

        const result = await handleToolCall('esm_write', {
          module: 'export const x = 1',
        }, mockEsm)

        expect(result).toEqual({
          isError: true,
          content: [{
            type: 'text',
            text: expect.stringContaining('name'),
          }],
        })
      })

      it('should return error response on write failure', async () => {
        const mockEsm = {
          write: vi.fn().mockRejectedValue(new Error('Write failed')),
        } as unknown as ESM

        const result = await handleToolCall('esm_write', {
          name: '@test/module',
          module: 'invalid code {{{}}}',
        }, mockEsm)

        expect(result).toEqual({
          isError: true,
          content: [{
            type: 'text',
            text: expect.stringContaining('Write failed'),
          }],
        })
      })
    })
  })

  describe('esm_read tool', () => {
    describe('inputSchema', () => {
      it('should require name parameter', () => {
        const schema = mcpTools.esm_read.inputSchema
        expect(schema.required).toContain('name')
        expect(schema.properties.name.type).toBe('string')
      })

      it('should accept optional version parameter', () => {
        const schema = mcpTools.esm_read.inputSchema
        expect(schema.properties.version).toEqual({
          type: 'string',
          description: expect.stringContaining('version'),
        })
      })

      it('should accept optional file parameter', () => {
        const schema = mcpTools.esm_read.inputSchema
        expect(schema.properties.file).toEqual({
          type: 'string',
          enum: ['types', 'module', 'tests', 'script'],
          description: expect.any(String),
        })
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
            tests: 'it("works", () => {})',
            script: 'return add(1, 2)',
          }),
        } as unknown as ESM

        const result = await handleToolCall('esm_read', {
          name: '@math/add',
        }, mockEsm)

        expect(mockEsm.read).toHaveBeenCalledWith('@math/add', undefined)
        expect(result.content[0].text).toContain('@math/add')
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

        await handleToolCall('esm_read', {
          name: '@math/add',
          version: 'def456',
        }, mockEsm)

        expect(mockEsm.read).toHaveBeenCalledWith('@math/add', 'def456')
      })

      it('should return error when module not found', async () => {
        const mockEsm = {
          read: vi.fn().mockRejectedValue(new Error('Module not found')),
        } as unknown as ESM

        const result = await handleToolCall('esm_read', {
          name: '@nonexistent/module',
        }, mockEsm)

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('not found')
      })
    })
  })

  describe('esm_run tool', () => {
    describe('inputSchema', () => {
      it('should require name parameter', () => {
        const schema = mcpTools.esm_run.inputSchema
        expect(schema.required).toContain('name')
        expect(schema.properties.name.type).toBe('string')
      })

      it('should accept optional args parameter', () => {
        const schema = mcpTools.esm_run.inputSchema
        expect(schema.properties.args).toBeDefined()
      })
    })

    describe('handler', () => {
      it('should call esm.run with module name', async () => {
        const mockEsm = {
          run: vi.fn().mockResolvedValue({
            value: 42,
            logs: ['log1', 'log2'],
          }),
        } as unknown as ESM

        const result = await handleToolCall('esm_run', {
          name: '@math/add',
        }, mockEsm)

        expect(mockEsm.run).toHaveBeenCalledWith('@math/add', undefined)
        expect(result.content[0].text).toContain('42')
      })

      it('should pass args to esm.run', async () => {
        const mockEsm = {
          run: vi.fn().mockResolvedValue({
            value: 100,
            logs: [],
          }),
        } as unknown as ESM

        await handleToolCall('esm_run', {
          name: '@math/add',
          args: { a: 50, b: 50 },
        }, mockEsm)

        expect(mockEsm.run).toHaveBeenCalledWith('@math/add', { a: 50, b: 50 })
      })

      it('should return error on execution failure', async () => {
        const mockEsm = {
          run: vi.fn().mockRejectedValue(new Error('Runtime error')),
        } as unknown as ESM

        const result = await handleToolCall('esm_run', {
          name: '@broken/module',
        }, mockEsm)

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Runtime error')
      })
    })
  })

  describe('esm_test tool', () => {
    describe('inputSchema', () => {
      it('should require name parameter', () => {
        const schema = mcpTools.esm_test.inputSchema
        expect(schema.required).toContain('name')
        expect(schema.properties.name.type).toBe('string')
      })

      it('should accept optional filter parameter', () => {
        const schema = mcpTools.esm_test.inputSchema
        expect(schema.properties.filter).toEqual({
          type: 'string',
          description: expect.stringContaining('filter'),
        })
      })
    })

    describe('handler', () => {
      it('should call esm.test with module name', async () => {
        const mockEsm = {
          test: vi.fn().mockResolvedValue({
            passed: 5,
            failed: 0,
            results: [
              { name: 'test 1', status: 'passed' },
              { name: 'test 2', status: 'passed' },
            ],
          }),
        } as unknown as ESM

        const result = await handleToolCall('esm_test', {
          name: '@math/add',
        }, mockEsm)

        expect(mockEsm.test).toHaveBeenCalledWith('@math/add', undefined)
        expect(result.content[0].text).toContain('passed')
      })

      it('should return detailed test results', async () => {
        const mockEsm = {
          test: vi.fn().mockResolvedValue({
            passed: 2,
            failed: 1,
            results: [
              { name: 'adds numbers', status: 'passed' },
              { name: 'handles zero', status: 'passed' },
              { name: 'handles negative', status: 'failed', error: 'Expected -3 but got 3' },
            ],
          }),
        } as unknown as ESM

        const result = await handleToolCall('esm_test', {
          name: '@math/add',
        }, mockEsm)

        expect(result.content[0].text).toContain('2')
        expect(result.content[0].text).toContain('1')
        expect(result.content[0].text).toContain('failed')
      })

      it('should pass filter to esm.test', async () => {
        const mockEsm = {
          test: vi.fn().mockResolvedValue({ passed: 1, failed: 0, results: [] }),
        } as unknown as ESM

        await handleToolCall('esm_test', {
          name: '@math/add',
          filter: 'adds numbers',
        }, mockEsm)

        expect(mockEsm.test).toHaveBeenCalledWith('@math/add', 'adds numbers')
      })
    })
  })

  describe('esm_list tool', () => {
    describe('inputSchema', () => {
      it('should accept optional pattern parameter', () => {
        const schema = mcpTools.esm_list.inputSchema
        expect(schema.properties.pattern).toEqual({
          type: 'string',
          description: expect.stringContaining('pattern'),
        })
      })

      it('should accept optional scope parameter', () => {
        const schema = mcpTools.esm_list.inputSchema
        expect(schema.properties.scope).toEqual({
          type: 'string',
          description: expect.stringContaining('scope'),
        })
      })
    })

    describe('handler', () => {
      it('should call esm.list with no parameters', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@math/add', version: 'abc123' },
            { name: '@math/subtract', version: 'def456' },
          ]),
        } as unknown as ESM

        const result = await handleToolCall('esm_list', {}, mockEsm)

        expect(mockEsm.list).toHaveBeenCalled()
        expect(result.content[0].text).toContain('@math/add')
        expect(result.content[0].text).toContain('@math/subtract')
      })

      it('should filter by pattern', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@math/add', version: 'abc123' },
          ]),
        } as unknown as ESM

        await handleToolCall('esm_list', {
          pattern: 'add',
        }, mockEsm)

        expect(mockEsm.list).toHaveBeenCalledWith({ pattern: 'add', scope: undefined })
      })

      it('should filter by scope', async () => {
        const mockEsm = {
          list: vi.fn().mockResolvedValue([
            { name: '@utils/string', version: 'abc123' },
          ]),
        } as unknown as ESM

        await handleToolCall('esm_list', {
          scope: '@utils',
        }, mockEsm)

        expect(mockEsm.list).toHaveBeenCalledWith({ pattern: undefined, scope: '@utils' })
      })
    })
  })

  describe('esm_versions tool', () => {
    describe('inputSchema', () => {
      it('should require name parameter', () => {
        const schema = mcpTools.esm_versions.inputSchema
        expect(schema.required).toContain('name')
        expect(schema.properties.name.type).toBe('string')
      })

      it('should accept optional limit parameter', () => {
        const schema = mcpTools.esm_versions.inputSchema
        expect(schema.properties.limit).toEqual({
          type: 'number',
          description: expect.any(String),
        })
      })
    })

    describe('handler', () => {
      it('should call esm.versions with module name', async () => {
        const mockEsm = {
          versions: vi.fn().mockResolvedValue([
            { version: 'abc123', message: 'Initial commit', date: '2024-01-01' },
            { version: 'def456', message: 'Added tests', date: '2024-01-02' },
          ]),
        } as unknown as ESM

        const result = await handleToolCall('esm_versions', {
          name: '@math/add',
        }, mockEsm)

        expect(mockEsm.versions).toHaveBeenCalledWith('@math/add', undefined)
        expect(result.content[0].text).toContain('abc123')
        expect(result.content[0].text).toContain('def456')
      })

      it('should pass limit parameter', async () => {
        const mockEsm = {
          versions: vi.fn().mockResolvedValue([]),
        } as unknown as ESM

        await handleToolCall('esm_versions', {
          name: '@math/add',
          limit: 5,
        }, mockEsm)

        expect(mockEsm.versions).toHaveBeenCalledWith('@math/add', 5)
      })
    })
  })

  describe('esm_diff tool', () => {
    describe('inputSchema', () => {
      it('should require name parameter', () => {
        const schema = mcpTools.esm_diff.inputSchema
        expect(schema.required).toContain('name')
        expect(schema.properties.name.type).toBe('string')
      })

      it('should require from version parameter', () => {
        const schema = mcpTools.esm_diff.inputSchema
        expect(schema.required).toContain('from')
        expect(schema.properties.from.type).toBe('string')
      })

      it('should accept optional to version parameter', () => {
        const schema = mcpTools.esm_diff.inputSchema
        expect(schema.properties.to).toEqual({
          type: 'string',
          description: expect.stringContaining('version'),
        })
      })
    })

    describe('handler', () => {
      it('should call esm.diff with module name and versions', async () => {
        const mockEsm = {
          diff: vi.fn().mockResolvedValue({
            from: 'abc123',
            to: 'def456',
            changes: [
              { file: 'index.mjs', additions: 5, deletions: 2 },
            ],
            patch: '--- a/index.mjs\n+++ b/index.mjs\n@@ -1,3 +1,6 @@\n...',
          }),
        } as unknown as ESM

        const result = await handleToolCall('esm_diff', {
          name: '@math/add',
          from: 'abc123',
          to: 'def456',
        }, mockEsm)

        expect(mockEsm.diff).toHaveBeenCalledWith('@math/add', 'abc123', 'def456')
        expect(result.content[0].text).toContain('abc123')
        expect(result.content[0].text).toContain('def456')
      })

      it('should default to HEAD when to is not provided', async () => {
        const mockEsm = {
          diff: vi.fn().mockResolvedValue({
            from: 'abc123',
            to: 'HEAD',
            changes: [],
            patch: '',
          }),
        } as unknown as ESM

        await handleToolCall('esm_diff', {
          name: '@math/add',
          from: 'abc123',
        }, mockEsm)

        expect(mockEsm.diff).toHaveBeenCalledWith('@math/add', 'abc123', 'HEAD')
      })
    })
  })

  describe('esm_delete tool', () => {
    describe('inputSchema', () => {
      it('should require name parameter', () => {
        const schema = mcpTools.esm_delete.inputSchema
        expect(schema.required).toContain('name')
        expect(schema.properties.name.type).toBe('string')
      })

      it('should accept optional force parameter', () => {
        const schema = mcpTools.esm_delete.inputSchema
        expect(schema.properties.force).toEqual({
          type: 'boolean',
          description: expect.any(String),
        })
      })
    })

    describe('handler', () => {
      it('should call esm.delete with module name', async () => {
        const mockEsm = {
          delete: vi.fn().mockResolvedValue({
            deleted: true,
            name: '@math/add',
          }),
        } as unknown as ESM

        const result = await handleToolCall('esm_delete', {
          name: '@math/add',
        }, mockEsm)

        expect(mockEsm.delete).toHaveBeenCalledWith('@math/add', false)
        expect(result.content[0].text).toContain('deleted')
      })

      it('should pass force parameter', async () => {
        const mockEsm = {
          delete: vi.fn().mockResolvedValue({ deleted: true }),
        } as unknown as ESM

        await handleToolCall('esm_delete', {
          name: '@math/add',
          force: true,
        }, mockEsm)

        expect(mockEsm.delete).toHaveBeenCalledWith('@math/add', true)
      })

      it('should return error when module has dependents and force is false', async () => {
        const mockEsm = {
          delete: vi.fn().mockRejectedValue(new Error('Module has dependents: @other/module')),
        } as unknown as ESM

        const result = await handleToolCall('esm_delete', {
          name: '@math/add',
          force: false,
        }, mockEsm)

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('dependents')
      })
    })
  })

  describe('handleToolCall', () => {
    it('should return error for unknown tool', async () => {
      const mockEsm = {} as ESM

      const result = await handleToolCall('unknown_tool', {}, mockEsm)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should validate input against schema before calling handler', async () => {
      const mockEsm = {
        write: vi.fn(),
      } as unknown as ESM

      // Missing required 'name' parameter
      const result = await handleToolCall('esm_write', {
        module: 'export const x = 1',
      }, mockEsm)

      expect(result.isError).toBe(true)
      expect(mockEsm.write).not.toHaveBeenCalled()
    })
  })
})

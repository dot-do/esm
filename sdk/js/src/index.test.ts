/**
 * @esm.do/sdk - Unit Tests
 *
 * Tests for the ESMClient and HTTP client implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ESMClient } from './index.js'
import { HttpClient } from './client.js'
import {
  ESMError,
  NetworkError,
  TimeoutError,
  RetryExhaustedError,
} from './types.js'

// =============================================================================
// Mock Setup
// =============================================================================

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

function createMockResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const body = typeof data === 'string' ? data : JSON.stringify(data)
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'test-request-id',
      ...headers,
    },
  })
}

// =============================================================================
// ESMClient Tests
// =============================================================================

describe('ESMClient', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('creates client with default config', () => {
      const client = new ESMClient()
      expect(client).toBeInstanceOf(ESMClient)
    })

    it('creates client with custom config', () => {
      const client = new ESMClient({
        baseUrl: 'https://custom.esm.do',
        token: 'test-token',
        timeout: 60000,
        maxRetries: 5,
        retryDelay: 2000,
      })
      expect(client).toBeInstanceOf(ESMClient)
    })
  })

  describe('static factory methods', () => {
    it('creates production client', () => {
      const client = ESMClient.production('test-token')
      expect(client).toBeInstanceOf(ESMClient)
    })

    it('creates local client', () => {
      const client = ESMClient.local(3000)
      expect(client).toBeInstanceOf(ESMClient)
    })
  })

  describe('read', () => {
    it('reads a module by name', async () => {
      const moduleData = {
        name: '@math/add',
        version: 'abc123',
        types: 'export declare function add(a: number, b: number): number;',
        module: 'export function add(a, b) { return a + b; }',
        tests: 'describe("add", () => {});',
        script: 'return add(1, 2);',
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(moduleData))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.read('@math/add')

      expect(result).toEqual(moduleData)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.do/@math/add',
        expect.objectContaining({
          method: 'GET',
        })
      )
    })

    it('reads a module at specific version', async () => {
      const moduleData = {
        name: '@math/add',
        version: 'abc123',
        types: 'export declare function add(a: number, b: number): number;',
        module: 'export function add(a, b) { return a + b; }',
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(moduleData))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.read('@math/add', 'v1.0.0')

      expect(result).toEqual(moduleData)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.do/@math/add@v1.0.0',
        expect.any(Object)
      )
    })

    it('throws ESMError for 404', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Module not found', status: 404 }, 404)
      )

      const client = new ESMClient({ maxRetries: 0 })

      await expect(client.read('@scope/nonexistent')).rejects.toThrow(ESMError)
    })
  })

  describe('write', () => {
    it('creates a new module', async () => {
      const writeResult = {
        name: '@scope/new-module',
        version: 'xyz789',
        created: true,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(writeResult, 201))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.write({
        name: '@scope/new-module',
        types: 'export declare const value: number;',
        module: 'export const value = 42;',
      })

      expect(result).toEqual(writeResult)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.do/@scope/new-module',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('types'),
        })
      )
    })

    it('updates an existing module', async () => {
      const writeResult = {
        name: '@scope/existing-module',
        version: 'xyz789',
        updated: true,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(writeResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.write({
        name: '@scope/existing-module',
        types: 'export declare const value: number;',
        module: 'export const value = 43;',
      })

      expect(result.updated).toBe(true)
    })

    it('sends write options', async () => {
      const writeResult = {
        name: '@scope/module',
        version: 'xyz789',
        created: true,
        tag: 'v1.0.0',
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(writeResult, 201))

      const client = new ESMClient({ maxRetries: 0 })
      await client.write({
        name: '@scope/module',
        types: 'export declare const x: number;',
        module: 'export const x = 1;',
        options: {
          tag: 'v1.0.0',
          commitMessage: 'Initial release',
          force: true,
        },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('v1.0.0'),
        })
      )
    })
  })

  describe('run', () => {
    it('runs a module script', async () => {
      const runResult = {
        result: 3,
        logs: [{ level: 'log', args: ['Calculating...'] }],
        duration: 15,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(runResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.run('@math/add')

      expect(result.result).toBe(3)
      expect(result.duration).toBe(15)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.do/@math/add/run',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('passes input arguments', async () => {
      const runResult = {
        result: 10,
        logs: [],
        duration: 5,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(runResult))

      const client = new ESMClient({ maxRetries: 0 })
      await client.run('@math/add', {
        input: { a: 5, b: 5 },
        timeout: 10000,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"a":5'),
        })
      )
    })
  })

  describe('test', () => {
    it('runs module tests', async () => {
      const testResult = {
        passed: 5,
        failed: 0,
        total: 5,
        duration: 100,
        results: [
          { name: 'test 1', status: 'passed', duration: 10 },
          { name: 'test 2', status: 'passed', duration: 20 },
        ],
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(testResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.test('@math/add')

      expect(result.passed).toBe(5)
      expect(result.failed).toBe(0)
      expect(result.total).toBe(5)
    })

    it('returns failed tests', async () => {
      const testResult = {
        passed: 3,
        failed: 2,
        total: 5,
        duration: 150,
        results: [
          { name: 'test 1', status: 'passed', duration: 10 },
          {
            name: 'test 2',
            status: 'failed',
            duration: 20,
            error: { message: 'Expected 5 but got 4' },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(testResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.test('@math/add')

      expect(result.failed).toBe(2)
    })
  })

  describe('versions', () => {
    it('gets version history', async () => {
      const versionsResult = {
        versions: [
          { sha: 'abc123', message: 'Update module', timestamp: '2024-01-01' },
          { sha: 'def456', message: 'Initial commit', timestamp: '2023-12-31' },
        ],
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(versionsResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.versions('@math/add')

      expect(result.versions).toHaveLength(2)
      expect(result.versions[0]?.sha).toBe('abc123')
    })

    it('limits version history', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ versions: [] }))

      const client = new ESMClient({ maxRetries: 0 })
      await client.versions('@math/add', 5)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.do/@math/add/versions?limit=5',
        expect.any(Object)
      )
    })
  })

  describe('delete', () => {
    it('deletes a module', async () => {
      const deleteResult = {
        name: '@scope/module',
        deleted: true,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(deleteResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.delete('@scope/module')

      expect(result.deleted).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.do/@scope/module',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  describe('list', () => {
    it('lists modules in a scope', async () => {
      const listResult = {
        modules: ['@math/add', '@math/subtract', '@math/multiply'],
        scope: '@math',
        count: 3,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(listResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.list('math')

      expect(result.count).toBe(3)
      expect(result.modules).toContain('@math/add')
    })

    it('handles scope with @ prefix', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ modules: [], count: 0 })
      )

      const client = new ESMClient({ maxRetries: 0 })
      await client.list('@math')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://esm.do/math/',
        expect.any(Object)
      )
    })
  })

  describe('deps', () => {
    it('gets direct dependencies', async () => {
      const depsResult = {
        name: '@math/stats',
        dependencies: ['@math/add'],
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(depsResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.deps('@math/stats')

      expect(result.dependencies).toContain('@math/add')
    })
  })

  describe('depsTree', () => {
    it('gets dependency tree', async () => {
      const treeResult = {
        name: '@math/stats',
        tree: {
          '@math/add': {},
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(treeResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.depsTree('@math/stats')

      expect(result.tree).toHaveProperty('@math/add')
    })
  })

  describe('depsFlat', () => {
    it('gets flattened dependencies', async () => {
      const flatResult = {
        dependencies: ['@math/add', '@math/multiply'],
        count: 2,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(flatResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.depsFlat('@math/stats')

      expect(result.count).toBe(2)
    })
  })

  describe('diff', () => {
    it('gets diff between versions', async () => {
      const diffResult = {
        from: 'abc123',
        to: 'def456',
        diff: '-old line\n+new line',
        stats: { additions: 1, deletions: 1, filesChanged: 1 },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(diffResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.diff('@math/add', 'abc123', 'def456')

      expect(result.from).toBe('abc123')
      expect(result.to).toBe('def456')
      expect(result.diff).toContain('+new line')
    })
  })

  describe('revert', () => {
    it('reverts to a previous version', async () => {
      const revertResult = {
        name: '@math/add',
        version: 'new123',
        updated: true,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(revertResult))

      const client = new ESMClient({ maxRetries: 0 })
      const result = await client.revert('@math/add', 'abc123')

      expect(result.version).toBe('new123')
    })
  })
})

// =============================================================================
// HttpClient Tests
// =============================================================================

describe('HttpClient', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('request', () => {
    it('makes GET requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 0,
      })

      const result = await client.get<{ data: string }>('/test')

      expect(result.data).toEqual({ data: 'test' })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('makes POST requests with body', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ created: true }))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 0,
      })

      await client.post('/test', { name: 'test' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          body: '{"name":"test"}',
        })
      )
    })

    it('includes authorization header when token is set', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        token: 'secret-token',
        maxRetries: 0,
      })

      await client.get('/test')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      )

      const call = mockFetch.mock.calls[0]
      const headers = call?.[1]?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer secret-token')
    })
  })

  describe('error handling', () => {
    it('throws ESMError for error responses', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { error: 'Not Found', status: 404 },
          404
        )
      )

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 0,
      })

      await expect(client.get('/missing')).rejects.toThrow(ESMError)
    })

    it('includes status in ESMError', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Forbidden' }, 403)
      )

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 0,
      })

      try {
        await client.get('/forbidden')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ESMError)
        expect((error as ESMError).status).toBe(403)
      }
    })

    it('throws RetryExhaustedError for fetch failures after retries exhausted', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 0,
      })

      // With maxRetries: 0, we get 1 attempt, then RetryExhaustedError
      // The underlying error is wrapped in RetryExhaustedError.lastError
      await expect(client.get('/test')).rejects.toThrow(RetryExhaustedError)
    })
  })

  describe('retries', () => {
    it('retries on 5xx errors', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({ error: 'Server Error' }, 500)
        )
        .mockResolvedValueOnce(createMockResponse({ data: 'success' }))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 3,
        retryDelay: 10, // Short delay for tests
      })

      const result = await client.get<{ data: string }>('/test')

      expect(result.data).toEqual({ data: 'success' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('retries on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({ error: 'Rate limit exceeded' }, 429)
        )
        .mockResolvedValueOnce(createMockResponse({ data: 'success' }))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 3,
        retryDelay: 10,
      })

      const result = await client.get<{ data: string }>('/test')

      expect(result.data).toEqual({ data: 'success' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('does not retry on 4xx errors (except 429)', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Bad Request' }, 400)
      )

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 3,
        retryDelay: 10,
      })

      await expect(client.get('/test')).rejects.toThrow(ESMError)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('throws RetryExhaustedError after max retries', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Server Error' }, 500)
      )

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 2,
        retryDelay: 10,
      })

      await expect(client.get('/test')).rejects.toThrow(RetryExhaustedError)
      expect(mockFetch).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('retries on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce(createMockResponse({ data: 'success' }))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 3,
        retryDelay: 10,
      })

      const result = await client.get<{ data: string }>('/test')

      expect(result.data).toEqual({ data: 'success' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('timeout', () => {
    it('throws TimeoutError when request times out', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            const error = new Error('Aborted')
            error.name = 'AbortError'
            setTimeout(() => reject(error), 50)
          })
      )

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        timeout: 100,
        maxRetries: 0,
      })

      await expect(client.get('/slow')).rejects.toThrow(TimeoutError)
    })
  })

  describe('URL building', () => {
    it('handles base URL with trailing slash', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com/',
        maxRetries: 0,
      })

      await client.get('/test')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.any(Object)
      )
    })

    it('handles path without leading slash', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}))

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        maxRetries: 0,
      })

      await client.get('test')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.any(Object)
      )
    })
  })
})

// =============================================================================
// Error Type Tests
// =============================================================================

describe('Error Types', () => {
  describe('ESMError', () => {
    it('includes status and requestId', () => {
      const error = new ESMError('Test error', 404, 'req-123', { key: 'value' })

      expect(error.message).toBe('Test error')
      expect(error.status).toBe(404)
      expect(error.requestId).toBe('req-123')
      expect(error.details).toEqual({ key: 'value' })
      expect(error.name).toBe('ESMError')
    })
  })

  describe('NetworkError', () => {
    it('includes cause', () => {
      const cause = new Error('Connection refused')
      const error = new NetworkError('Network failed', cause)

      expect(error.message).toBe('Network failed')
      expect(error.status).toBe(0)
      expect(error.details).toEqual({ cause: 'Connection refused' })
      expect(error.name).toBe('NetworkError')
    })
  })

  describe('TimeoutError', () => {
    it('includes timeout value', () => {
      const error = new TimeoutError(30000)

      expect(error.message).toBe('Request timeout after 30000ms')
      expect(error.status).toBe(408)
      expect(error.name).toBe('TimeoutError')
    })
  })

  describe('RetryExhaustedError', () => {
    it('includes attempts and last error', () => {
      const lastError = new Error('Server error')
      const error = new RetryExhaustedError(3, lastError)

      expect(error.message).toBe('All 3 retry attempts failed: Server error')
      expect(error.attempts).toBe(3)
      expect(error.lastError).toBe(lastError)
      expect(error.name).toBe('RetryExhaustedError')
    })
  })
})

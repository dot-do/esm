/**
 * RED Tests for esm.do Cloudflare Worker API
 *
 * These tests are designed to FAIL until the Worker implementation exists.
 * They cover all HTTP routes and functionality for the esm.do API layer.
 *
 * Issues covered:
 * - esm-n2l: API route handlers
 * - esm-y6l: Module retrieval routes
 * - esm-79a: Module mutation routes
 * - esm-soa: Error handling and CORS
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { unstable_dev, UnstableDevWorker } from 'wrangler'

describe('esm.do Worker API', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    // This will fail until worker implementation exists
    worker = await unstable_dev('src/worker/index.ts', {
      experimental: { disableExperimentalWarning: true },
    })
  })

  afterAll(async () => {
    await worker?.stop()
  })

  // =============================================================================
  // GET /:name - Get module info
  // =============================================================================
  describe('GET /:name - Get module info', () => {
    it('should return module metadata for existing module', async () => {
      const response = await worker.fetch('/math/add')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(data).toHaveProperty('name', '@math/add')
      expect(data).toHaveProperty('version')
      expect(data).toHaveProperty('files')
      expect(data.files).toContain('index.d.ts')
      expect(data.files).toContain('index.mjs')
      expect(data.files).toContain('index.test.js')
    })

    it('should return 404 for non-existent module', async () => {
      const response = await worker.fetch('/nonexistent/module')

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('not found')
    })

    it('should handle scoped module names', async () => {
      const response = await worker.fetch('/@scope/module')

      // Should return either 200 or 404, not 400
      expect([200, 404]).toContain(response.status)
    })

    it('should include version history in response', async () => {
      const response = await worker.fetch('/math/add')
      const data = await response.json()

      expect(data).toHaveProperty('versions')
      expect(Array.isArray(data.versions)).toBe(true)
    })
  })

  // =============================================================================
  // GET /:name.d.ts - Get types
  // =============================================================================
  describe('GET /:name.d.ts - Get types', () => {
    it('should return TypeScript declaration file', async () => {
      const response = await worker.fetch('/math/add.d.ts')
      const content = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/typescript')
      expect(content).toContain('export')
      expect(content).toContain('declare')
    })

    it('should return 404 for non-existent module types', async () => {
      const response = await worker.fetch('/nonexistent/module.d.ts')

      expect(response.status).toBe(404)
    })

    it('should set correct cache headers for types', async () => {
      const response = await worker.fetch('/math/add.d.ts')

      expect(response.headers.has('cache-control')).toBe(true)
      expect(response.headers.has('etag')).toBe(true)
    })
  })

  // =============================================================================
  // GET /:name.mjs - Get module (ESM-importable)
  // =============================================================================
  describe('GET /:name.mjs - Get module (ESM-importable)', () => {
    it('should return ESM module content', async () => {
      const response = await worker.fetch('/math/add.mjs')
      const content = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/javascript')
      expect(content).toContain('export')
    })

    it('should be directly importable as ESM', async () => {
      const response = await worker.fetch('/math/add.mjs')
      const content = await response.text()

      // Valid ESM should not have CommonJS patterns
      expect(content).not.toContain('module.exports')
      expect(content).not.toContain('require(')
    })

    it('should return 404 for non-existent module', async () => {
      const response = await worker.fetch('/nonexistent/module.mjs')

      expect(response.status).toBe(404)
    })

    it('should resolve internal dependencies', async () => {
      const response = await worker.fetch('/math/stats.mjs')
      const content = await response.text()

      // Dependencies should be resolved to full esm.do URLs
      expect(content).toContain('esm.do/')
    })

    it('should set correct headers for CDN caching', async () => {
      const response = await worker.fetch('/math/add.mjs')

      expect(response.headers.has('cache-control')).toBe(true)
      expect(response.headers.has('etag')).toBe(true)
    })
  })

  // =============================================================================
  // GET /:name.test.js - Get tests
  // =============================================================================
  describe('GET /:name.test.js - Get tests', () => {
    it('should return test file content', async () => {
      const response = await worker.fetch('/math/add.test.js')
      const content = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/javascript')
      expect(content).toContain('describe')
      expect(content).toContain('it')
      expect(content).toContain('expect')
    })

    it('should return 404 for module without tests', async () => {
      const response = await worker.fetch('/nonexistent/module.test.js')

      expect(response.status).toBe(404)
    })
  })

  // =============================================================================
  // GET /:name@version - Get specific version
  // =============================================================================
  describe('GET /:name@version - Get specific version', () => {
    it('should return module at specific version', async () => {
      const response = await worker.fetch('/math/add@v1.0.0')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('version', 'v1.0.0')
    })

    it('should return specific version of module file', async () => {
      const response = await worker.fetch('/math/add@v1.0.0.mjs')

      expect(response.status).toBe(200)
    })

    it('should return 404 for non-existent version', async () => {
      const response = await worker.fetch('/math/add@nonexistent')

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('version')
    })

    it('should support commit SHA as version', async () => {
      const response = await worker.fetch('/math/add@a3f2dd1')

      // Should return either 200 or 404, but should parse correctly
      expect([200, 404]).toContain(response.status)
    })

    it('should support semver tags', async () => {
      const response = await worker.fetch('/math/add@^1.0.0')

      // Should resolve semver range to specific version
      expect([200, 404]).toContain(response.status)
    })
  })

  // =============================================================================
  // POST /:name - Create/update module
  // =============================================================================
  describe('POST /:name - Create/update module', () => {
    const testModule = {
      types: 'export declare function greet(name: string): string',
      module: 'export function greet(name) { return `Hello, ${name}!` }',
      tests: `
        describe('greet', () => {
          it('greets by name', () => expect(greet('World')).toBe('Hello, World!'))
        })
      `,
      script: 'return greet("Test")'
    }

    it('should create a new module', async () => {
      const response = await worker.fetch('/test/greet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testModule)
      })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data).toHaveProperty('name', '@test/greet')
      expect(data).toHaveProperty('version')
      expect(data).toHaveProperty('created', true)
    })

    it('should update an existing module', async () => {
      // First create
      await worker.fetch('/test/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testModule)
      })

      // Then update
      const response = await worker.fetch('/test/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testModule,
          module: 'export function greet(name) { return `Hi, ${name}!` }'
        })
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('updated', true)
    })

    it('should validate types are present', async () => {
      const response = await worker.fetch('/test/invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'export const x = 1' })
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('types')
    })

    it('should validate module code is present', async () => {
      const response = await worker.fetch('/test/invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: 'export declare const x: number' })
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('module')
    })

    it('should return validation errors for invalid TypeScript', async () => {
      const response = await worker.fetch('/test/badtypes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'this is not valid typescript {{{{',
          module: 'export const x = 1'
        })
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('details')
    })

    it('should run tests on create and return results', async () => {
      const response = await worker.fetch('/test/withtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testModule)
      })
      const data = await response.json()

      expect(data).toHaveProperty('testResults')
      expect(data.testResults).toHaveProperty('passed')
      expect(data.testResults).toHaveProperty('failed')
    })

    it('should reject modules with failing tests by default', async () => {
      const response = await worker.fetch('/test/failingtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare function add(a: number, b: number): number',
          module: 'export function add(a, b) { return a - b }', // Bug: subtracts instead of adds
          tests: `
            describe('add', () => {
              it('adds numbers', () => expect(add(2, 3)).toBe(5))
            })
          `
        })
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.testResults.failed).toBeGreaterThan(0)
    })

    it('should allow saving with failing tests when forced', async () => {
      const response = await worker.fetch('/test/forcedfailing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare function add(a: number, b: number): number',
          module: 'export function add(a, b) { return a - b }',
          tests: `describe('add', () => { it('adds', () => expect(add(2, 3)).toBe(5)) })`,
          options: { force: true }
        })
      })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data).toHaveProperty('warning')
    })

    it('should require authentication for create', async () => {
      const response = await worker.fetch('/protected/module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testModule)
      })

      // Without auth, should return 401
      expect(response.status).toBe(401)
    })
  })

  // =============================================================================
  // POST /:name/run - Execute script
  // =============================================================================
  describe('POST /:name/run - Execute script', () => {
    it('should execute module script and return result', async () => {
      const response = await worker.fetch('/math/add/run', {
        method: 'POST'
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('result')
      expect(data).toHaveProperty('duration')
    })

    it('should accept input parameters', async () => {
      const response = await worker.fetch('/math/add/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { a: 10, b: 20 } })
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('result')
    })

    it('should return 404 for module without script', async () => {
      const response = await worker.fetch('/nonexistent/module/run', {
        method: 'POST'
      })

      expect(response.status).toBe(404)
    })

    it('should capture console output', async () => {
      const response = await worker.fetch('/math/calculator/run', {
        method: 'POST'
      })
      const data = await response.json()

      expect(data).toHaveProperty('logs')
      expect(Array.isArray(data.logs)).toBe(true)
    })

    it('should handle script errors gracefully', async () => {
      const response = await worker.fetch('/test/throwing/run', {
        method: 'POST'
      })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('stack')
    })

    it('should timeout long-running scripts', async () => {
      const response = await worker.fetch('/test/infinite/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 100 })
      })
      const data = await response.json()

      expect(response.status).toBe(408)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('timeout')
    })

    it('should run in sandboxed environment', async () => {
      // Attempt to access forbidden APIs
      const response = await worker.fetch('/test/sandbox/run', {
        method: 'POST'
      })
      const data = await response.json()

      // Should not have access to process, fs, etc.
      expect(data).toHaveProperty('sandboxed', true)
    })
  })

  // =============================================================================
  // POST /:name/test - Run tests
  // =============================================================================
  describe('POST /:name/test - Run tests', () => {
    it('should run module tests and return results', async () => {
      const response = await worker.fetch('/math/add/test', {
        method: 'POST'
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('passed')
      expect(data).toHaveProperty('failed')
      expect(data).toHaveProperty('total')
      expect(data).toHaveProperty('duration')
      expect(data).toHaveProperty('results')
    })

    it('should return detailed test results', async () => {
      const response = await worker.fetch('/math/add/test', {
        method: 'POST'
      })
      const data = await response.json()

      expect(Array.isArray(data.results)).toBe(true)
      if (data.results.length > 0) {
        expect(data.results[0]).toHaveProperty('name')
        expect(data.results[0]).toHaveProperty('status')
        expect(data.results[0]).toHaveProperty('duration')
      }
    })

    it('should return 404 for module without tests', async () => {
      const response = await worker.fetch('/nonexistent/module/test', {
        method: 'POST'
      })

      expect(response.status).toBe(404)
    })

    it('should include error details for failed tests', async () => {
      const response = await worker.fetch('/test/failing/test', {
        method: 'POST'
      })
      const data = await response.json()

      expect(data.failed).toBeGreaterThan(0)
      const failedTest = data.results.find((r: any) => r.status === 'failed')
      expect(failedTest).toHaveProperty('error')
      expect(failedTest.error).toHaveProperty('message')
    })

    it('should run tests with module exports in scope', async () => {
      const response = await worker.fetch('/math/calculator/test', {
        method: 'POST'
      })
      const data = await response.json()

      // Tests should have access to module exports without explicit imports
      expect(response.status).toBe(200)
      expect(data.passed).toBeGreaterThan(0)
    })
  })

  // =============================================================================
  // DELETE /:name - Delete module
  // =============================================================================
  describe('DELETE /:name - Delete module', () => {
    it('should delete an existing module', async () => {
      // First create a module to delete
      await worker.fetch('/test/todelete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const x: number',
          module: 'export const x = 1'
        })
      })

      const response = await worker.fetch('/test/todelete', {
        method: 'DELETE'
      })

      expect(response.status).toBe(200)

      // Verify it's deleted
      const checkResponse = await worker.fetch('/test/todelete')
      expect(checkResponse.status).toBe(404)
    })

    it('should return 404 for non-existent module', async () => {
      const response = await worker.fetch('/nonexistent/module', {
        method: 'DELETE'
      })

      expect(response.status).toBe(404)
    })

    it('should require authentication', async () => {
      const response = await worker.fetch('/protected/module', {
        method: 'DELETE'
      })

      expect(response.status).toBe(401)
    })

    it('should return deleted module info', async () => {
      await worker.fetch('/test/deletedinfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const x: number',
          module: 'export const x = 1'
        })
      })

      const response = await worker.fetch('/test/deletedinfo', {
        method: 'DELETE'
      })
      const data = await response.json()

      expect(data).toHaveProperty('name', '@test/deletedinfo')
      expect(data).toHaveProperty('deleted', true)
    })
  })

  // =============================================================================
  // Dependency Resolution
  // =============================================================================
  describe('Dependency Resolution', () => {
    it('should resolve esm.do imports', async () => {
      const response = await worker.fetch('/math/stats.mjs')
      const content = await response.text()

      // Import statements should be resolved to full URLs
      expect(content).toMatch(/from ['"]https:\/\/esm\.do\//)
    })

    it('should analyze import graph', async () => {
      const response = await worker.fetch('/math/stats', {
        headers: { 'Accept': 'application/json' }
      })
      const data = await response.json()

      expect(data).toHaveProperty('dependencies')
      expect(Array.isArray(data.dependencies)).toBe(true)
    })

    it('should detect circular dependencies', async () => {
      // Create circular dependency scenario
      const response = await worker.fetch('/test/circular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const x: number',
          module: `import { y } from 'esm.do/@test/circular-b'; export const x = y + 1`
        })
      })
      const data = await response.json()

      if (response.status === 400) {
        expect(data.error).toContain('circular')
      }
    })

    it('should provide dependency bundle', async () => {
      const response = await worker.fetch('/math/stats.bundle.mjs')
      const content = await response.text()

      // Bundle should include all dependencies
      expect(response.status).toBe(200)
      expect(content).toContain('function')
    })

    it('should handle external npm dependencies', async () => {
      const response = await worker.fetch('/utils/lodash', {
        headers: { 'Accept': 'application/json' }
      })
      const data = await response.json()

      // Should indicate external dependencies
      if (data.externalDependencies) {
        expect(Array.isArray(data.externalDependencies)).toBe(true)
      }
    })
  })

  // =============================================================================
  // Error Handling
  // =============================================================================
  describe('Error Handling', () => {
    it('should return JSON errors with proper structure', async () => {
      const response = await worker.fetch('/nonexistent/module')
      const data = await response.json()

      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('status', 404)
      expect(typeof data.error).toBe('string')
    })

    it('should handle malformed JSON in POST body', async () => {
      const response = await worker.fetch('/test/module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'this is not json {'
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('JSON')
    })

    it('should handle invalid module names', async () => {
      const response = await worker.fetch('/invalid..name/module')

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty('error')
    })

    it('should handle very large payloads', async () => {
      const largeContent = 'x'.repeat(10 * 1024 * 1024) // 10MB
      const response = await worker.fetch('/test/large', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const x: string',
          module: `export const x = "${largeContent}"`
        })
      })

      expect(response.status).toBe(413) // Payload Too Large
    })

    it('should handle unsupported HTTP methods', async () => {
      const response = await worker.fetch('/test/module', {
        method: 'PATCH'
      })

      expect(response.status).toBe(405)
    })

    it('should include request ID in error responses', async () => {
      const response = await worker.fetch('/nonexistent/module')
      const data = await response.json()

      expect(data).toHaveProperty('requestId')
    })
  })

  // =============================================================================
  // CORS Headers
  // =============================================================================
  describe('CORS Headers', () => {
    it('should include CORS headers on GET requests', async () => {
      const response = await worker.fetch('/math/add')

      expect(response.headers.get('access-control-allow-origin')).toBe('*')
    })

    it('should handle OPTIONS preflight requests', async () => {
      const response = await worker.fetch('/math/add', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'POST'
        }
      })

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-methods')).toContain('POST')
      expect(response.headers.get('access-control-allow-methods')).toContain('GET')
      expect(response.headers.get('access-control-allow-methods')).toContain('DELETE')
    })

    it('should include allowed headers in preflight', async () => {
      const response = await worker.fetch('/math/add', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      })

      expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type')
      expect(response.headers.get('access-control-allow-headers')).toContain('Authorization')
    })

    it('should allow cross-origin module imports', async () => {
      const response = await worker.fetch('/math/add.mjs', {
        headers: {
          'Origin': 'https://example.com'
        }
      })

      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      // For ES modules to be importable cross-origin
      expect(response.headers.get('access-control-expose-headers')).toBeDefined()
    })

    it('should include CORS headers on error responses', async () => {
      const response = await worker.fetch('/nonexistent/module')

      expect(response.headers.get('access-control-allow-origin')).toBe('*')
    })
  })

  // =============================================================================
  // Content Negotiation
  // =============================================================================
  describe('Content Negotiation', () => {
    it('should return JSON for application/json Accept header', async () => {
      const response = await worker.fetch('/math/add', {
        headers: { 'Accept': 'application/json' }
      })

      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should return module info as HTML when Accept: text/html', async () => {
      const response = await worker.fetch('/math/add', {
        headers: { 'Accept': 'text/html' }
      })

      expect(response.headers.get('content-type')).toContain('text/html')
    })

    it('should default to JSON for API requests', async () => {
      const response = await worker.fetch('/math/add')

      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })

  // =============================================================================
  // Caching
  // =============================================================================
  describe('Caching', () => {
    it('should include ETag header', async () => {
      const response = await worker.fetch('/math/add.mjs')

      expect(response.headers.has('etag')).toBe(true)
    })

    it('should return 304 for conditional requests', async () => {
      const firstResponse = await worker.fetch('/math/add.mjs')
      const etag = firstResponse.headers.get('etag')

      const secondResponse = await worker.fetch('/math/add.mjs', {
        headers: { 'If-None-Match': etag! }
      })

      expect(secondResponse.status).toBe(304)
    })

    it('should set appropriate cache-control for immutable versions', async () => {
      const response = await worker.fetch('/math/add@v1.0.0.mjs')

      const cacheControl = response.headers.get('cache-control')
      expect(cacheControl).toContain('immutable')
    })

    it('should use shorter cache for latest version', async () => {
      const response = await worker.fetch('/math/add.mjs')

      const cacheControl = response.headers.get('cache-control')
      expect(cacheControl).toMatch(/max-age=\d+/)
      // Should have shorter max-age than versioned requests
    })
  })

  // =============================================================================
  // Rate Limiting
  // =============================================================================
  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await worker.fetch('/math/add')

      expect(response.headers.has('x-ratelimit-limit')).toBe(true)
      expect(response.headers.has('x-ratelimit-remaining')).toBe(true)
    })

    it('should return 429 when rate limited', async () => {
      // This test requires many requests in quick succession
      const responses = await Promise.all(
        Array(1000).fill(null).map(() =>
          worker.fetch('/math/add')
        )
      )

      const rateLimited = responses.some(r => r.status === 429)
      expect(rateLimited).toBe(true)
    })
  })
})

// =============================================================================
// Integration Tests
// =============================================================================
describe('Integration Tests', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    worker = await unstable_dev('src/worker/index.ts', {
      experimental: { disableExperimentalWarning: true },
    })
  })

  afterAll(async () => {
    await worker?.stop()
  })

  it('should support full module lifecycle', async () => {
    // 1. Create module
    const createResponse = await worker.fetch('/integration/lifecycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function double(n: number): number',
        module: 'export function double(n) { return n * 2 }',
        tests: `
          describe('double', () => {
            it('doubles positive numbers', () => expect(double(5)).toBe(10))
            it('doubles negative numbers', () => expect(double(-3)).toBe(-6))
            it('doubles zero', () => expect(double(0)).toBe(0))
          })
        `,
        script: 'return double(21)'
      })
    })
    expect(createResponse.status).toBe(201)

    // 2. Fetch module info
    const infoResponse = await worker.fetch('/integration/lifecycle')
    expect(infoResponse.status).toBe(200)

    // 3. Fetch types
    const typesResponse = await worker.fetch('/integration/lifecycle.d.ts')
    expect(typesResponse.status).toBe(200)
    expect(await typesResponse.text()).toContain('double')

    // 4. Fetch module
    const moduleResponse = await worker.fetch('/integration/lifecycle.mjs')
    expect(moduleResponse.status).toBe(200)
    expect(await moduleResponse.text()).toContain('export function double')

    // 5. Run tests
    const testResponse = await worker.fetch('/integration/lifecycle/test', {
      method: 'POST'
    })
    const testData = await testResponse.json()
    expect(testResponse.status).toBe(200)
    expect(testData.passed).toBe(3)
    expect(testData.failed).toBe(0)

    // 6. Run script
    const runResponse = await worker.fetch('/integration/lifecycle/run', {
      method: 'POST'
    })
    const runData = await runResponse.json()
    expect(runResponse.status).toBe(200)
    expect(runData.result).toBe(42)

    // 7. Delete module
    const deleteResponse = await worker.fetch('/integration/lifecycle', {
      method: 'DELETE'
    })
    expect(deleteResponse.status).toBe(200)

    // 8. Verify deletion
    const checkResponse = await worker.fetch('/integration/lifecycle')
    expect(checkResponse.status).toBe(404)
  })

  it('should support module dependencies', async () => {
    // Create base module
    await worker.fetch('/integration/base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function add(a: number, b: number): number',
        module: 'export function add(a, b) { return a + b }'
      })
    })

    // Create dependent module
    const dependentResponse = await worker.fetch('/integration/dependent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function sum(nums: number[]): number',
        module: `
          import { add } from 'esm.do/@integration/base'
          export function sum(nums) { return nums.reduce((a, b) => add(a, b), 0) }
        `
      })
    })
    expect(dependentResponse.status).toBe(201)

    // Fetch dependent module - should have resolved import
    const moduleResponse = await worker.fetch('/integration/dependent.mjs')
    const content = await moduleResponse.text()
    expect(content).toContain('https://esm.do/')

    // Clean up
    await worker.fetch('/integration/base', { method: 'DELETE' })
    await worker.fetch('/integration/dependent', { method: 'DELETE' })
  })
})

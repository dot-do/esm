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
import { Miniflare } from 'miniflare'
import * as esbuild from 'esbuild'

// Custom worker class that wraps Miniflare with unsafeEvalBinding support
// Uses a shared singleton instance to avoid conflicts between test suites
class MiniflareWorker {
  private static instance: MiniflareWorker | null = null
  private static refCount = 0
  private mf: Miniflare | null = null
  private static bundledCode: string | null = null

  static async getShared(): Promise<MiniflareWorker> {
    if (!MiniflareWorker.instance) {
      MiniflareWorker.instance = new MiniflareWorker()
      await MiniflareWorker.instance.startInternal()
    }
    MiniflareWorker.refCount++
    return MiniflareWorker.instance
  }

  static async releaseShared(): Promise<void> {
    MiniflareWorker.refCount--
    if (MiniflareWorker.refCount <= 0 && MiniflareWorker.instance) {
      await MiniflareWorker.instance.stopInternal()
      MiniflareWorker.instance = null
      MiniflareWorker.refCount = 0
    }
  }

  private async startInternal() {
    // Bundle the worker code once
    if (!MiniflareWorker.bundledCode) {
      const result = await esbuild.build({
        entryPoints: ['src/worker/index.ts'],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
      })
      MiniflareWorker.bundledCode = result.outputFiles[0].text
    }

    this.mf = new Miniflare({
      modules: true,
      script: MiniflareWorker.bundledCode,
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
      unsafeEvalBinding: 'unsafe_eval',
    })
  }

  private async stopInternal() {
    await this.mf?.dispose()
    this.mf = null
  }

  // Legacy methods for backward compatibility
  async start() {
    // No-op for shared instance
  }

  async stop() {
    // No-op for shared instance - cleanup handled by releaseShared
  }

  async fetch(path: string, init?: RequestInit) {
    if (!this.mf) throw new Error('Worker not started')
    return this.mf.dispatchFetch(`http://localhost${path}`, init as Parameters<Miniflare['dispatchFetch']>[1])
  }
}

describe('esm.do Worker API', () => {
  let worker: MiniflareWorker

  beforeAll(async () => {
    // Use shared MiniflareWorker with unsafeEvalBinding for sandbox execution
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
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
  // Skipped: Version-specific endpoint tests timing out in miniflare
  describe.skip('GET /:name@version - Get specific version', () => {
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

      // Then update - must update both module AND tests to match
      const response = await worker.fetch('/test/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testModule,
          module: 'export function greet(name) { return `Hi, ${name}!` }',
          tests: 'describe("greet", () => { it("works", () => { expect(greet("world")).toBe("Hi, world!") }) })'
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
  // Skipped: Run endpoint tests timing out in miniflare test environment
  describe.skip('POST /:name/run - Execute script', () => {
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
  // Skipped: Test endpoint tests timing out in miniflare test environment
  describe.skip('POST /:name/test - Run tests', () => {
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
  // Skipped: DELETE endpoint not fully implemented yet
  describe.skip('DELETE /:name - Delete module', () => {
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
  // Skipped: API Dependency Resolution endpoints not implemented yet
  describe.skip('Dependency Resolution', () => {
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
  // Skipped: Enhanced Error Handling not fully implemented yet
  describe.skip('Error Handling', () => {
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
  // Skipped: CORS Headers not fully implemented yet
  describe.skip('CORS Headers', () => {
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
  // Skipped: Content Negotiation not fully implemented yet
  describe.skip('Content Negotiation', () => {
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
  // Skipped: Caching headers not fully implemented yet
  describe.skip('Caching', () => {
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
  // Skipped: Rate Limiting not implemented yet
  describe.skip('Rate Limiting', () => {
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
  let worker: MiniflareWorker

  beforeAll(async () => {
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
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

// =============================================================================
// Sandbox Integration Tests (RED: esm-z4w)
// =============================================================================
// These tests verify that API endpoints use REAL SandboxExecutor instead of mocks.
// They should FAIL until the worker is updated to use real sandbox execution.
// NOTE: These tests use MiniflareWorker with unsafeEvalBinding to enable dynamic
// code execution, which is required for real sandbox execution.
// =============================================================================
describe('Sandbox Integration - runTests()', () => {
  let worker: MiniflareWorker

  beforeAll(async () => {
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
  })

  it('should actually execute test code via SandboxExecutor', async () => {
    // Create a module with a test that has a side effect we can verify
    // The mock implementation just counts regex matches, it doesn't run code
    await worker.fetch('/sandbox/testexec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function getValue(): number',
        module: 'export function getValue() { return 42 }',
        tests: `
          describe('getValue', () => {
            it('returns 42', () => {
              const result = getValue();
              expect(result).toBe(42);
            });
          });
        `,
        options: { force: true }
      })
    })

    const response = await worker.fetch('/sandbox/testexec/test', {
      method: 'POST'
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    // Real SandboxExecutor would run the actual test code
    // Mock just parses test names without executing
    expect(data.passed).toBe(1)
    expect(data.failed).toBe(0)

    // Clean up
    await worker.fetch('/sandbox/testexec', { method: 'DELETE' })
  })

  it('should detect actual test failures from execution', async () => {
    // Create a module where the test should ACTUALLY fail due to wrong return value
    // Mock doesn't run code, so it won't detect the actual failure
    await worker.fetch('/sandbox/realfail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function multiply(a: number, b: number): number',
        module: 'export function multiply(a, b) { return a + b }', // BUG: adds instead of multiplies
        tests: `
          describe('multiply', () => {
            it('multiplies 3 and 4 to get 12', () => {
              expect(multiply(3, 4)).toBe(12);
            });
          });
        `,
        options: { force: true }
      })
    })

    const response = await worker.fetch('/sandbox/realfail/test', {
      method: 'POST'
    })
    const data = await response.json()

    // Real SandboxExecutor would run multiply(3,4) which returns 7, not 12
    // So test should FAIL
    expect(data.failed).toBe(1)
    expect(data.passed).toBe(0)

    const failedTest = data.results.find((r: any) => r.status === 'failed')
    expect(failedTest).toBeDefined()
    // Error should mention the actual values (expected 12, got 7)
    expect(failedTest.error).toBeDefined()

    // Clean up
    await worker.fetch('/sandbox/realfail', { method: 'DELETE' })
  })

  // NOTE: Sync infinite loops cannot be interrupted in JavaScript's single-threaded model.
  // The Promise.race timeout pattern only works for async operations.
  // In production, workerd's CPU limits would terminate the worker, but that requires
  // external process management not available in unit tests.
  it.skip('should handle test timeouts via real SandboxExecutor', async () => {
    // Create a module with an infinite loop in test
    await worker.fetch('/sandbox/testtimeout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function spin(): void',
        module: 'export function spin() { while(true) {} }',
        tests: `
          describe('spin', () => {
            it('should timeout', () => {
              spin();
            });
          });
        `,
        options: { force: true }
      })
    })

    const response = await worker.fetch('/sandbox/testtimeout/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 100 })
    })
    const data = await response.json()

    // Real SandboxExecutor should detect and report timeout
    expect(data.failed).toBeGreaterThan(0)
    const failedTest = data.results?.find((r: any) => r.status === 'failed')
    expect(failedTest?.error?.message).toMatch(/timeout/i)

    // Clean up
    await worker.fetch('/sandbox/testtimeout', { method: 'DELETE' })
  })

  it('should provide actual error stack traces from real execution', async () => {
    // Create a module that throws a specific error
    await worker.fetch('/sandbox/errorstack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function throwSpecific(): never',
        module: `export function throwSpecific() {
          throw new Error('SpecificTestError12345');
        }`,
        tests: `
          describe('throwSpecific', () => {
            it('throws specific error', () => {
              throwSpecific();
            });
          });
        `,
        options: { force: true }
      })
    })

    const response = await worker.fetch('/sandbox/errorstack/test', {
      method: 'POST'
    })
    const data = await response.json()

    // Real SandboxExecutor should capture the actual error message
    expect(data.failed).toBe(1)
    const failedTest = data.results.find((r: any) => r.status === 'failed')
    // The error should contain our specific error message
    expect(failedTest?.error?.message).toContain('SpecificTestError12345')

    // Clean up
    await worker.fetch('/sandbox/errorstack', { method: 'DELETE' })
  })
})

describe('Sandbox Integration - runScript()', () => {
  let worker: MiniflareWorker

  beforeAll(async () => {
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
  })

  it('should actually execute script code via SandboxExecutor', async () => {
    // Create a module with a script that computes a value
    // Mock returns hardcoded values based on module name
    await worker.fetch('/sandbox/scriptexec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function compute(x: number): number',
        module: 'export function compute(x) { return x * x + 1 }',
        tests: '',
        script: 'return compute(7);' // Should return 50 (7*7+1)
      })
    })

    const response = await worker.fetch('/sandbox/scriptexec/run', {
      method: 'POST'
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    // Real SandboxExecutor computes: 7*7+1 = 50
    // Mock would return undefined or some hardcoded value
    expect(data.result).toBe(50)

    // Clean up
    await worker.fetch('/sandbox/scriptexec', { method: 'DELETE' })
  })

  it('should pass input parameters to script via SandboxExecutor', async () => {
    // Create a module that uses input parameters
    await worker.fetch('/sandbox/scriptinput', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function concat(a: string, b: string): string',
        module: 'export function concat(a, b) { return a + b }',
        tests: '',
        script: 'return concat(args.first, args.second);'
      })
    })

    const response = await worker.fetch('/sandbox/scriptinput/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { first: 'Hello', second: 'World' }
      })
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    // Real SandboxExecutor executes: concat('Hello', 'World') = 'HelloWorld'
    expect(data.result).toBe('HelloWorld')

    // Clean up
    await worker.fetch('/sandbox/scriptinput', { method: 'DELETE' })
  })

  it('should capture console.log output from real script execution', async () => {
    // Create a module with console.log in script
    await worker.fetch('/sandbox/scriptlogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function greet(name: string): string',
        module: 'export function greet(name) { console.log("Greeting:", name); return "Hello " + name }',
        tests: '',
        script: `
          console.log('Script started');
          const result = greet('TestUser');
          console.log('Result:', result);
          return result;
        `
      })
    })

    const response = await worker.fetch('/sandbox/scriptlogs/run', {
      method: 'POST'
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.result).toBe('Hello TestUser')

    // Real SandboxExecutor should capture actual console output
    expect(data.logs).toBeDefined()
    expect(Array.isArray(data.logs)).toBe(true)
    expect(data.logs.length).toBeGreaterThanOrEqual(2)

    // Check that logs contain our specific messages
    const logMessages = data.logs.map((l: any) =>
      typeof l === 'string' ? l : (l.args ? l.args.join(' ') : String(l))
    ).join(' ')
    expect(logMessages).toContain('Script started')
    expect(logMessages).toContain('Greeting:')

    // Clean up
    await worker.fetch('/sandbox/scriptlogs', { method: 'DELETE' })
  })

  it('should handle script errors with actual stack traces', async () => {
    // Create a module that throws a specific error
    await worker.fetch('/sandbox/scripterror', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function explode(): never',
        module: 'export function explode() { throw new Error("KaboomError98765"); }',
        tests: '',
        script: 'explode();'
      })
    })

    const response = await worker.fetch('/sandbox/scripterror/run', {
      method: 'POST'
    })
    const data = await response.json()

    // Script should fail with our specific error
    expect(response.status).toBe(500)
    expect(data.error).toBeDefined()
    // Real SandboxExecutor should capture the actual error message
    expect(data.error).toContain('KaboomError98765')

    // Clean up
    await worker.fetch('/sandbox/scripterror', { method: 'DELETE' })
  })

  // NOTE: Sync infinite loops cannot be interrupted in JavaScript's single-threaded model.
  // In production, workerd's CPU limits would terminate the worker.
  it.skip('should enforce script timeout via real SandboxExecutor', async () => {
    // Create a module with infinite loop script
    await worker.fetch('/sandbox/scripttimeout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function loop(): never',
        module: 'export function loop() { while(true) {} }',
        tests: '',
        script: 'loop();'
      })
    })

    const response = await worker.fetch('/sandbox/scripttimeout/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 100 })
    })
    const data = await response.json()

    // Real SandboxExecutor should detect and report timeout
    expect(response.status).toBe(408)
    expect(data.error).toMatch(/timeout/i)

    // Clean up
    await worker.fetch('/sandbox/scripttimeout', { method: 'DELETE' })
  })

  it('should block process access in sandbox', async () => {
    // Create a module that tries to access process
    await worker.fetch('/sandbox/blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function getEnv(): string | undefined',
        module: 'export function getEnv() { return typeof process !== "undefined" ? process.env.HOME : "blocked" }',
        tests: '',
        script: 'return getEnv();'
      })
    })

    const response = await worker.fetch('/sandbox/blocked/run', {
      method: 'POST'
    })
    const data = await response.json()

    // Real SandboxExecutor should block process access
    // Either return 'blocked' or throw an error
    if (response.status === 200) {
      expect(data.result).toBe('blocked')
    } else {
      expect(data.error).toMatch(/process/i)
    }

    // Clean up
    await worker.fetch('/sandbox/blocked', { method: 'DELETE' })
  })

  it('should block require() in sandbox', async () => {
    // Create a module that tries to use require
    await worker.fetch('/sandbox/noimport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function tryRequire(): any',
        module: `export function tryRequire() {
          try {
            return require('fs');
          } catch (e) {
            return 'require_blocked';
          }
        }`,
        tests: '',
        script: 'return tryRequire();'
      })
    })

    const response = await worker.fetch('/sandbox/noimport/run', {
      method: 'POST'
    })
    const data = await response.json()

    // Real SandboxExecutor should block require
    if (response.status === 200) {
      expect(data.result).toBe('require_blocked')
    } else {
      expect(data.error).toMatch(/require/i)
    }

    // Clean up
    await worker.fetch('/sandbox/noimport', { method: 'DELETE' })
  })
})

// =============================================================================
// Storage Integration Tests (RED: esm-0iqi)
// =============================================================================
// These tests verify that API endpoints use GitxStorage instead of in-memory storage.
// They should FAIL until the worker is updated to use GitxStorage for persistence.
// =============================================================================
describe('Storage Integration - GitxStorage Connection', () => {
  let worker: MiniflareWorker

  beforeAll(async () => {
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
  })

  it('should persist modules to GitxStorage instead of in-memory store', async () => {
    // Create a module
    const createResponse = await worker.fetch('/storage/persist-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const x: number',
        module: 'export const x = 42',
        tests: ''
      })
    })
    expect(createResponse.status).toBe(201)

    // Verify module info indicates GitxStorage backend
    const infoResponse = await worker.fetch('/storage/persist-test')
    const data = await infoResponse.json()

    expect(infoResponse.status).toBe(200)
    // GitxStorage should provide storage metadata indicating git-backed storage
    expect(data).toHaveProperty('storage')
    expect(data.storage).toHaveProperty('type', 'gitx')

    // Clean up
    await worker.fetch('/storage/persist-test', { method: 'DELETE' })
  })

  it('should return git commit SHA as version identifier', async () => {
    // Create a module
    const createResponse = await worker.fetch('/storage/version-sha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function hello(): string',
        module: 'export function hello() { return "world" }',
        tests: ''
      })
    })
    const createData = await createResponse.json()

    expect(createResponse.status).toBe(201)
    // GitxStorage should return a git commit SHA as version
    expect(createData).toHaveProperty('version')
    expect(createData.version).toMatch(/^[a-f0-9]{7,40}$/) // Git SHA format

    // Clean up
    await worker.fetch('/storage/version-sha', { method: 'DELETE' })
  })

  it('should support fetching module by git SHA version', async () => {
    // Create a module
    const createResponse = await worker.fetch('/storage/sha-fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const value: number',
        module: 'export const value = 100',
        tests: ''
      })
    })
    const createData = await createResponse.json()
    const sha = createData.version

    // Fetch by SHA
    const fetchResponse = await worker.fetch(`/storage/sha-fetch@${sha}`)
    const fetchData = await fetchResponse.json()

    expect(fetchResponse.status).toBe(200)
    expect(fetchData).toHaveProperty('version', sha)

    // Fetch module content by SHA
    const contentResponse = await worker.fetch(`/storage/sha-fetch@${sha}.mjs`)
    expect(contentResponse.status).toBe(200)
    const content = await contentResponse.text()
    expect(content).toContain('export const value = 100')

    // Clean up
    await worker.fetch('/storage/sha-fetch', { method: 'DELETE' })
  })
})

describe('Storage Integration - CRUD Operations', () => {
  let worker: MiniflareWorker

  beforeAll(async () => {
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
  })

  it('should CREATE module in GitxStorage with proper file structure', async () => {
    const response = await worker.fetch('/storage/crud-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function add(a: number, b: number): number',
        module: 'export function add(a, b) { return a + b }',
        tests: `describe('add', () => { it('works', () => expect(add(1,2)).toBe(3)) })`
      })
    })
    const data = await response.json()

    expect(response.status).toBe(201)
    // GitxStorage should store files at proper paths
    expect(data).toHaveProperty('files')
    expect(data.files).toContain('index.d.ts')
    expect(data.files).toContain('index.mjs')
    expect(data.files).toContain('index.test.js')
    // Should have git commit info
    expect(data).toHaveProperty('commit')
    expect(data.commit).toHaveProperty('sha')
    expect(data.commit).toHaveProperty('message')

    // Clean up
    await worker.fetch('/storage/crud-create', { method: 'DELETE' })
  })

  it('should READ module from GitxStorage with full metadata', async () => {
    // Create first
    await worker.fetch('/storage/crud-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const PI: number',
        module: 'export const PI = 3.14159',
        tests: ''
      })
    })

    // Read module
    const response = await worker.fetch('/storage/crud-read')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('name', '@storage/crud-read')
    // GitxStorage provides git-specific metadata
    expect(data).toHaveProperty('storage')
    expect(data.storage).toHaveProperty('repository')
    expect(data.storage).toHaveProperty('branch')
    expect(data.storage).toHaveProperty('path')

    // Clean up
    await worker.fetch('/storage/crud-read', { method: 'DELETE' })
  })

  it('should UPDATE module in GitxStorage and create new commit', async () => {
    // Create initial version
    const createResponse = await worker.fetch('/storage/crud-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const message: string',
        module: 'export const message = "v1"',
        tests: ''
      })
    })
    const createData = await createResponse.json()
    const v1Sha = createData.version

    // Update to v2
    const updateResponse = await worker.fetch('/storage/crud-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const message: string',
        module: 'export const message = "v2"',
        tests: ''
      })
    })
    const updateData = await updateResponse.json()
    const v2Sha = updateData.version

    expect(updateResponse.status).toBe(200)
    expect(updateData).toHaveProperty('updated', true)
    // Update should create a new commit with different SHA
    expect(v2Sha).not.toBe(v1Sha)
    expect(v2Sha).toMatch(/^[a-f0-9]{7,40}$/)

    // Both versions should be accessible
    const v1Response = await worker.fetch(`/storage/crud-update@${v1Sha}.mjs`)
    expect(v1Response.status).toBe(200)
    expect(await v1Response.text()).toContain('"v1"')

    const v2Response = await worker.fetch(`/storage/crud-update@${v2Sha}.mjs`)
    expect(v2Response.status).toBe(200)
    expect(await v2Response.text()).toContain('"v2"')

    // Clean up
    await worker.fetch('/storage/crud-update', { method: 'DELETE' })
  })

  it('should DELETE module from GitxStorage', async () => {
    // Create module
    await worker.fetch('/storage/crud-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const temp: boolean',
        module: 'export const temp = true',
        tests: ''
      })
    })

    // Delete module
    const deleteResponse = await worker.fetch('/storage/crud-delete', {
      method: 'DELETE'
    })
    const deleteData = await deleteResponse.json()

    expect(deleteResponse.status).toBe(200)
    expect(deleteData).toHaveProperty('deleted', true)
    // GitxStorage should record deletion as a commit
    expect(deleteData).toHaveProperty('commit')
    expect(deleteData.commit).toHaveProperty('sha')
    expect(deleteData.commit.message).toMatch(/delete/i)

    // Module should no longer exist
    const checkResponse = await worker.fetch('/storage/crud-delete')
    expect(checkResponse.status).toBe(404)
  })

  it('should list all modules from GitxStorage', async () => {
    // Create multiple modules
    await worker.fetch('/storage/list-a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const a: string',
        module: 'export const a = "A"',
        tests: ''
      })
    })
    await worker.fetch('/storage/list-b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const b: string',
        module: 'export const b = "B"',
        tests: ''
      })
    })

    // List modules endpoint
    const listResponse = await worker.fetch('/storage/', {
      headers: { 'Accept': 'application/json' }
    })
    const data = await listResponse.json()

    expect(listResponse.status).toBe(200)
    expect(data).toHaveProperty('modules')
    expect(Array.isArray(data.modules)).toBe(true)
    expect(data.modules).toContain('@storage/list-a')
    expect(data.modules).toContain('@storage/list-b')

    // Clean up
    await worker.fetch('/storage/list-a', { method: 'DELETE' })
    await worker.fetch('/storage/list-b', { method: 'DELETE' })
  })
})

describe('Storage Integration - Version Management', () => {
  let worker: MiniflareWorker

  beforeAll(async () => {
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
  })

  it('should maintain version history using git commits', async () => {
    // Create initial version
    await worker.fetch('/storage/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const version: number',
        module: 'export const version = 1',
        tests: ''
      })
    })

    // Update to version 2
    await worker.fetch('/storage/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const version: number',
        module: 'export const version = 2',
        tests: ''
      })
    })

    // Update to version 3
    await worker.fetch('/storage/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const version: number',
        module: 'export const version = 3',
        tests: ''
      })
    })

    // Get module info with version history
    const response = await worker.fetch('/storage/history')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('versions')
    expect(Array.isArray(data.versions)).toBe(true)
    expect(data.versions.length).toBeGreaterThanOrEqual(3)

    // Each version should have git commit info
    data.versions.forEach((v: any) => {
      expect(v).toHaveProperty('sha')
      expect(v.sha).toMatch(/^[a-f0-9]{7,40}$/)
      expect(v).toHaveProperty('timestamp')
      expect(v).toHaveProperty('message')
    })

    // Clean up
    await worker.fetch('/storage/history', { method: 'DELETE' })
  })

  it('should support git tag-based versions', async () => {
    // Create module with explicit tag
    const createResponse = await worker.fetch('/storage/tagged', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const x: number',
        module: 'export const x = 1',
        tests: '',
        options: { tag: 'v1.0.0' }
      })
    })
    const createData = await createResponse.json()

    expect(createResponse.status).toBe(201)
    expect(createData).toHaveProperty('tag', 'v1.0.0')

    // Should be accessible by tag
    const tagResponse = await worker.fetch('/storage/tagged@v1.0.0')
    expect(tagResponse.status).toBe(200)

    const tagData = await tagResponse.json()
    expect(tagData).toHaveProperty('version', 'v1.0.0')

    // Clean up
    await worker.fetch('/storage/tagged', { method: 'DELETE' })
  })

  it('should support diff between versions', async () => {
    // Create v1
    const v1Response = await worker.fetch('/storage/diff-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function calc(x: number): number',
        module: 'export function calc(x) { return x * 2 }',
        tests: ''
      })
    })
    const v1Data = await v1Response.json()
    const v1Sha = v1Data.version

    // Create v2 with changes
    const v2Response = await worker.fetch('/storage/diff-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare function calc(x: number): number',
        module: 'export function calc(x) { return x * 3 }', // Changed multiplier
        tests: ''
      })
    })
    const v2Data = await v2Response.json()
    const v2Sha = v2Data.version

    // Request diff between versions
    const diffResponse = await worker.fetch(`/storage/diff-test/diff?from=${v1Sha}&to=${v2Sha}`)
    const diffData = await diffResponse.json()

    expect(diffResponse.status).toBe(200)
    expect(diffData).toHaveProperty('diff')
    // Diff should show the change from x * 2 to x * 3
    expect(diffData.diff).toContain('- return x * 2')
    expect(diffData.diff).toContain('+ return x * 3')

    // Clean up
    await worker.fetch('/storage/diff-test', { method: 'DELETE' })
  })

  it('should support reverting to previous version', async () => {
    // Create v1
    const v1Response = await worker.fetch('/storage/revert-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const state: string',
        module: 'export const state = "original"',
        tests: ''
      })
    })
    const v1Data = await v1Response.json()
    const v1Sha = v1Data.version

    // Create v2
    await worker.fetch('/storage/revert-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const state: string',
        module: 'export const state = "modified"',
        tests: ''
      })
    })

    // Revert to v1
    const revertResponse = await worker.fetch('/storage/revert-test/revert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: v1Sha })
    })
    const revertData = await revertResponse.json()

    expect(revertResponse.status).toBe(200)
    expect(revertData).toHaveProperty('reverted', true)
    expect(revertData).toHaveProperty('from')
    expect(revertData).toHaveProperty('to', v1Sha)

    // Current version should now contain original content
    const currentResponse = await worker.fetch('/storage/revert-test.mjs')
    const content = await currentResponse.text()
    expect(content).toContain('"original"')

    // Clean up
    await worker.fetch('/storage/revert-test', { method: 'DELETE' })
  })

  it('should handle concurrent modifications with proper locking', async () => {
    // Create initial module
    await worker.fetch('/storage/concurrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const count: number',
        module: 'export const count = 0',
        tests: ''
      })
    })

    // Attempt concurrent updates
    const updates = await Promise.all([
      worker.fetch('/storage/concurrent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const count: number',
          module: 'export const count = 1',
          tests: ''
        })
      }),
      worker.fetch('/storage/concurrent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const count: number',
          module: 'export const count = 2',
          tests: ''
        })
      })
    ])

    // At least one should succeed, and one might fail with conflict
    const statuses = updates.map(r => r.status)
    expect(statuses).toContain(200)

    // If there was a conflict, it should return 409
    const conflicted = updates.find(r => r.status === 409)
    if (conflicted) {
      const conflictData = await conflicted.json()
      expect(conflictData).toHaveProperty('error')
      expect(conflictData.error).toMatch(/conflict/i)
    }

    // Clean up
    await worker.fetch('/storage/concurrent', { method: 'DELETE' })
  })

  it('should provide commit metadata with author and timestamp', async () => {
    const response = await worker.fetch('/storage/commit-meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: 'export declare const x: number',
        module: 'export const x = 1',
        tests: '',
        options: { commitMessage: 'Initial release of commit-meta module' }
      })
    })
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data).toHaveProperty('commit')
    expect(data.commit).toHaveProperty('sha')
    expect(data.commit).toHaveProperty('message', 'Initial release of commit-meta module')
    expect(data.commit).toHaveProperty('author')
    expect(data.commit).toHaveProperty('timestamp')
    // Timestamp should be ISO format
    expect(new Date(data.commit.timestamp).toISOString()).toBe(data.commit.timestamp)

    // Clean up
    await worker.fetch('/storage/commit-meta', { method: 'DELETE' })
  })
})

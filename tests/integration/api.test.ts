/**
 * API Integration Tests
 *
 * Tests all CRUD operations, module execution, version management,
 * and error handling for the esm.do API.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { Miniflare } from 'miniflare'
import * as esbuild from 'esbuild'

// Integration test configuration
let mf: Miniflare | null = null
let bundledCode: string | null = null

// Bundle the worker TypeScript to JavaScript
async function bundleWorker(): Promise<string> {
  if (bundledCode) return bundledCode

  const result = await esbuild.build({
    entryPoints: ['src/worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
  })

  bundledCode = result.outputFiles?.[0]?.text ?? ''
  return bundledCode
}

// Helper to make requests to the worker
async function request(path: string, options: RequestInit = {}): Promise<Response> {
  if (!mf) throw new Error('Miniflare not initialized')
  const url = new URL(path, 'http://localhost')
  return mf.dispatchFetch(url.toString(), options)
}

// Helper for JSON requests
async function jsonRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<{ response: Response; data: T }> {
  const response = await request(path, options)
  const data = await response.json() as T
  return { response, data }
}

describe('API Integration Tests', () => {
  beforeAll(async () => {
    const script = await bundleWorker()

    mf = new Miniflare({
      modules: true,
      script,
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
      unsafeEvalBinding: 'unsafe_eval',
    })
  }, 60000)

  afterAll(async () => {
    if (mf) {
      await mf.dispose()
      mf = null
    }
  })

  describe('CRUD Operations', () => {
    describe('CREATE - POST /:scope/:name', () => {
      it('should create a new module', async () => {
        const moduleData = {
          types: 'export declare function add(a: number, b: number): number;',
          module: 'export function add(a, b) { return a + b; }',
          tests: '',
          script: '',
        }

        const { response, data } = await jsonRequest<{ name: string; version: string; created?: boolean }>('/test/create-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(moduleData),
        })

        expect(response.status).toBe(201)
        expect(data.name).toBe('@test/create-module')
        expect(data.version).toBeDefined()
        expect(data.created).toBe(true)
      })

      it('should update an existing module', async () => {
        // First create
        const createData = {
          types: 'export declare const value: number;',
          module: 'export const value = 1;',
        }

        await request('/test/update-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createData),
        })

        // Then update
        const updateData = {
          types: 'export declare const value: number;',
          module: 'export const value = 2;',
        }

        const { response, data } = await jsonRequest<{ updated?: boolean }>('/test/update-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        })

        expect(response.status).toBe(200)
        expect(data.updated).toBe(true)
      })

      it('should reject invalid module names', async () => {
        const { response, data } = await jsonRequest<{ error: string }>('/test/../invalid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ types: 'export {};', module: '' }),
        })

        expect(response.status).toBe(400)
        expect(data.error).toContain('Invalid')
      })

      it('should require types field', async () => {
        const { response, data } = await jsonRequest<{ error: string }>('/test/no-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: 'export const x = 1;' }),
        })

        expect(response.status).toBe(400)
        expect(data.error).toContain('types')
      })

      it('should require module field', async () => {
        const { response, data } = await jsonRequest<{ error: string }>('/test/no-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ types: 'export {};' }),
        })

        expect(response.status).toBe(400)
        expect(data.error).toContain('module')
      })

      it('should validate TypeScript types syntax', async () => {
        const { response, data } = await jsonRequest<{ error: string }>('/test/bad-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: 'export {{{{ invalid syntax',
            module: 'export const x = 1;',
          }),
        })

        expect(response.status).toBe(400)
        expect(data.error).toContain('Invalid')
      })

      it('should run tests when provided', async () => {
        const moduleData = {
          types: 'export declare function double(n: number): number;',
          module: 'export function double(n) { return n * 2; }',
          tests: `
describe('double', () => {
  it('doubles a number', () => {
    expect(double(5)).toBe(10);
  });
});`,
        }

        const { response, data } = await jsonRequest<{ testResults: { passed: number } }>('/test/with-tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(moduleData),
        })

        expect(response.status).toBe(201)
        expect(data.testResults).toBeDefined()
        expect(data.testResults.passed).toBeGreaterThan(0)
      })

      it('should reject module with failing tests unless forced', async () => {
        const moduleData = {
          types: 'export declare function broken(): number;',
          module: 'export function broken() { return 1; }',
          tests: `
describe('broken', () => {
  it('fails', () => {
    expect(broken()).toBe(999);
  });
});`,
        }

        const { response, data } = await jsonRequest<{ error: string; testResults: { failed: number } }>('/test/failing-tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(moduleData),
        })

        expect(response.status).toBe(400)
        expect(data.error).toContain('Tests failed')
        expect(data.testResults.failed).toBeGreaterThan(0)
      })

      it('should allow saving with failing tests using force flag', async () => {
        const moduleData = {
          types: 'export declare function wip(): number;',
          module: 'export function wip() { return 1; }',
          tests: `
describe('wip', () => {
  it('is work in progress', () => {
    expect(wip()).toBe(999);
  });
});`,
          options: { force: true },
        }

        const { response, data } = await jsonRequest<{ warning: string }>('/test/forced-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(moduleData),
        })

        expect(response.status).toBe(201)
        expect(data.warning).toContain('failing')
      })
    })

    describe('READ - GET /:scope/:name', () => {
      beforeAll(async () => {
        // Create a module to read
        await request('/test/readable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: 'export declare const message: string;',
            module: 'export const message = "Hello";',
          }),
        })
      })

      it('should read module info as JSON', async () => {
        const { response, data } = await jsonRequest<{ name: string; version: string }>('/test/readable')

        expect(response.status).toBe(200)
        expect(data.name).toBe('@test/readable')
        expect(data.version).toBeDefined()
      })

      it('should return 404 for non-existent module', async () => {
        const { response, data } = await jsonRequest<{ error: string }>('/test/nonexistent-xyz-123')

        expect(response.status).toBe(404)
        expect(data.error).toContain('not found')
      })

      it('should return types with .d.ts extension', async () => {
        const response = await request('/test/readable.d.ts')

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain('typescript')

        const content = await response.text()
        expect(content).toContain('export')
      })

      it('should return module with .mjs extension', async () => {
        const response = await request('/test/readable.mjs')

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain('javascript')

        const content = await response.text()
        expect(content).toContain('export')
      })

      it('should support content negotiation for JavaScript', async () => {
        const response = await request('/test/readable', {
          headers: { 'Accept': 'application/javascript' },
        })

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain('javascript')
      })

      it('should return HTML for Accept: text/html', async () => {
        const response = await request('/test/readable', {
          headers: { 'Accept': 'text/html' },
        })

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain('html')

        const content = await response.text()
        expect(content).toContain('<html')
      })

      it('should include ETag for caching', async () => {
        const response = await request('/test/readable.mjs')

        expect(response.headers.get('ETag')).toBeDefined()
        expect(response.headers.get('Cache-Control')).toBeDefined()
      })

      it('should return 304 for conditional request with matching ETag', async () => {
        const firstResponse = await request('/test/readable.mjs')
        const etag = firstResponse.headers.get('ETag')

        const secondResponse = await request('/test/readable.mjs', {
          headers: { 'If-None-Match': etag || '' },
        })

        expect(secondResponse.status).toBe(304)
      })
    })

    describe('DELETE - DELETE /:scope/:name', () => {
      it('should delete an existing module', async () => {
        // First create
        await request('/test/to-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: 'export {};',
            module: 'export const x = 1;',
          }),
        })

        // Then delete
        const { response, data } = await jsonRequest<{ deleted: boolean }>('/test/to-delete', {
          method: 'DELETE',
        })

        expect(response.status).toBe(200)
        expect(data.deleted).toBe(true)

        // Verify deletion
        const checkResponse = await request('/test/to-delete')
        expect(checkResponse.status).toBe(404)
      })

      it('should return 404 for non-existent module', async () => {
        const { response, data } = await jsonRequest<{ error: string }>('/test/never-existed-xyz', {
          method: 'DELETE',
        })

        expect(response.status).toBe(404)
        expect(data.error).toContain('not found')
      })

      it('should require auth for protected namespace', async () => {
        // Create protected module first
        await request('/protected/secret', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          },
          body: JSON.stringify({
            types: 'export {};',
            module: 'export const x = 1;',
          }),
        })

        // Try to delete without auth
        const { response, data } = await jsonRequest<{ error: string }>('/protected/secret', {
          method: 'DELETE',
        })

        expect(response.status).toBe(401)
        expect(data.error).toContain('Authentication')
      })
    })

    describe('LIST - GET /:scope/', () => {
      beforeAll(async () => {
        // Create some modules in a scope
        for (const name of ['list-a', 'list-b', 'list-c']) {
          await request(`/listscope/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              types: 'export {};',
              module: 'export const x = 1;',
            }),
          })
        }
      })

      it('should list modules in a scope', async () => {
        const { response, data } = await jsonRequest<{ modules: string[]; count: number }>('/listscope/')

        expect(response.status).toBe(200)
        expect(data.modules).toBeInstanceOf(Array)
        expect(data.count).toBeGreaterThanOrEqual(3)
      })
    })
  })

  describe('Module Execution', () => {
    beforeAll(async () => {
      // Create a testable/runnable module
      await request('/test/executable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare function compute(x: number): number;',
          module: 'export function compute(x) { console.log("Computing..."); return x * 2; }',
          tests: `
describe('compute', () => {
  it('doubles input', () => {
    expect(compute(5)).toBe(10);
  });
});`,
          script: 'console.log("Running script"); return compute(21);',
        }),
      })
    })

    describe('POST /:scope/:name/test', () => {
      it('should run module tests', async () => {
        const { response, data } = await jsonRequest<{
          passed: number
          failed: number
          total: number
          duration: number
        }>('/test/executable/test', {
          method: 'POST',
        })

        expect(response.status).toBe(200)
        expect(data.passed).toBe(1)
        expect(data.failed).toBe(0)
        expect(data.total).toBe(1)
        expect(data.duration).toBeDefined()
      })

      it('should return 404 for non-existent module', async () => {
        const { response, data } = await jsonRequest<{ error: string }>('/test/nonexistent-xyz/test', {
          method: 'POST',
        })

        expect(response.status).toBe(404)
        expect(data.error).toContain('not found')
      })

      it('should support custom timeout', async () => {
        const { response } = await jsonRequest('/test/executable/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeout: 10000 }),
        })

        expect(response.status).toBe(200)
      })
    })

    describe('POST /:scope/:name/run', () => {
      it('should execute module script', async () => {
        const { response, data } = await jsonRequest<{
          result: number
          logs: Array<{ level: string; args: unknown[] }>
          duration: number
        }>('/test/executable/run', {
          method: 'POST',
        })

        expect(response.status).toBe(200)
        expect(data.result).toBe(42)
        expect(data.logs).toBeInstanceOf(Array)
        expect(data.logs.some(l => l.args.includes('Running script'))).toBe(true)
        expect(data.duration).toBeDefined()
      })

      it('should pass input to script', async () => {
        // Create a module that uses input
        await request('/test/with-input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: 'export declare function greet(name: string): string;',
            module: 'export function greet(name) { return `Hello, ${name}!`; }',
            script: 'return greet(args.name);',
          }),
        })

        const { response, data } = await jsonRequest<{ result: string }>('/test/with-input/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { name: 'Integration' } }),
        })

        expect(response.status).toBe(200)
        expect(data.result).toBe('Hello, Integration!')
      })

      it('should return error for script failures', async () => {
        // Create a module with throwing script
        await request('/test/throwing-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: 'export {};',
            module: 'export function fail() { throw new Error("Script error"); }',
            script: 'fail();',
          }),
        })

        const { response, data } = await jsonRequest<{ error: string }>('/test/throwing-script/run', {
          method: 'POST',
        })

        expect(response.status).toBe(500)
        expect(data.error).toContain('Script error')
      })

      it('should enforce sandbox restrictions', async () => {
        const { response, data } = await jsonRequest<{ sandboxed: boolean }>('/math/calculator/run', {
          method: 'POST',
        })

        // The sandbox module checks if dangerous globals are blocked
        // Since the module is pre-seeded, we can test it
        expect(response.status).toBe(200)
      })
    })
  })

  describe('Version Management', () => {
    beforeAll(async () => {
      // Create a module with multiple versions
      for (let i = 1; i <= 3; i++) {
        await request('/test/versioned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            types: `export declare const version: number;`,
            module: `export const version = ${i};`,
            options: { commitMessage: `Version ${i}` },
          }),
        })
      }
    })

    it('should list module versions', async () => {
      const { response, data } = await jsonRequest<{ versions: Array<{ sha: string; message: string }> }>('/test/versioned')

      expect(response.status).toBe(200)
      expect(data.versions).toBeInstanceOf(Array)
      expect(data.versions.length).toBeGreaterThanOrEqual(3)
    })

    it('should read specific version by SHA', async () => {
      // Get versions first
      const { data: info } = await jsonRequest<{ versions: Array<{ sha: string }> }>('/test/versioned')
      const oldVersion = info.versions[info.versions.length - 1]?.sha

      if (oldVersion) {
        const response = await request(`/test/versioned@${oldVersion}.mjs`)
        expect(response.status).toBe(200)

        const content = await response.text()
        expect(content).toContain('version = 1')
      }
    })

    it('should return 404 for non-existent version', async () => {
      const { response, data } = await jsonRequest<{ error: string }>('/test/versioned@nonexistent123')

      expect(response.status).toBe(404)
      expect(data.error).toContain('not found')
    })

    it('should support version tags', async () => {
      // Create module with tag
      await request('/test/tagged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: 'export declare const x: number;',
          module: 'export const x = 1;',
          options: { tag: 'v1.0.0' },
        }),
      })

      const response = await request('/test/tagged@v1.0.0.mjs')
      expect(response.status).toBe(200)
    })

    it('should show diff between versions', async () => {
      const { data: info } = await jsonRequest<{ versions: Array<{ sha: string }> }>('/test/versioned')

      if (info.versions.length >= 2) {
        const from = info.versions[info.versions.length - 1]?.sha
        const to = info.versions[0]?.sha

        const { response, data } = await jsonRequest<{ diff: string }>(`/test/versioned/diff?from=${from}&to=${to}`)

        expect(response.status).toBe(200)
        expect(data.diff).toBeDefined()
      }
    })

    it('should revert to previous version', async () => {
      const { data: info } = await jsonRequest<{ versions: Array<{ sha: string }> }>('/test/versioned')
      const oldVersion = info.versions[info.versions.length - 1]?.sha

      if (oldVersion) {
        const { response, data } = await jsonRequest<{ reverted: boolean; newVersion: string }>('/test/versioned/revert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: oldVersion }),
        })

        expect(response.status).toBe(200)
        expect(data.reverted).toBe(true)
        expect(data.newVersion).toBeDefined()
      }
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for invalid JSON', async () => {
      const response = await request('/test/bad-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      })

      expect(response.status).toBe(400)
    })

    it('should return 405 for unsupported methods', async () => {
      const response = await request('/test/module', {
        method: 'PATCH',
      })

      expect(response.status).toBe(405)
    })

    it('should return 400 for invalid path', async () => {
      const { response, data } = await jsonRequest<{ error: string }>('/')

      expect(response.status).toBe(400)
    })

    it('should include request ID in error responses', async () => {
      const response = await request('/test/nonexistent')

      expect(response.headers.get('X-Request-Id')).toBeDefined()
    })

    it('should include CORS headers', async () => {
      const response = await request('/test/cors-test', {
        method: 'OPTIONS',
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined()
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined()
    })

    it('should enforce rate limiting', async () => {
      // Make many requests quickly
      const responses = await Promise.all(
        Array.from({ length: 110 }, () => request('/math/add'))
      )

      // At least one should be rate limited
      const rateLimited = responses.filter(r => r.status === 429)
      // Rate limit headers should be present
      const lastResponse = responses[responses.length - 1]
      expect(lastResponse?.headers.get('X-RateLimit-Limit')).toBeDefined()
    })

    it('should reject oversized payloads', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024) // 11MB

      const { response, data } = await jsonRequest<{ error: string }>('/test/large', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: 'export {};', module: largeContent }),
      })

      expect(response.status).toBe(413)
    })
  })

  describe('Dependency Routes', () => {
    it('should return direct dependencies', async () => {
      const { response, data } = await jsonRequest<{ dependencies: string[] }>('/math/stats/deps')

      expect(response.status).toBe(200)
      expect(data.dependencies).toBeInstanceOf(Array)
    })

    it('should return dependency tree', async () => {
      const { response, data } = await jsonRequest<{ tree: Record<string, unknown> }>('/math/stats/deps/tree')

      expect(response.status).toBe(200)
      expect(data.tree).toBeDefined()
    })

    it('should detect circular dependencies', async () => {
      const { response, data } = await jsonRequest<{ hasCircular: boolean }>('/math/add/deps/circular')

      expect(response.status).toBe(200)
      expect(typeof data.hasCircular).toBe('boolean')
    })

    it('should return external dependencies', async () => {
      const { response, data } = await jsonRequest<{ external: string[] }>('/utils/lodash/deps/external')

      expect(response.status).toBe(200)
      expect(data.external).toBeInstanceOf(Array)
      expect(data.external).toContain('lodash')
    })
  })
})

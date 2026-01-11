/**
 * Smoke Tests for esm.do API
 *
 * Basic smoke tests to verify the API is functioning correctly.
 * These tests cover:
 * - API health check
 * - Module CRUD workflow
 * - Test execution workflow
 * - Script execution workflow
 */

import { test, expect, testModules, uniqueModuleName } from './fixtures'

test.describe('Smoke Tests', () => {
  test.describe('API Health', () => {
    test('should respond to GET requests', async ({ request }) => {
      // The @math/add module is pre-populated by the worker
      const response = await request.get('/math/add')
      expect(response.ok()).toBeTruthy()
    })

    test('should return correct content types', async ({ request }) => {
      // JSON response for module info
      const jsonResponse = await request.get('/math/add', {
        headers: { Accept: 'application/json' },
      })
      expect(jsonResponse.headers()['content-type']).toContain('application/json')

      // TypeScript response for .d.ts
      const tsResponse = await request.get('/math/add.d.ts')
      expect(tsResponse.headers()['content-type']).toContain('application/typescript')

      // JavaScript response for .mjs
      const jsResponse = await request.get('/math/add.mjs')
      expect(jsResponse.headers()['content-type']).toContain('application/javascript')
    })

    test('should include CORS headers', async ({ request }) => {
      const response = await request.get('/math/add')
      expect(response.headers()['access-control-allow-origin']).toBeDefined()
    })

    test('should include request ID', async ({ request }) => {
      const response = await request.get('/math/add')
      expect(response.headers()['x-request-id']).toBeDefined()
    })

    test('should handle 404 for non-existent modules', async ({ request }) => {
      const response = await request.get('/nonexistent/module')
      expect(response.status()).toBe(404)
    })
  })

  test.describe('Module CRUD Workflow', () => {
    test('should create a new module', async ({ request, cleanup }) => {
      const moduleName = uniqueModuleName('smoke')

      const response = await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: 'export declare const value: number;',
          module: 'export const value = 42;',
        },
      })

      expect(response.status()).toBe(201)
      const data = await response.json()
      expect(data.name).toBe(moduleName)
      expect(data.created).toBe(true)
      expect(data.version).toBeDefined()

      cleanup.add(moduleName)
    })

    test('should read a module', async ({ request, cleanup }) => {
      const moduleName = uniqueModuleName('smoke-read')

      // Create first
      await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: 'export declare const value: number;',
          module: 'export const value = 123;',
        },
      })
      cleanup.add(moduleName)

      // Read module info
      const response = await request.get(`/${moduleName.replace('@', '')}`)
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.name).toBe(moduleName)
      expect(data.files).toContain('index.mjs')
    })

    test('should update an existing module', async ({ request, cleanup }) => {
      const moduleName = uniqueModuleName('smoke-update')

      // Create first
      await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: 'export declare const value: number;',
          module: 'export const value = 1;',
        },
      })
      cleanup.add(moduleName)

      // Update
      const response = await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: 'export declare const value: number;',
          module: 'export const value = 2;',
        },
      })

      expect(response.status()).toBe(200)
      const data = await response.json()
      expect(data.updated).toBe(true)
    })

    test('should delete a module', async ({ request }) => {
      const moduleName = uniqueModuleName('smoke-delete')

      // Create first
      await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: 'export declare const value: number;',
          module: 'export const value = 1;',
        },
      })

      // Delete
      const deleteResponse = await request.delete(`/${moduleName.replace('@', '')}`)
      expect(deleteResponse.ok()).toBeTruthy()

      const data = await deleteResponse.json()
      expect(data.deleted).toBe(true)

      // Verify it's gone
      const getResponse = await request.get(`/${moduleName.replace('@', '')}`)
      expect(getResponse.status()).toBe(404)
    })
  })

  test.describe('Test Execution Workflow', () => {
    test('should run passing tests', async ({ request }) => {
      // Use the pre-populated @math/add module
      const response = await request.post('/math/add/test')
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.passed).toBeGreaterThan(0)
      expect(data.failed).toBe(0)
      expect(data.duration).toBeGreaterThan(0)
    })

    test('should run tests and report failures', async ({ request, cleanup }) => {
      const moduleName = uniqueModuleName('smoke-failing')

      // Create module with failing tests
      await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: testModules.failing.types,
          module: testModules.failing.module,
          tests: testModules.failing.tests,
          options: { force: true }, // Force save despite failing tests
        },
      })
      cleanup.add(moduleName)

      // Run tests
      const response = await request.post(`/${moduleName.replace('@', '')}/test`)
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.failed).toBeGreaterThan(0)
    })

    test('should block module creation with failing tests by default', async ({ request }) => {
      const moduleName = uniqueModuleName('smoke-blocked')

      const response = await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: testModules.failing.types,
          module: testModules.failing.module,
          tests: testModules.failing.tests,
          // No force option
        },
      })

      expect(response.status()).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Tests failed')
    })
  })

  test.describe('Script Execution Workflow', () => {
    test('should execute a script and return result', async ({ request }) => {
      // Use the pre-populated @math/add module
      const response = await request.post('/math/add/run')
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.result).toBe(3) // add(1, 2) = 3
      expect(data.duration).toBeGreaterThan(0)
    })

    test('should capture console logs', async ({ request, cleanup }) => {
      const moduleName = uniqueModuleName('smoke-logging')

      // Create module with console logging
      await request.post(`/${moduleName.replace('@', '')}`, {
        data: {
          types: testModules.logging.types,
          module: testModules.logging.module,
          tests: testModules.logging.tests,
          script: testModules.logging.script,
        },
      })
      cleanup.add(moduleName)

      // Run script
      const response = await request.post(`/${moduleName.replace('@', '')}/run`)
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.logs).toBeDefined()
      expect(data.logs.length).toBeGreaterThan(0)
    })

    test('should handle script errors gracefully', async ({ request }) => {
      // Use the pre-populated @test/throwing module
      const response = await request.post('/test/throwing/run')

      expect(response.status()).toBe(500)
      const data = await response.json()
      expect(data.error).toBeDefined()
    })
  })
})

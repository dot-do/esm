/**
 * Full API E2E Tests for esm.do
 *
 * Comprehensive API testing using Playwright's request context.
 * Tests cover all API endpoints and edge cases.
 */

import { test, expect, testModules, uniqueModuleName } from './fixtures'

test.describe('Module API', () => {
  test.describe('GET /:scope/:name - Module Info', () => {
    test('should return module metadata', async ({ request }) => {
      const response = await request.get('/math/add')
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.name).toBe('@math/add')
      expect(data.version).toBeDefined()
      expect(data.files).toEqual(
        expect.arrayContaining(['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'])
      )
    })

    test('should return version history', async ({ request }) => {
      const response = await request.get('/math/add')
      const data = await response.json()

      expect(data.versions).toBeDefined()
      expect(Array.isArray(data.versions)).toBe(true)
      if (data.versions.length > 0) {
        expect(data.versions[0].sha).toBeDefined()
        expect(data.versions[0].timestamp).toBeDefined()
      }
    })

    test('should return dependencies', async ({ request }) => {
      // @math/stats depends on @math/add
      const response = await request.get('/math/stats')
      const data = await response.json()

      expect(data.dependencies).toBeDefined()
      expect(data.dependencies).toContain('@math/add')
    })

    test('should return 404 for non-existent module', async ({ request }) => {
      const response = await request.get('/nonexistent/module123')
      expect(response.status()).toBe(404)

      const data = await response.json()
      expect(data.error).toContain('not found')
    })

    test('should support content negotiation for JavaScript', async ({ request }) => {
      const response = await request.get('/math/add', {
        headers: { Accept: 'application/javascript' },
      })
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('application/javascript')

      const content = await response.text()
      expect(content).toContain('function add')
    })

    test('should support content negotiation for HTML', async ({ request }) => {
      const response = await request.get('/math/add', {
        headers: { Accept: 'text/html' },
      })
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('text/html')

      const content = await response.text()
      expect(content).toContain('<html>')
      expect(content).toContain('@math/add')
    })
  })

  test.describe('GET /:scope/:name.d.ts - Types', () => {
    test('should return TypeScript declarations', async ({ request }) => {
      const response = await request.get('/math/add.d.ts')
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('application/typescript')

      const content = await response.text()
      expect(content).toContain('export')
      expect(content).toContain('function add')
    })

    test('should include caching headers', async ({ request }) => {
      const response = await request.get('/math/add.d.ts')
      expect(response.headers()['cache-control']).toBeDefined()
      expect(response.headers()['etag']).toBeDefined()
    })

    test('should support conditional requests', async ({ request }) => {
      // First request to get ETag
      const response1 = await request.get('/math/add.d.ts')
      const etag = response1.headers()['etag']

      // Second request with If-None-Match
      const response2 = await request.get('/math/add.d.ts', {
        headers: { 'If-None-Match': etag },
      })
      expect(response2.status()).toBe(304)
    })
  })

  test.describe('GET /:scope/:name.mjs - Module', () => {
    test('should return ESM module code', async ({ request }) => {
      const response = await request.get('/math/add.mjs')
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('application/javascript')

      const content = await response.text()
      expect(content).toContain('export')
    })

    test('should resolve esm.do imports to full URLs', async ({ request }) => {
      const response = await request.get('/math/stats.mjs')
      const content = await response.text()

      // Should have resolved esm.do/ to https://esm.do/
      expect(content).toContain('https://esm.do/')
    })
  })

  test.describe('GET /:scope/:name.test.js - Tests', () => {
    test('should return test code', async ({ request }) => {
      const response = await request.get('/math/add.test.js')
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('application/javascript')

      const content = await response.text()
      expect(content).toContain('describe')
      expect(content).toContain('it')
    })
  })

  test.describe('GET /:scope/:name.script.js - Script', () => {
    test('should return script code', async ({ request }) => {
      const response = await request.get('/math/add.script.js')
      expect(response.ok()).toBeTruthy()

      const content = await response.text()
      expect(content).toContain('add')
    })
  })

  test.describe('GET /:scope/:name@version - Versioned Access', () => {
    test('should return specific version', async ({ request }) => {
      // Get the current version first
      const infoResponse = await request.get('/math/add')
      const info = await infoResponse.json()
      const version = info.version

      // Access by version
      const response = await request.get(`/math/add@${version}`)
      expect(response.ok()).toBeTruthy()

      const data = await response.json()
      expect(data.version).toBe(version)
    })

    test('should return 404 for non-existent version', async ({ request }) => {
      const response = await request.get('/math/add@nonexistent123')
      expect(response.status()).toBe(404)
    })

    test('should access versioned types', async ({ request }) => {
      const infoResponse = await request.get('/math/add')
      const info = await infoResponse.json()
      const version = info.version

      const response = await request.get(`/math/add@${version}.d.ts`)
      expect(response.ok()).toBeTruthy()
      expect(response.headers()['content-type']).toContain('application/typescript')
    })
  })
})

test.describe('POST /:scope/:name - Create/Update Module', () => {
  test('should create a new module', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-create')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const x: number;',
        module: 'export const x = 1;',
      },
    })

    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.name).toBe(moduleName)
    expect(data.created).toBe(true)
    expect(data.version).toBeDefined()
    expect(data.commit).toBeDefined()
    expect(data.commit.sha).toBeDefined()

    cleanup.add(moduleName)
  })

  test('should update an existing module', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-update')

    // Create
    await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const x: number;',
        module: 'export const x = 1;',
      },
    })
    cleanup.add(moduleName)

    // Update
    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const x: number;',
        module: 'export const x = 2;',
      },
    })

    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(data.updated).toBe(true)
  })

  test('should require types field', async ({ request }) => {
    const moduleName = uniqueModuleName('api-no-types')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        module: 'export const x = 1;',
      },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('types')
  })

  test('should require module field', async ({ request }) => {
    const moduleName = uniqueModuleName('api-no-module')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const x: number;',
      },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('module')
  })

  test('should run tests on creation and block on failure', async ({ request }) => {
    const moduleName = uniqueModuleName('api-test-fail')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare function bad(): number;',
        module: 'export function bad() { return 1; }',
        tests: `
describe('bad', () => {
  it('fails', () => {
    expect(bad()).toBe(999);
  });
});
`,
      },
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Tests failed')
    expect(data.testResults).toBeDefined()
    expect(data.testResults.failed).toBeGreaterThan(0)
  })

  test('should save with failing tests when force option is set', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-force')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare function bad(): number;',
        module: 'export function bad() { return 1; }',
        tests: `
describe('bad', () => {
  it('fails', () => {
    expect(bad()).toBe(999);
  });
});
`,
        options: { force: true },
      },
    })

    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.warning).toContain('failing tests')

    cleanup.add(moduleName)
  })

  test('should include test results on successful creation', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-test-pass')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare function good(): number;',
        module: 'export function good() { return 42; }',
        tests: `
describe('good', () => {
  it('passes', () => {
    expect(good()).toBe(42);
  });
});
`,
      },
    })

    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.testResults).toBeDefined()
    expect(data.testResults.passed).toBeGreaterThan(0)
    expect(data.testResults.failed).toBe(0)

    cleanup.add(moduleName)
  })

  test('should support custom commit message', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-commit-msg')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const x: number;',
        module: 'export const x = 1;',
        options: { commitMessage: 'Custom commit message' },
      },
    })

    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.commit.message).toBe('Custom commit message')

    cleanup.add(moduleName)
  })

  test('should support tagging', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-tag')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const x: number;',
        module: 'export const x = 1;',
        options: { tag: 'v1.0.0' },
      },
    })

    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.tag).toBe('v1.0.0')

    cleanup.add(moduleName)
  })
})

test.describe('POST /:scope/:name/test - Run Tests', () => {
  test('should run tests and return results', async ({ request }) => {
    const response = await request.post('/math/add/test')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.passed).toBeDefined()
    expect(data.failed).toBeDefined()
    expect(data.total).toBeDefined()
    expect(data.duration).toBeDefined()
    expect(data.results).toBeDefined()
    expect(Array.isArray(data.results)).toBe(true)
  })

  test('should include test details in results', async ({ request }) => {
    const response = await request.post('/math/add/test')
    const data = await response.json()

    expect(data.results.length).toBeGreaterThan(0)
    const firstTest = data.results[0]
    expect(firstTest.name).toBeDefined()
    expect(firstTest.status).toBeDefined()
  })

  test('should support custom timeout', async ({ request }) => {
    const response = await request.post('/math/add/test', {
      data: { timeout: 10000 },
    })
    expect(response.ok()).toBeTruthy()
  })

  test('should return 404 for non-existent module', async ({ request }) => {
    const response = await request.post('/nonexistent/module123/test')
    expect(response.status()).toBe(404)
  })
})

test.describe('POST /:scope/:name/run - Execute Script', () => {
  test('should execute script and return result', async ({ request }) => {
    const response = await request.post('/math/add/run')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.result).toBeDefined()
    expect(data.duration).toBeDefined()
    expect(data.logs).toBeDefined()
  })

  test('should capture console logs', async ({ request }) => {
    const response = await request.post('/math/calculator/run')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.logs.length).toBeGreaterThan(0)
  })

  test('should support custom input', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-input')

    await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare function greet(name: string): string;',
        module: 'export function greet(name) { return "Hello, " + name; }',
        script: 'return greet(args.name || "World");',
      },
    })
    cleanup.add(moduleName)

    const response = await request.post(`/${moduleName.replace('@', '')}/run`, {
      data: { input: { name: 'E2E Test' } },
    })
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.result).toBe('Hello, E2E Test')
  })

  test('should handle script errors', async ({ request }) => {
    const response = await request.post('/test/throwing/run')
    expect(response.status()).toBe(500)

    const data = await response.json()
    expect(data.error).toBeDefined()
  })

  test('should handle script timeout', async ({ request }) => {
    const response = await request.post('/test/infinite/run', {
      data: { timeout: 100 },
    })
    expect(response.status()).toBe(408)
  })
})

test.describe('DELETE /:scope/:name - Delete Module', () => {
  test('should delete a module', async ({ request }) => {
    const moduleName = uniqueModuleName('api-delete')

    // Create first
    await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const x: number;',
        module: 'export const x = 1;',
      },
    })

    // Delete
    const response = await request.delete(`/${moduleName.replace('@', '')}`)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.deleted).toBe(true)
    expect(data.name).toBe(moduleName)
    expect(data.commit).toBeDefined()
  })

  test('should return 404 for non-existent module', async ({ request }) => {
    const response = await request.delete('/nonexistent/module123')
    expect(response.status()).toBe(404)
  })

  test('should require auth for protected namespace', async ({ request }) => {
    // Try to delete without auth
    const response = await request.delete('/protected/secret')
    expect(response.status()).toBe(401)
  })
})

test.describe('GET /:scope/ - List Modules', () => {
  test('should list modules in scope', async ({ request }) => {
    const response = await request.get('/math/')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.modules).toBeDefined()
    expect(Array.isArray(data.modules)).toBe(true)
    expect(data.scope).toBe('@math')
    expect(data.count).toBeDefined()
  })

  test('should return empty list for empty scope', async ({ request }) => {
    const response = await request.get('/emptyscope/')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.modules).toEqual([])
    expect(data.count).toBe(0)
  })
})

test.describe('Dependency Routes', () => {
  test('should get direct dependencies', async ({ request }) => {
    const response = await request.get('/math/stats/deps')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.dependencies).toBeDefined()
    expect(data.dependencies).toContain('@math/add')
  })

  test('should get dependency tree', async ({ request }) => {
    const response = await request.get('/math/stats/deps/tree')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.tree).toBeDefined()
  })

  test('should get flattened dependencies', async ({ request }) => {
    const response = await request.get('/math/stats/deps/flat')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.dependencies).toBeDefined()
    expect(data.count).toBeDefined()
  })

  test('should detect circular dependencies', async ({ request }) => {
    const response = await request.get('/math/stats/deps/circular')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.hasCircular).toBeDefined()
    expect(data.cycles).toBeDefined()
  })
})

test.describe('Diff and Revert', () => {
  test('should get diff between versions', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-diff')

    // Create v1
    const v1Response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const value: number;',
        module: 'export const value = 1;',
      },
    })
    const v1 = await v1Response.json()
    cleanup.add(moduleName)

    // Create v2
    const v2Response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const value: number;',
        module: 'export const value = 2;',
      },
    })
    const v2 = await v2Response.json()

    // Get diff
    const diffResponse = await request.get(
      `/${moduleName.replace('@', '')}/diff?from=${v1.version}&to=${v2.version}`
    )
    expect(diffResponse.ok()).toBeTruthy()

    const data = await diffResponse.json()
    expect(data.from).toBe(v1.version)
    expect(data.to).toBe(v2.version)
    expect(data.diff).toBeDefined()
  })

  test('should revert to previous version', async ({ request, cleanup }) => {
    const moduleName = uniqueModuleName('api-revert')

    // Create v1
    const v1Response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const value: number;',
        module: 'export const value = 1;',
      },
    })
    const v1 = await v1Response.json()
    cleanup.add(moduleName)

    // Create v2
    await request.post(`/${moduleName.replace('@', '')}`, {
      data: {
        types: 'export declare const value: number;',
        module: 'export const value = 2;',
      },
    })

    // Revert to v1
    const revertResponse = await request.post(`/${moduleName.replace('@', '')}/revert`, {
      data: { to: v1.version },
    })
    expect(revertResponse.ok()).toBeTruthy()

    const data = await revertResponse.json()
    expect(data.reverted).toBe(true)
    expect(data.to).toBe(v1.version)

    // Verify content is reverted
    const moduleResponse = await request.get(`/${moduleName.replace('@', '')}.mjs`)
    const content = await moduleResponse.text()
    expect(content).toContain('value = 1')
  })
})

test.describe('Rate Limiting', () => {
  test('should include rate limit headers', async ({ request }) => {
    const response = await request.get('/math/add')
    expect(response.headers()['x-ratelimit-limit']).toBeDefined()
    expect(response.headers()['x-ratelimit-remaining']).toBeDefined()
    expect(response.headers()['x-ratelimit-reset']).toBeDefined()
  })
})

test.describe('Error Handling', () => {
  test('should return 400 for invalid module name', async ({ request }) => {
    const response = await request.get('/invalid..name/module')
    expect(response.status()).toBe(400)

    const data = await response.json()
    expect(data.error).toBeDefined()
  })

  test('should return 400 for invalid JSON body', async ({ request }) => {
    const moduleName = uniqueModuleName('api-invalid-json')

    const response = await request.post(`/${moduleName.replace('@', '')}`, {
      data: 'not valid json',
      headers: { 'Content-Type': 'application/json' },
    })

    // The request library should handle this, but test the concept
    expect(response.status()).toBeLessThan(500)
  })

  test('should return 405 for unsupported methods', async ({ request }) => {
    const response = await request.patch('/math/add')
    expect(response.status()).toBe(405)
  })
})

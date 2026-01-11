/**
 * RED Tests for CORS Middleware (esm-arch.5)
 *
 * These tests are designed to FAIL until the CORS middleware is implemented.
 * They verify that CORS headers are properly added and OPTIONS requests are handled.
 *
 * The CORS middleware should:
 * 1. Add Access-Control-Allow-Origin header to all responses
 * 2. Handle OPTIONS preflight requests with 204 status
 * 3. Include allowed methods in preflight response
 * 4. Include allowed headers in preflight response
 * 5. Add CORS headers to error responses
 * 6. Support configurable origins
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// =============================================================================
// CORS Middleware Types
// =============================================================================

interface CorsConfig {
  allowOrigins: string[] | '*'
  allowMethods: string[]
  allowHeaders: string[]
  exposeHeaders: string[]
  maxAge: number
  credentials?: boolean
}

interface CorsMiddleware {
  /** Add CORS headers to a response */
  addCorsHeaders(response: Response, origin?: string): Response
  /** Handle OPTIONS preflight request */
  handlePreflight(request: Request): Response
  /** Check if origin is allowed */
  isOriginAllowed(origin: string): boolean
  /** Get the CORS config */
  getConfig(): CorsConfig
}

// =============================================================================
// Mock Request/Response helpers for unit testing
// =============================================================================

function createMockRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
}): Request {
  const { method = 'GET', url = 'http://localhost/', headers = {} } = options
  return new Request(url, {
    method,
    headers: new Headers(headers),
  })
}

// =============================================================================
// RED Tests: CORS Middleware Factory
// =============================================================================

describe('CORS Middleware Factory', () => {
  // Import will fail until the module exists
  let createCorsMiddleware: (config?: Partial<CorsConfig>) => CorsMiddleware

  beforeAll(async () => {
    // This import should fail until the middleware is implemented
    const module = await import('../../src/middleware/cors.js')
    createCorsMiddleware = module.createCorsMiddleware
  })

  it('should export createCorsMiddleware function', () => {
    expect(typeof createCorsMiddleware).toBe('function')
  })

  it('should create middleware with default config', () => {
    const middleware = createCorsMiddleware()
    const config = middleware.getConfig()

    expect(config.allowOrigins).toBe('*')
    expect(config.allowMethods).toContain('GET')
    expect(config.allowMethods).toContain('POST')
    expect(config.allowMethods).toContain('DELETE')
    expect(config.allowMethods).toContain('OPTIONS')
    expect(config.allowHeaders).toContain('Content-Type')
    expect(config.allowHeaders).toContain('Authorization')
    expect(config.maxAge).toBeGreaterThan(0)
  })

  it('should create middleware with custom config', () => {
    const middleware = createCorsMiddleware({
      allowOrigins: ['https://example.com'],
      allowMethods: ['GET', 'POST'],
      maxAge: 3600,
    })
    const config = middleware.getConfig()

    expect(config.allowOrigins).toEqual(['https://example.com'])
    expect(config.allowMethods).toEqual(['GET', 'POST'])
    expect(config.maxAge).toBe(3600)
  })
})

// =============================================================================
// RED Tests: Adding CORS Headers
// =============================================================================

describe('CORS Middleware - addCorsHeaders()', () => {
  let createCorsMiddleware: (config?: Partial<CorsConfig>) => CorsMiddleware
  let middleware: CorsMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/cors.js')
    createCorsMiddleware = module.createCorsMiddleware
    middleware = createCorsMiddleware()
  })

  it('should add Access-Control-Allow-Origin header', () => {
    const response = new Response('test body', { status: 200 })
    const corsResponse = middleware.addCorsHeaders(response)

    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should preserve original response body', async () => {
    const response = new Response('original body', { status: 200 })
    const corsResponse = middleware.addCorsHeaders(response)

    const body = await corsResponse.text()
    expect(body).toBe('original body')
  })

  it('should preserve original response status', () => {
    const response = new Response(null, { status: 201 })
    const corsResponse = middleware.addCorsHeaders(response)

    expect(corsResponse.status).toBe(201)
  })

  it('should add Access-Control-Expose-Headers', () => {
    const response = new Response(null, { status: 200 })
    const corsResponse = middleware.addCorsHeaders(response)

    const exposeHeaders = corsResponse.headers.get('Access-Control-Expose-Headers')
    expect(exposeHeaders).toBeDefined()
    expect(exposeHeaders).toContain('ETag')
  })

  it('should use specific origin when configured', () => {
    const restrictedMiddleware = createCorsMiddleware({
      allowOrigins: ['https://example.com'],
    })
    const response = new Response(null, { status: 200 })
    const corsResponse = restrictedMiddleware.addCorsHeaders(response, 'https://example.com')

    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
  })

  it('should add CORS headers to error responses', () => {
    const errorResponse = new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
    const corsResponse = middleware.addCorsHeaders(errorResponse)

    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(corsResponse.status).toBe(404)
  })

  it('should add CORS headers to 500 error responses', () => {
    const errorResponse = new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
    const corsResponse = middleware.addCorsHeaders(errorResponse)

    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(corsResponse.status).toBe(500)
  })
})

// =============================================================================
// RED Tests: OPTIONS Preflight Handling
// =============================================================================

describe('CORS Middleware - handlePreflight()', () => {
  let createCorsMiddleware: (config?: Partial<CorsConfig>) => CorsMiddleware
  let middleware: CorsMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/cors.js')
    createCorsMiddleware = module.createCorsMiddleware
    middleware = createCorsMiddleware()
  })

  it('should return 204 status for OPTIONS requests', () => {
    const request = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    })

    const response = middleware.handlePreflight(request)

    expect(response.status).toBe(204)
  })

  it('should include Access-Control-Allow-Methods', () => {
    const request = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    })

    const response = middleware.handlePreflight(request)
    const allowMethods = response.headers.get('Access-Control-Allow-Methods')

    expect(allowMethods).toBeDefined()
    expect(allowMethods).toContain('GET')
    expect(allowMethods).toContain('POST')
    expect(allowMethods).toContain('DELETE')
  })

  it('should include Access-Control-Allow-Headers', () => {
    const request = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    })

    const response = middleware.handlePreflight(request)
    const allowHeaders = response.headers.get('Access-Control-Allow-Headers')

    expect(allowHeaders).toBeDefined()
    expect(allowHeaders).toContain('Content-Type')
    expect(allowHeaders).toContain('Authorization')
  })

  it('should include Access-Control-Max-Age', () => {
    const request = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
      },
    })

    const response = middleware.handlePreflight(request)
    const maxAge = response.headers.get('Access-Control-Max-Age')

    expect(maxAge).toBeDefined()
    expect(parseInt(maxAge!, 10)).toBeGreaterThan(0)
  })

  it('should include Access-Control-Allow-Origin', () => {
    const request = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
      },
    })

    const response = middleware.handlePreflight(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should have empty body', async () => {
    const request = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
      },
    })

    const response = middleware.handlePreflight(request)
    const body = await response.text()

    expect(body).toBe('')
  })

  it('should respect custom allowed methods', () => {
    const customMiddleware = createCorsMiddleware({
      allowMethods: ['GET', 'POST'],
    })

    const request = createMockRequest({
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'DELETE',
      },
    })

    const response = customMiddleware.handlePreflight(request)
    const allowMethods = response.headers.get('Access-Control-Allow-Methods')

    expect(allowMethods).toContain('GET')
    expect(allowMethods).toContain('POST')
    expect(allowMethods).not.toContain('DELETE')
  })
})

// =============================================================================
// RED Tests: Origin Validation
// =============================================================================

describe('CORS Middleware - isOriginAllowed()', () => {
  let createCorsMiddleware: (config?: Partial<CorsConfig>) => CorsMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/cors.js')
    createCorsMiddleware = module.createCorsMiddleware
  })

  it('should allow all origins when configured with "*"', () => {
    const middleware = createCorsMiddleware({ allowOrigins: '*' })

    expect(middleware.isOriginAllowed('https://example.com')).toBe(true)
    expect(middleware.isOriginAllowed('https://another.com')).toBe(true)
    expect(middleware.isOriginAllowed('http://localhost:3000')).toBe(true)
  })

  it('should only allow specified origins when configured with array', () => {
    const middleware = createCorsMiddleware({
      allowOrigins: ['https://example.com', 'https://allowed.com'],
    })

    expect(middleware.isOriginAllowed('https://example.com')).toBe(true)
    expect(middleware.isOriginAllowed('https://allowed.com')).toBe(true)
    expect(middleware.isOriginAllowed('https://forbidden.com')).toBe(false)
  })

  it('should handle origins with ports', () => {
    const middleware = createCorsMiddleware({
      allowOrigins: ['http://localhost:3000'],
    })

    expect(middleware.isOriginAllowed('http://localhost:3000')).toBe(true)
    expect(middleware.isOriginAllowed('http://localhost:8080')).toBe(false)
  })

  it('should handle origins with subdomains', () => {
    const middleware = createCorsMiddleware({
      allowOrigins: ['https://api.example.com'],
    })

    expect(middleware.isOriginAllowed('https://api.example.com')).toBe(true)
    expect(middleware.isOriginAllowed('https://www.example.com')).toBe(false)
    expect(middleware.isOriginAllowed('https://example.com')).toBe(false)
  })

  it('should be case-insensitive for origin comparison', () => {
    const middleware = createCorsMiddleware({
      allowOrigins: ['https://Example.Com'],
    })

    expect(middleware.isOriginAllowed('https://example.com')).toBe(true)
    expect(middleware.isOriginAllowed('https://EXAMPLE.COM')).toBe(true)
  })
})

// =============================================================================
// RED Tests: Credentials Support
// =============================================================================

describe('CORS Middleware - Credentials', () => {
  let createCorsMiddleware: (config?: Partial<CorsConfig>) => CorsMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/cors.js')
    createCorsMiddleware = module.createCorsMiddleware
  })

  it('should not include credentials header by default', () => {
    const middleware = createCorsMiddleware()
    const response = new Response(null, { status: 200 })
    const corsResponse = middleware.addCorsHeaders(response)

    expect(corsResponse.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  it('should include credentials header when configured', () => {
    const middleware = createCorsMiddleware({ credentials: true })
    const response = new Response(null, { status: 200 })
    const corsResponse = middleware.addCorsHeaders(response)

    expect(corsResponse.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('should not use wildcard origin when credentials are enabled', () => {
    const middleware = createCorsMiddleware({
      allowOrigins: '*',
      credentials: true,
    })
    const response = new Response(null, { status: 200 })
    const corsResponse = middleware.addCorsHeaders(response, 'https://example.com')

    // When credentials are enabled, we must echo the specific origin, not '*'
    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).not.toBe('*')
  })
})

// =============================================================================
// RED Tests: Content-Type Handling for ESM Modules
// =============================================================================

describe('CORS Middleware - ESM Module Support', () => {
  let createCorsMiddleware: (config?: Partial<CorsConfig>) => CorsMiddleware
  let middleware: CorsMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/cors.js')
    createCorsMiddleware = module.createCorsMiddleware
    middleware = createCorsMiddleware()
  })

  it('should allow cross-origin import of JavaScript modules', () => {
    const response = new Response('export const x = 1', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    })
    const corsResponse = middleware.addCorsHeaders(response)

    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should allow cross-origin import of TypeScript declarations', () => {
    const response = new Response('export declare const x: number', {
      status: 200,
      headers: { 'Content-Type': 'application/typescript' },
    })
    const corsResponse = middleware.addCorsHeaders(response)

    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should expose ETag header for module caching', () => {
    const response = new Response('export const x = 1', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'ETag': '"abc123"',
      },
    })
    const corsResponse = middleware.addCorsHeaders(response)

    const exposeHeaders = corsResponse.headers.get('Access-Control-Expose-Headers')
    expect(exposeHeaders).toContain('ETag')
  })

  it('should expose Cache-Control header for CDN support', () => {
    const response = new Response('export const x = 1', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=31536000',
      },
    })
    const corsResponse = middleware.addCorsHeaders(response)

    const exposeHeaders = corsResponse.headers.get('Access-Control-Expose-Headers')
    expect(exposeHeaders).toContain('Cache-Control')
  })
})

// =============================================================================
// RED Tests: Header Preservation
// =============================================================================

describe('CORS Middleware - Header Preservation', () => {
  let createCorsMiddleware: (config?: Partial<CorsConfig>) => CorsMiddleware
  let middleware: CorsMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/cors.js')
    createCorsMiddleware = module.createCorsMiddleware
    middleware = createCorsMiddleware()
  })

  it('should preserve existing response headers', () => {
    const response = new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
    })
    const corsResponse = middleware.addCorsHeaders(response)

    expect(corsResponse.headers.get('Content-Type')).toBe('application/json')
    expect(corsResponse.headers.get('X-Custom-Header')).toBe('custom-value')
  })

  it('should not overwrite existing CORS headers if present', () => {
    // Some responses might already have CORS headers from upstream
    const response = new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://specific.com',
      },
    })
    const corsResponse = middleware.addCorsHeaders(response)

    // Middleware should preserve the existing specific origin
    expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://specific.com')
  })
})

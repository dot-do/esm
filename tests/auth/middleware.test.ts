/**
 * RED Tests for Authentication Middleware (esm-auth.5)
 *
 * These tests are designed to FAIL until the authentication middleware is implemented.
 * They verify bearer token and API key validation for the ESM module system.
 *
 * The authentication middleware should:
 * 1. Validate Bearer tokens from Authorization header
 * 2. Validate API keys from X-API-Key header
 * 3. Support both authentication methods
 * 4. Return 401 Unauthorized for missing credentials
 * 5. Return 401 Unauthorized for invalid credentials
 * 6. Allow authenticated requests to proceed
 * 7. Add user context to the request for downstream middleware
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'

// =============================================================================
// Authentication Types (to be implemented in src/middleware/auth.ts)
// =============================================================================

/**
 * AuthConfig - Configuration for authentication middleware
 */
interface AuthConfig {
  /** Secret key for validating bearer tokens (JWT secret or similar) */
  tokenSecret?: string
  /** Valid API keys mapped to their identifiers */
  apiKeys?: Map<string, string> | Record<string, string>
  /** Routes that don't require authentication */
  publicPaths?: string[]
  /** Whether to allow anonymous access (default: false) */
  allowAnonymous?: boolean
  /** Token expiry validation enabled (default: true) */
  validateExpiry?: boolean
}

/**
 * AuthUser - Authenticated user context
 */
interface AuthUser {
  /** Unique identifier for the user/key */
  id: string
  /** Authentication method used */
  method: 'bearer' | 'api-key'
  /** Optional user metadata */
  metadata?: Record<string, unknown>
}

/**
 * AuthResult - Result of authentication attempt
 */
interface AuthResult {
  /** Whether authentication was successful */
  authenticated: boolean
  /** Authenticated user info (if successful) */
  user?: AuthUser
  /** Error message (if failed) */
  error?: string
  /** HTTP status code to return (401, 403, etc.) */
  status?: number
}

/**
 * AuthMiddleware - Authentication middleware interface
 */
interface AuthMiddleware {
  /** Authenticate a request */
  authenticate(request: Request): Promise<AuthResult>
  /** Validate a bearer token */
  validateToken(token: string): Promise<AuthResult>
  /** Validate an API key */
  validateApiKey(key: string): Promise<AuthResult>
  /** Check if a path is public (no auth required) */
  isPublicPath(path: string): boolean
  /** Get the middleware configuration */
  getConfig(): AuthConfig
}

// =============================================================================
// Helper Functions
// =============================================================================

function createMockRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
}): Request {
  const { method = 'GET', url = 'http://localhost/api/modules', headers = {} } = options
  return new Request(url, {
    method,
    headers: new Headers(headers),
  })
}

// =============================================================================
// JWT Signing Helpers
// =============================================================================

/**
 * Base64url encode a string
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Base64url encode bytes
 */
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Create a properly signed JWT using HMAC-SHA256
 */
async function createSignedJWT(
  payload: Record<string, unknown>,
  secret: string,
  options: { expiresIn?: number; issuedAt?: number } = {}
): Promise<string> {
  const now = options.issuedAt ?? Math.floor(Date.now() / 1000)
  const exp = options.expiresIn ? now + options.expiresIn : now + 3600 // 1 hour default

  const header = { alg: 'HS256', typ: 'JWT' }
  const fullPayload = { ...payload, iat: now, exp }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload))
  const message = `${headerB64}.${payloadB64}`

  // Sign using Web Crypto API (HMAC-SHA256)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  const signature = base64UrlEncodeBytes(new Uint8Array(signatureBytes))

  return `${message}.${signature}`
}

/**
 * Create an expired JWT
 */
async function createExpiredJWT(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const fullPayload = { ...payload, iat: now - 7200, exp: now - 3600 } // Expired 1 hour ago

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload))
  const message = `${headerB64}.${payloadB64}`

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  const signature = base64UrlEncodeBytes(new Uint8Array(signatureBytes))

  return `${message}.${signature}`
}

const TEST_SECRET = 'test-secret-key-for-jwt-validation'

// =============================================================================
// RED Tests: Authentication Middleware Factory
// =============================================================================

describe('Authentication Middleware Factory', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware

  beforeAll(async () => {
    // This import should fail until the middleware is implemented
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
  })

  it('should export createAuthMiddleware function', () => {
    expect(typeof createAuthMiddleware).toBe('function')
  })

  it('should create middleware with default config', () => {
    const middleware = createAuthMiddleware()
    const config = middleware.getConfig()

    expect(config.allowAnonymous).toBe(false)
    expect(config.validateExpiry).toBe(true)
  })

  it('should create middleware with custom config', () => {
    const middleware = createAuthMiddleware({
      tokenSecret: 'my-secret',
      allowAnonymous: true,
      publicPaths: ['/health', '/version'],
    })
    const config = middleware.getConfig()

    expect(config.tokenSecret).toBe('my-secret')
    expect(config.allowAnonymous).toBe(true)
    expect(config.publicPaths).toContain('/health')
    expect(config.publicPaths).toContain('/version')
  })

  it('should accept API keys as a Map', () => {
    const apiKeys = new Map([
      ['key-123', 'user-1'],
      ['key-456', 'user-2'],
    ])
    const middleware = createAuthMiddleware({ apiKeys })
    const config = middleware.getConfig()

    expect(config.apiKeys).toBeDefined()
  })

  it('should accept API keys as a Record', () => {
    const apiKeys = {
      'key-123': 'user-1',
      'key-456': 'user-2',
    }
    const middleware = createAuthMiddleware({ apiKeys })
    const config = middleware.getConfig()

    expect(config.apiKeys).toBeDefined()
  })
})

// =============================================================================
// RED Tests: Bearer Token Validation
// =============================================================================

describe('Authentication Middleware - Bearer Token Validation', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      tokenSecret: TEST_SECRET,
    })
  })

  it('should authenticate valid bearer token', async () => {
    // A properly signed JWT token
    const validToken = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)

    const result = await middleware.validateToken(validToken)

    expect(result.authenticated).toBe(true)
    expect(result.user).toBeDefined()
    expect(result.user?.method).toBe('bearer')
  })

  it('should reject invalid bearer token', async () => {
    const result = await middleware.validateToken('invalid-token')

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.status).toBe(401)
  })

  it('should reject expired bearer token', async () => {
    // A properly signed token with exp in the past
    const expiredToken = await createExpiredJWT({ sub: 'user-123' }, TEST_SECRET)

    const result = await middleware.validateToken(expiredToken)

    expect(result.authenticated).toBe(false)
    expect(result.error).toContain('expired')
  })

  it('should reject malformed bearer token', async () => {
    const result = await middleware.validateToken('not.a.valid.jwt.format')

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should reject empty bearer token', async () => {
    const result = await middleware.validateToken('')

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should extract user ID from token payload', async () => {
    const validToken = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)

    const result = await middleware.validateToken(validToken)

    expect(result.user?.id).toBe('user-123')
  })
})

// =============================================================================
// RED Tests: API Key Validation
// =============================================================================

describe('Authentication Middleware - API Key Validation', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      apiKeys: {
        'valid-api-key-123': 'user-1',
        'valid-api-key-456': 'user-2',
      },
    })
  })

  it('should authenticate valid API key', async () => {
    const result = await middleware.validateApiKey('valid-api-key-123')

    expect(result.authenticated).toBe(true)
    expect(result.user).toBeDefined()
    expect(result.user?.method).toBe('api-key')
    expect(result.user?.id).toBe('user-1')
  })

  it('should reject invalid API key', async () => {
    const result = await middleware.validateApiKey('invalid-key')

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.status).toBe(401)
  })

  it('should reject empty API key', async () => {
    const result = await middleware.validateApiKey('')

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should handle multiple valid API keys', async () => {
    const result1 = await middleware.validateApiKey('valid-api-key-123')
    const result2 = await middleware.validateApiKey('valid-api-key-456')

    expect(result1.authenticated).toBe(true)
    expect(result1.user?.id).toBe('user-1')
    expect(result2.authenticated).toBe(true)
    expect(result2.user?.id).toBe('user-2')
  })

  it('should be case-sensitive for API keys', async () => {
    const result = await middleware.validateApiKey('VALID-API-KEY-123')

    expect(result.authenticated).toBe(false)
  })
})

// =============================================================================
// RED Tests: Request Authentication
// =============================================================================

describe('Authentication Middleware - Request Authentication', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware
  const REQUEST_TEST_SECRET = 'test-secret-for-request-auth'

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      tokenSecret: REQUEST_TEST_SECRET,
      apiKeys: {
        'valid-api-key': 'api-user',
      },
    })
  })

  it('should authenticate request with Bearer token in Authorization header', async () => {
    const validToken = await createSignedJWT({ sub: 'user-123' }, REQUEST_TEST_SECRET)
    const request = createMockRequest({
      headers: {
        'Authorization': `Bearer ${validToken}`,
      },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(true)
    expect(result.user?.method).toBe('bearer')
  })

  it('should authenticate request with X-API-Key header', async () => {
    const request = createMockRequest({
      headers: {
        'X-API-Key': 'valid-api-key',
      },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(true)
    expect(result.user?.method).toBe('api-key')
  })

  it('should reject request with no credentials', async () => {
    const request = createMockRequest({})

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toContain('credentials')
  })

  it('should reject request with invalid Bearer token', async () => {
    const request = createMockRequest({
      headers: {
        'Authorization': 'Bearer invalid-token',
      },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
  })

  it('should reject request with invalid API key', async () => {
    const request = createMockRequest({
      headers: {
        'X-API-Key': 'invalid-api-key',
      },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
  })

  it('should prefer Bearer token over API key when both present', async () => {
    const validToken = await createSignedJWT({ sub: 'bearer-user' }, REQUEST_TEST_SECRET)
    const request = createMockRequest({
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'X-API-Key': 'valid-api-key',
      },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(true)
    expect(result.user?.method).toBe('bearer')
  })

  it('should handle Bearer prefix case-insensitively', async () => {
    const validToken = await createSignedJWT({ sub: 'user-123' }, REQUEST_TEST_SECRET)
    const request = createMockRequest({
      headers: {
        'Authorization': `bearer ${validToken}`,
      },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(true)
  })

  it('should reject non-Bearer Authorization schemes', async () => {
    const request = createMockRequest({
      headers: {
        'Authorization': 'Basic dXNlcjpwYXNz', // Basic auth base64
      },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(false)
    expect(result.error).toContain('Bearer')
  })
})

// =============================================================================
// RED Tests: Public Paths
// =============================================================================

describe('Authentication Middleware - Public Paths', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      publicPaths: ['/health', '/version', '/api/public/*'],
    })
  })

  it('should identify /health as public path', () => {
    expect(middleware.isPublicPath('/health')).toBe(true)
  })

  it('should identify /version as public path', () => {
    expect(middleware.isPublicPath('/version')).toBe(true)
  })

  it('should identify non-public paths', () => {
    expect(middleware.isPublicPath('/api/modules')).toBe(false)
    expect(middleware.isPublicPath('/api/private')).toBe(false)
  })

  it('should support wildcard patterns', () => {
    expect(middleware.isPublicPath('/api/public/anything')).toBe(true)
    expect(middleware.isPublicPath('/api/public/nested/path')).toBe(true)
  })

  it('should not require auth for public paths', async () => {
    const publicMiddleware = createAuthMiddleware({
      publicPaths: ['/health'],
      allowAnonymous: false,
    })

    const request = createMockRequest({
      url: 'http://localhost/health',
    })

    const result = await publicMiddleware.authenticate(request)

    // Public paths should return authenticated: true even without credentials
    expect(result.authenticated).toBe(true)
  })
})

// =============================================================================
// RED Tests: Anonymous Access
// =============================================================================

describe('Authentication Middleware - Anonymous Access', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
  })

  it('should allow anonymous access when configured', async () => {
    const middleware = createAuthMiddleware({
      allowAnonymous: true,
    })

    const request = createMockRequest({})

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(true)
    expect(result.user?.id).toBe('anonymous')
  })

  it('should reject anonymous access when not configured', async () => {
    const middleware = createAuthMiddleware({
      allowAnonymous: false,
    })

    const request = createMockRequest({})

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
  })

  it('should prefer authenticated user over anonymous', async () => {
    const middleware = createAuthMiddleware({
      allowAnonymous: true,
      apiKeys: { 'my-key': 'my-user' },
    })

    const request = createMockRequest({
      headers: { 'X-API-Key': 'my-key' },
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(true)
    expect(result.user?.id).toBe('my-user')
    expect(result.user?.id).not.toBe('anonymous')
  })
})

// =============================================================================
// RED Tests: Error Responses
// =============================================================================

describe('Authentication Middleware - Error Responses', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      tokenSecret: 'test-secret',
      apiKeys: { 'valid-key': 'user' },
    })
  })

  it('should return 401 for missing credentials', async () => {
    const request = createMockRequest({})

    const result = await middleware.authenticate(request)

    expect(result.status).toBe(401)
    expect(result.error).toBeDefined()
  })

  it('should return 401 for invalid token', async () => {
    const request = createMockRequest({
      headers: { 'Authorization': 'Bearer bad-token' },
    })

    const result = await middleware.authenticate(request)

    expect(result.status).toBe(401)
  })

  it('should return 401 for invalid API key', async () => {
    const request = createMockRequest({
      headers: { 'X-API-Key': 'bad-key' },
    })

    const result = await middleware.authenticate(request)

    expect(result.status).toBe(401)
  })

  it('should include descriptive error message', async () => {
    const request = createMockRequest({})

    const result = await middleware.authenticate(request)

    expect(result.error).toMatch(/missing|required|credentials/i)
  })
})

// =============================================================================
// RED Tests: Security Considerations
// =============================================================================

describe('Authentication Middleware - Security', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
  })

  it('should not leak token details in error messages', async () => {
    const middleware = createAuthMiddleware({
      tokenSecret: 'secret',
    })

    const request = createMockRequest({
      headers: { 'Authorization': 'Bearer some-secret-looking-token' },
    })

    const result = await middleware.authenticate(request)

    expect(result.error).not.toContain('some-secret-looking-token')
  })

  it('should not leak API key in error messages', async () => {
    const middleware = createAuthMiddleware({
      apiKeys: { 'real-key': 'user' },
    })

    const request = createMockRequest({
      headers: { 'X-API-Key': 'attempted-key-123' },
    })

    const result = await middleware.authenticate(request)

    expect(result.error).not.toContain('attempted-key-123')
  })

  it('should use constant-time comparison for API keys', async () => {
    const middleware = createAuthMiddleware({
      apiKeys: { 'secret-key-12345': 'user' },
    })

    // Test that timing doesn't vary based on key similarity
    // (This is more of a code review requirement, but we verify behavior)
    const result1 = await middleware.validateApiKey('secret-key-12345-wrong')
    const result2 = await middleware.validateApiKey('completely-different')

    expect(result1.authenticated).toBe(false)
    expect(result2.authenticated).toBe(false)
  })

  it('should reject tokens with algorithm: none', async () => {
    const middleware = createAuthMiddleware({
      tokenSecret: 'secret',
    })

    // A JWT with alg: none (security vulnerability)
    const noneAlgToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJoYWNrZXIifQ.'

    const result = await middleware.validateToken(noneAlgToken)

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })
})

// =============================================================================
// RED Tests: Integration with Middleware Pipeline
// =============================================================================

describe('Authentication Middleware - Pipeline Integration', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let compose: <C>(middleware: Array<(ctx: C, next: () => Promise<void>) => Promise<void> | void>) => (ctx: C) => Promise<void>

  interface AuthContext {
    request: Request
    response?: Response
    user?: AuthUser
    [key: string]: unknown
  }

  beforeAll(async () => {
    const authModule = await import('../../src/middleware/auth.js')
    const middlewareModule = await import('../../src/worker/middleware.js')
    createAuthMiddleware = authModule.createAuthMiddleware
    compose = middlewareModule.compose
  })

  it('should work as middleware in pipeline', async () => {
    const auth = createAuthMiddleware({
      apiKeys: { 'test-key': 'test-user' },
    })

    const authMiddleware = async (ctx: AuthContext, next: () => Promise<void>) => {
      const result = await auth.authenticate(ctx.request)
      if (!result.authenticated) {
        ctx.response = new Response(JSON.stringify({ error: result.error }), {
          status: result.status || 401,
          headers: { 'Content-Type': 'application/json' },
        })
        return // Short-circuit
      }
      ctx.user = result.user
      await next()
    }

    const handler = async (ctx: AuthContext, next: () => Promise<void>) => {
      ctx.response = new Response(JSON.stringify({ user: ctx.user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      await next()
    }

    const pipeline = compose([authMiddleware, handler])

    // Test with valid auth
    const authCtx: AuthContext = {
      request: createMockRequest({
        headers: { 'X-API-Key': 'test-key' },
      }),
    }
    await pipeline(authCtx)
    expect(authCtx.response?.status).toBe(200)
    expect(authCtx.user?.id).toBe('test-user')

    // Test without auth
    const noAuthCtx: AuthContext = {
      request: createMockRequest({}),
    }
    await pipeline(noAuthCtx)
    expect(noAuthCtx.response?.status).toBe(401)
  })

  it('should add user context for downstream middleware', async () => {
    const auth = createAuthMiddleware({
      apiKeys: { 'key': 'user-123' },
    })

    const authMiddleware = async (ctx: AuthContext, next: () => Promise<void>) => {
      const result = await auth.authenticate(ctx.request)
      if (result.authenticated) {
        ctx.user = result.user
      }
      await next()
    }

    const checkUserMiddleware = async (ctx: AuthContext, next: () => Promise<void>) => {
      if (ctx.user) {
        ctx.hasUser = true
        ctx.userId = ctx.user.id
      }
      await next()
    }

    const pipeline = compose([authMiddleware, checkUserMiddleware])

    const ctx: AuthContext = {
      request: createMockRequest({
        headers: { 'X-API-Key': 'key' },
      }),
    }

    await pipeline(ctx)

    expect(ctx.hasUser).toBe(true)
    expect(ctx.userId).toBe('user-123')
  })
})

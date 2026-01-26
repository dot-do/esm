/**
 * RED Tests for JWT Signature Verification (esm-zabz)
 *
 * These tests are designed to FAIL until JWT signature verification is implemented.
 * They verify that the authentication system properly validates JWT signatures.
 *
 * Current Issue:
 * `src/middleware/auth.ts` lines 205-259:
 * - Parses JWT correctly
 * - Rejects `alg: 'none'`
 * - **Does NOT verify signature** - tokens with invalid signatures are accepted
 *
 * Expected Behavior After Implementation:
 * - Tokens with valid signatures should be accepted
 * - Tokens with modified payloads should be rejected (signature won't match)
 * - Tokens signed with wrong keys should be rejected
 * - Tokens with unsupported algorithms should be rejected
 * - Expired tokens should be rejected (already implemented)
 *
 * Related issues:
 * - esm-zabz: RED: JWT signature verification
 * - esm-ko5r: GREEN: Implement JWT signature verification (blocked by this)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import type { AuthMiddleware, AuthConfig, AuthResult } from '../../src/middleware/auth.js'

// =============================================================================
// JWT Test Helpers
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
  options: { algorithm?: string; expiresIn?: number } = {}
): Promise<string> {
  const algorithm = options.algorithm || 'HS256'
  const now = Math.floor(Date.now() / 1000)
  const exp = options.expiresIn ? now + options.expiresIn : now + 3600 // 1 hour default

  const header = { alg: algorithm, typ: 'JWT' }
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
 * Create an unsigned JWT (no signature, just header.payload.)
 */
function createUnsignedJWT(payload: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const fullPayload = { ...payload, iat: now, exp: now + 3600 }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload))

  // No signature - just the two parts with a trailing dot
  return `${headerB64}.${payloadB64}.`
}

/**
 * Create a JWT with a fake/random signature
 */
function createJWTWithFakeSignature(payload: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const fullPayload = { ...payload, iat: now, exp: now + 3600 }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload))

  // Random fake signature that won't validate
  const fakeSignature = 'dGhpc19pc19hX2Zha2Vfc2lnbmF0dXJlX3RoYXRfc2hvdWxkX25vdF92YWxpZGF0ZQ'

  return `${headerB64}.${payloadB64}.${fakeSignature}`
}

/**
 * Create a JWT with algorithm 'none'
 */
function createNoneAlgJWT(payload: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'none', typ: 'JWT' }
  const fullPayload = { ...payload, iat: now, exp: now + 3600 }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload))

  return `${headerB64}.${payloadB64}.`
}

/**
 * Tamper with a JWT by modifying the payload while keeping the original signature
 */
async function tamperWithJWT(
  originalToken: string,
  payloadModifications: Record<string, unknown>
): Promise<string> {
  const parts = originalToken.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')

  const [headerB64, originalPayloadB64, signature] = parts

  // Decode original payload
  const payloadJson = atob(originalPayloadB64!.replace(/-/g, '+').replace(/_/g, '/'))
  const payload = JSON.parse(payloadJson)

  // Apply modifications
  const tamperedPayload = { ...payload, ...payloadModifications }

  // Re-encode with modifications but KEEP original signature
  const tamperedPayloadB64 = base64UrlEncode(JSON.stringify(tamperedPayload))

  return `${headerB64}.${tamperedPayloadB64}.${signature}`
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

/**
 * Create a JWT with a different algorithm header (algorithm confusion attack)
 */
function createWrongAlgorithmJWT(payload: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' } // Claims RS256 but we won't provide RSA signature
  const fullPayload = { ...payload, iat: now, exp: now + 3600 }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload))

  // Provide a fake signature - should be rejected since we don't support RS256
  const fakeSignature = 'ZmFrZV9yc2Ffc2lnbmF0dXJl'

  return `${headerB64}.${payloadB64}.${fakeSignature}`
}

// =============================================================================
// Test Constants
// =============================================================================

const TEST_SECRET = 'test-secret-key-for-jwt-signature-verification-testing'
const WRONG_SECRET = 'wrong-secret-key-that-should-not-match'

// =============================================================================
// RED Tests: JWT Signature Verification
// =============================================================================

describe('JWT Signature Verification (RED Phase - esm-zabz)', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      tokenSecret: TEST_SECRET,
      validateExpiry: true,
    })
  })

  // ---------------------------------------------------------------------------
  // Test Case 1: Valid token with correct signature - should pass
  // ---------------------------------------------------------------------------
  describe('1. Valid token with correct signature', () => {
    it('should authenticate a token signed with the correct secret', async () => {
      const token = await createSignedJWT(
        { sub: 'user-123', name: 'Test User' },
        TEST_SECRET
      )

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(true)
      expect(result.user).toBeDefined()
      expect(result.user?.id).toBe('user-123')
      expect(result.user?.method).toBe('bearer')
    })

    it('should include token payload in user metadata', async () => {
      const token = await createSignedJWT(
        { sub: 'user-456', role: 'admin', permissions: ['read', 'write'] },
        TEST_SECRET
      )

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(true)
      expect(result.user?.metadata).toBeDefined()
      expect(result.user?.metadata?.role).toBe('admin')
    })
  })

  // ---------------------------------------------------------------------------
  // Test Case 2: Token with modified payload - should reject
  // ---------------------------------------------------------------------------
  describe('2. Token with modified payload', () => {
    it('should reject a token with tampered payload (privilege escalation attempt)', async () => {
      // Create a valid token first
      const validToken = await createSignedJWT(
        { sub: 'user-123', role: 'user' },
        TEST_SECRET
      )

      // Tamper with it to escalate privileges
      const tamperedToken = await tamperWithJWT(validToken, { role: 'admin' })

      const result = await middleware.validateToken(tamperedToken)

      // CRITICAL: This test documents the security vulnerability
      // Currently passes because signature is not verified
      // After implementation, this should FAIL to authenticate
      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/invalid.*signature|signature.*invalid|tampered/i)
      expect(result.status).toBe(401)
    })

    it('should reject a token with tampered sub claim', async () => {
      const validToken = await createSignedJWT(
        { sub: 'user-123' },
        TEST_SECRET
      )

      // Try to impersonate another user
      const tamperedToken = await tamperWithJWT(validToken, { sub: 'admin-user' })

      const result = await middleware.validateToken(tamperedToken)

      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/invalid.*signature|signature.*invalid|tampered/i)
    })

    it('should reject a token with added claims', async () => {
      const validToken = await createSignedJWT(
        { sub: 'user-123' },
        TEST_SECRET
      )

      // Try to add new claims
      const tamperedToken = await tamperWithJWT(validToken, {
        admin: true,
        bypass_auth: true,
      })

      const result = await middleware.validateToken(tamperedToken)

      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Test Case 3: Token with wrong algorithm - should reject
  // ---------------------------------------------------------------------------
  describe('3. Token with wrong algorithm', () => {
    it('should reject a token claiming RS256 when only HS256 is supported', async () => {
      const token = createWrongAlgorithmJWT({ sub: 'user-123' })

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/algorithm|unsupported|invalid/i)
      expect(result.status).toBe(401)
    })

    it('should reject a token with algorithm confusion (HS256 signed with public key)', async () => {
      // This tests the algorithm confusion vulnerability where an attacker
      // might try to sign with a public key if the system supports both HS256 and RS256
      const now = Math.floor(Date.now() / 1000)
      const header = { alg: 'HS512', typ: 'JWT' } // Unsupported algorithm
      const payload = { sub: 'attacker', iat: now, exp: now + 3600 }

      const headerB64 = base64UrlEncode(JSON.stringify(header))
      const payloadB64 = base64UrlEncode(JSON.stringify(payload))
      const fakeSignature = 'ZmFrZV9zaWduYXR1cmU'

      const token = `${headerB64}.${payloadB64}.${fakeSignature}`

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/algorithm|unsupported|invalid/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Test Case 4: Token signed with wrong key - should reject
  // ---------------------------------------------------------------------------
  describe('4. Token signed with wrong key', () => {
    it('should reject a token signed with a different secret', async () => {
      // Sign with wrong secret
      const token = await createSignedJWT(
        { sub: 'user-123' },
        WRONG_SECRET
      )

      const result = await middleware.validateToken(token)

      // CRITICAL: This is the main security vulnerability being tested
      // The token is properly formatted but signed with wrong key
      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/invalid.*signature|signature.*verification|authentication failed/i)
      expect(result.status).toBe(401)
    })

    it('should reject a valid-looking token signed with a very short secret', async () => {
      // Empty secret would throw, so use a very short/weak one instead
      const token = await createSignedJWT(
        { sub: 'user-123' },
        'a' // Very short secret (different from test secret)
      )

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
    })

    it('should reject a forged token attempting to bypass authentication', async () => {
      // Attacker creates their own token with their own secret
      const forgedToken = await createSignedJWT(
        { sub: 'admin', role: 'superuser', bypass: true },
        'attacker-controlled-secret'
      )

      const result = await middleware.validateToken(forgedToken)

      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Test Case 5: Token with algorithm "none" - should reject
  // ---------------------------------------------------------------------------
  describe('5. Token with algorithm "none"', () => {
    it('should reject a token with alg: "none" (already implemented)', async () => {
      const token = createNoneAlgJWT({ sub: 'attacker' })

      const result = await middleware.validateToken(token)

      // This should already pass per the issue description
      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/algorithm|invalid|none/i)
    })

    it('should reject a token with alg: "None" (case variation)', async () => {
      const now = Math.floor(Date.now() / 1000)
      const header = { alg: 'None', typ: 'JWT' }
      const payload = { sub: 'attacker', iat: now, exp: now + 3600 }

      const headerB64 = base64UrlEncode(JSON.stringify(header))
      const payloadB64 = base64UrlEncode(JSON.stringify(payload))

      const token = `${headerB64}.${payloadB64}.`

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
    })

    it('should reject a token with alg: "NONE" (uppercase)', async () => {
      const now = Math.floor(Date.now() / 1000)
      const header = { alg: 'NONE', typ: 'JWT' }
      const payload = { sub: 'attacker', iat: now, exp: now + 3600 }

      const headerB64 = base64UrlEncode(JSON.stringify(header))
      const payloadB64 = base64UrlEncode(JSON.stringify(payload))

      const token = `${headerB64}.${payloadB64}.`

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Test Case 6: Expired token - should reject
  // ---------------------------------------------------------------------------
  describe('6. Expired token', () => {
    it('should reject an expired token even with valid signature', async () => {
      const token = await createExpiredJWT({ sub: 'user-123' }, TEST_SECRET)

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/expired|expir/i)
      expect(result.status).toBe(401)
    })

    it('should reject a token that expires at current time (boundary)', async () => {
      const now = Math.floor(Date.now() / 1000)
      const header = { alg: 'HS256', typ: 'JWT' }
      const payload = { sub: 'user-123', iat: now - 100, exp: now } // Expires now

      const headerB64 = base64UrlEncode(JSON.stringify(header))
      const payloadB64 = base64UrlEncode(JSON.stringify(payload))
      const message = `${headerB64}.${payloadB64}`

      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(TEST_SECRET),
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign']
      )
      const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
      const signature = base64UrlEncodeBytes(new Uint8Array(signatureBytes))

      const token = `${message}.${signature}`

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/expired/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Test Case 7: Token without signature - should reject
  // ---------------------------------------------------------------------------
  describe('7. Token without signature', () => {
    it('should reject a token with empty signature part', async () => {
      const token = createUnsignedJWT({ sub: 'attacker' })

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
      expect(result.error).toMatch(/signature|invalid|missing/i)
      expect(result.status).toBe(401)
    })

    it('should reject a token with only two parts (missing signature)', async () => {
      const now = Math.floor(Date.now() / 1000)
      const header = { alg: 'HS256', typ: 'JWT' }
      const payload = { sub: 'attacker', iat: now, exp: now + 3600 }

      const headerB64 = base64UrlEncode(JSON.stringify(header))
      const payloadB64 = base64UrlEncode(JSON.stringify(payload))

      // Only two parts, no trailing dot
      const token = `${headerB64}.${payloadB64}`

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should reject a token with whitespace-only signature', async () => {
      const now = Math.floor(Date.now() / 1000)
      const header = { alg: 'HS256', typ: 'JWT' }
      const payload = { sub: 'attacker', iat: now, exp: now + 3600 }

      const headerB64 = base64UrlEncode(JSON.stringify(header))
      const payloadB64 = base64UrlEncode(JSON.stringify(payload))

      const token = `${headerB64}.${payloadB64}.   `

      const result = await middleware.validateToken(token)

      expect(result.authenticated).toBe(false)
    })
  })
})

// =============================================================================
// Additional Security Tests
// =============================================================================

describe('JWT Signature Verification - Additional Security (RED Phase)', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      tokenSecret: TEST_SECRET,
      validateExpiry: true,
    })
  })

  it('should use constant-time comparison for signature verification', async () => {
    // This test verifies behavior - actual timing attacks are hard to test
    // The implementation should use crypto.subtle.verify which is constant-time
    const validToken = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)
    const invalidToken = await createSignedJWT({ sub: 'user-123' }, WRONG_SECRET)

    const result1 = await middleware.validateToken(validToken)
    const result2 = await middleware.validateToken(invalidToken)

    // Valid token should pass
    expect(result1.authenticated).toBe(true)
    // Invalid token should fail
    expect(result2.authenticated).toBe(false)
  })

  it('should not accept tokens with truncated signature', async () => {
    const validToken = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)
    const parts = validToken.split('.')

    // Truncate the signature
    const truncatedSignature = parts[2]!.substring(0, 10)
    const truncatedToken = `${parts[0]}.${parts[1]}.${truncatedSignature}`

    const result = await middleware.validateToken(truncatedToken)

    expect(result.authenticated).toBe(false)
  })

  it('should not accept tokens with appended data to signature', async () => {
    const validToken = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)

    // Append extra data to signature
    const tokenWithExtra = validToken + 'extra_data'

    const result = await middleware.validateToken(tokenWithExtra)

    expect(result.authenticated).toBe(false)
  })

  it('should handle base64url padding variations correctly', async () => {
    // Create a token and verify it works with proper padding handling
    const token = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)

    // The token should work as-is (no padding in base64url)
    const result = await middleware.validateToken(token)

    expect(result.authenticated).toBe(true)
  })
})

// =============================================================================
// Configuration Tests
// =============================================================================

describe('JWT Signature Verification - Configuration', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
  })

  it('should require tokenSecret to be configured for signature verification', async () => {
    // Middleware without tokenSecret
    const middleware = createAuthMiddleware({
      validateExpiry: true,
      // tokenSecret is not set
    })

    const token = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)

    // Without tokenSecret, the middleware cannot verify signatures
    // It should either reject all tokens or require configuration
    const result = await middleware.validateToken(token)

    // After implementation, this should fail since no secret is configured
    // to verify against
    expect(result.authenticated).toBe(false)
    expect(result.error).toMatch(/secret.*required|configuration.*missing|cannot.*verify/i)
  })

  it('should verify signature when tokenSecret is provided', async () => {
    const middleware = createAuthMiddleware({
      tokenSecret: TEST_SECRET,
      validateExpiry: true,
    })

    const validToken = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)
    const invalidToken = await createSignedJWT({ sub: 'user-123' }, WRONG_SECRET)

    const validResult = await middleware.validateToken(validToken)
    const invalidResult = await middleware.validateToken(invalidToken)

    expect(validResult.authenticated).toBe(true)
    expect(invalidResult.authenticated).toBe(false)
  })
})

// =============================================================================
// Request Integration Tests
// =============================================================================

describe('JWT Signature Verification - Request Integration', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      tokenSecret: TEST_SECRET,
      validateExpiry: true,
    })
  })

  function createMockRequest(headers: Record<string, string>): Request {
    return new Request('http://localhost/api/modules', {
      method: 'GET',
      headers: new Headers(headers),
    })
  }

  it('should reject request with forged Bearer token', async () => {
    const forgedToken = await createSignedJWT(
      { sub: 'admin', role: 'superuser' },
      'attacker-secret'
    )

    const request = createMockRequest({
      Authorization: `Bearer ${forgedToken}`,
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(false)
    expect(result.status).toBe(401)
  })

  it('should accept request with valid Bearer token', async () => {
    const validToken = await createSignedJWT(
      { sub: 'user-123' },
      TEST_SECRET
    )

    const request = createMockRequest({
      Authorization: `Bearer ${validToken}`,
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(true)
    expect(result.user?.id).toBe('user-123')
  })

  it('should reject request with tampered Bearer token', async () => {
    const validToken = await createSignedJWT(
      { sub: 'user-123', role: 'user' },
      TEST_SECRET
    )

    const tamperedToken = await tamperWithJWT(validToken, { role: 'admin' })

    const request = createMockRequest({
      Authorization: `Bearer ${tamperedToken}`,
    })

    const result = await middleware.authenticate(request)

    expect(result.authenticated).toBe(false)
  })
})

// =============================================================================
// NBF (Not Before) Tests
// =============================================================================

describe('JWT Signature Verification - NBF Claim', () => {
  let createAuthMiddleware: (config?: AuthConfig) => AuthMiddleware
  let middleware: AuthMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/auth.js')
    createAuthMiddleware = module.createAuthMiddleware
    middleware = createAuthMiddleware({
      tokenSecret: TEST_SECRET,
      validateExpiry: true,
    })
  })

  /**
   * Create a JWT with nbf (not before) claim
   */
  async function createJWTWithNbf(
    payload: Record<string, unknown>,
    secret: string,
    nbfOffset: number // offset in seconds from now (negative = past, positive = future)
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'HS256', typ: 'JWT' }
    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + 3600,
      nbf: now + nbfOffset,
    }

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

  it('should accept a token that is currently valid (nbf in the past)', async () => {
    const token = await createJWTWithNbf({ sub: 'user-123' }, TEST_SECRET, -60) // nbf 60 seconds ago

    const result = await middleware.validateToken(token)

    expect(result.authenticated).toBe(true)
    expect(result.user?.id).toBe('user-123')
  })

  it('should reject a token that is not yet valid (nbf in the future)', async () => {
    const token = await createJWTWithNbf({ sub: 'user-123' }, TEST_SECRET, 3600) // nbf 1 hour in future

    const result = await middleware.validateToken(token)

    expect(result.authenticated).toBe(false)
    expect(result.error).toMatch(/not yet valid|nbf/i)
    expect(result.status).toBe(401)
  })

  it('should accept a token with nbf exactly at current time', async () => {
    // Since there can be slight timing differences, we use nbf slightly in the past
    const token = await createJWTWithNbf({ sub: 'user-123' }, TEST_SECRET, -1) // nbf 1 second ago

    const result = await middleware.validateToken(token)

    expect(result.authenticated).toBe(true)
  })

  it('should accept a token without nbf claim', async () => {
    const token = await createSignedJWT({ sub: 'user-123' }, TEST_SECRET)

    const result = await middleware.validateToken(token)

    expect(result.authenticated).toBe(true)
  })
})

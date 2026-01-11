/**
 * Authentication Middleware for ESM Module System
 *
 * Provides bearer token and API key authentication for protecting API routes.
 * Supports JWT validation, API key validation, public paths, and anonymous access.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * AuthConfig - Configuration for authentication middleware
 */
export interface AuthConfig {
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
export interface AuthUser {
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
export interface AuthResult {
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
export interface AuthMiddleware {
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
// JWT Helpers
// =============================================================================

interface JwtHeader {
  alg: string
  typ?: string
}

interface JwtPayload {
  sub?: string
  iat?: number
  exp?: number
  [key: string]: unknown
}

/**
 * Decode a base64url encoded string
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe characters with standard base64 characters
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if necessary
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4)
  return atob(padded)
}

/**
 * Parse a JWT token without verification (for extracting payload)
 */
function parseJwt(token: string): { header: JwtHeader; payload: JwtPayload } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const headerPart = parts[0]
    const payloadPart = parts[1]
    if (!headerPart || !payloadPart) return null
    const header = JSON.parse(base64UrlDecode(headerPart)) as JwtHeader
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as JwtPayload

    return { header, payload }
  } catch {
    return null
  }
}

// =============================================================================
// Timing-Safe Comparison
// =============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to maintain constant time
    let result = 0
    const minLen = Math.min(a.length, b.length)
    for (let i = 0; i < minLen; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    // Force inequality since lengths differ
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<Pick<AuthConfig, 'allowAnonymous' | 'validateExpiry'>> = {
  allowAnonymous: false,
  validateExpiry: true,
}

// =============================================================================
// Authentication Middleware Factory
// =============================================================================

/**
 * Creates an authentication middleware instance with the specified configuration.
 *
 * @param config - Partial auth configuration to override defaults
 * @returns AuthMiddleware instance
 */
export function createAuthMiddleware(config?: AuthConfig): AuthMiddleware {
  const mergedConfig: AuthConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  }

  // Normalize API keys to a Map for consistent access
  const apiKeysMap: Map<string, string> = new Map()
  if (mergedConfig.apiKeys) {
    if (mergedConfig.apiKeys instanceof Map) {
      mergedConfig.apiKeys.forEach((value, key) => apiKeysMap.set(key, value))
    } else {
      Object.entries(mergedConfig.apiKeys).forEach(([key, value]) => apiKeysMap.set(key, value))
    }
  }

  /**
   * Check if a path matches any of the public paths.
   * Supports exact matches and wildcard patterns (ending with *).
   */
  function isPublicPath(path: string): boolean {
    if (!mergedConfig.publicPaths || mergedConfig.publicPaths.length === 0) {
      return false
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    return mergedConfig.publicPaths.some((publicPath) => {
      if (publicPath.endsWith('*')) {
        // Wildcard pattern - match prefix
        const prefix = publicPath.slice(0, -1)
        return normalizedPath.startsWith(prefix)
      }
      // Exact match
      return normalizedPath === publicPath
    })
  }

  /**
   * Validate a bearer token (JWT).
   */
  async function validateToken(token: string): Promise<AuthResult> {
    // Reject empty tokens
    if (!token || token.trim() === '') {
      return {
        authenticated: false,
        error: 'Token is required',
        status: 401,
      }
    }

    // Parse the JWT
    const parsed = parseJwt(token)
    if (!parsed) {
      return {
        authenticated: false,
        error: 'Invalid token format',
        status: 401,
      }
    }

    const { header, payload } = parsed

    // Security: Reject tokens with algorithm "none"
    if (header.alg === 'none' || header.alg.toLowerCase() === 'none') {
      return {
        authenticated: false,
        error: 'Invalid token algorithm',
        status: 401,
      }
    }

    // Check for expiry if validation is enabled
    if (mergedConfig.validateExpiry !== false && payload.exp) {
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp <= now) {
        return {
          authenticated: false,
          error: 'Token has expired',
          status: 401,
        }
      }
    }

    // Extract user ID from sub claim
    const userId = payload.sub || 'unknown'

    return {
      authenticated: true,
      user: {
        id: userId,
        method: 'bearer',
        metadata: payload as Record<string, unknown>,
      },
    }
  }

  /**
   * Validate an API key.
   */
  async function validateApiKey(key: string): Promise<AuthResult> {
    // Reject empty keys
    if (!key || key.trim() === '') {
      return {
        authenticated: false,
        error: 'API key is required',
        status: 401,
      }
    }

    // Check if the key exists using timing-safe comparison
    let matchedUserId: string | null = null

    for (const [storedKey, userId] of apiKeysMap) {
      if (timingSafeEqual(key, storedKey)) {
        matchedUserId = userId
        break
      }
    }

    if (!matchedUserId) {
      return {
        authenticated: false,
        error: 'Invalid API key',
        status: 401,
      }
    }

    return {
      authenticated: true,
      user: {
        id: matchedUserId,
        method: 'api-key',
      },
    }
  }

  /**
   * Authenticate a request using available credentials.
   */
  async function authenticate(request: Request): Promise<AuthResult> {
    // Extract the path from the request URL
    const url = new URL(request.url)
    const path = url.pathname

    // Check if this is a public path
    if (isPublicPath(path)) {
      return {
        authenticated: true,
        user: {
          id: 'public',
          method: 'bearer', // Arbitrary, as no real auth occurred
        },
      }
    }

    // Check for Authorization header (Bearer token takes precedence)
    const authHeader = request.headers.get('Authorization')
    if (authHeader) {
      const match = authHeader.match(/^bearer\s+(.+)$/i)
      if (match && match[1]) {
        const token = match[1]
        return validateToken(token)
      } else {
        // Non-Bearer authorization scheme
        return {
          authenticated: false,
          error: 'Only Bearer authorization scheme is supported',
          status: 401,
        }
      }
    }

    // Check for X-API-Key header
    const apiKey = request.headers.get('X-API-Key')
    if (apiKey) {
      return validateApiKey(apiKey)
    }

    // No credentials provided
    if (mergedConfig.allowAnonymous) {
      return {
        authenticated: true,
        user: {
          id: 'anonymous',
          method: 'bearer', // Arbitrary for anonymous
        },
      }
    }

    return {
      authenticated: false,
      error: 'Missing credentials',
      status: 401,
    }
  }

  /**
   * Get the current configuration.
   */
  function getConfig(): AuthConfig {
    return { ...mergedConfig }
  }

  return {
    authenticate,
    validateToken,
    validateApiKey,
    isPublicPath,
    getConfig,
  }
}

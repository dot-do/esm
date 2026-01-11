/**
 * esm.do Vercel Edge Middleware
 *
 * Handles request preprocessing, CORS, and authentication for all routes.
 * Runs before the Edge Function handler for all incoming requests.
 */

import { NextRequest, NextResponse } from 'next/server'

// =============================================================================
// Configuration
// =============================================================================

const CORS_CONFIG = {
  allowOrigins: ['*'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposeHeaders: [
    'ETag',
    'Cache-Control',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
    'X-Request-Id',
  ],
  maxAge: 86400,
}

// Protected namespaces that require authentication
const PROTECTED_NAMESPACES = ['@protected', '@admin', '@system']

// API key validation (in production, use Vercel KV or environment secrets)
const VALID_API_KEYS = new Set([
  process.env.ESM_DO_API_KEY,
  process.env.ESM_DO_ADMIN_KEY,
].filter(Boolean))

// =============================================================================
// CORS Helpers
// =============================================================================

function addCorsHeaders(
  response: NextResponse,
  origin: string | null
): NextResponse {
  const allowedOrigin = CORS_CONFIG.allowOrigins.includes('*')
    ? '*'
    : CORS_CONFIG.allowOrigins.includes(origin || '')
      ? origin
      : CORS_CONFIG.allowOrigins[0]

  response.headers.set('Access-Control-Allow-Origin', allowedOrigin || '*')
  response.headers.set(
    'Access-Control-Allow-Methods',
    CORS_CONFIG.allowMethods.join(', ')
  )
  response.headers.set(
    'Access-Control-Allow-Headers',
    CORS_CONFIG.allowHeaders.join(', ')
  )
  response.headers.set(
    'Access-Control-Expose-Headers',
    CORS_CONFIG.exposeHeaders.join(', ')
  )
  response.headers.set('Access-Control-Max-Age', CORS_CONFIG.maxAge.toString())

  return response
}

// =============================================================================
// Authentication
// =============================================================================

function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return request.headers.get('X-API-Key')
}

function isValidApiKey(apiKey: string | null): boolean {
  if (!apiKey) return false
  return VALID_API_KEYS.has(apiKey)
}

function isProtectedPath(pathname: string): boolean {
  for (const namespace of PROTECTED_NAMESPACES) {
    // Match paths like /@protected/module or /protected/module
    if (
      pathname.startsWith(`/${namespace}/`) ||
      pathname.startsWith(`/${namespace.replace('@', '')}/`)
    ) {
      return true
    }
  }
  return false
}

function isWriteOperation(method: string): boolean {
  return method === 'POST' || method === 'DELETE' || method === 'PUT' || method === 'PATCH'
}

// =============================================================================
// Request Preprocessing
// =============================================================================

function sanitizePath(pathname: string): string {
  // Remove double slashes
  let sanitized = pathname.replace(/\/+/g, '/')

  // Remove trailing slash (except for root)
  if (sanitized.length > 1 && sanitized.endsWith('/')) {
    // Keep trailing slash for scope listing routes like /math/
    const isListRoute = /^\/[a-zA-Z0-9_-]+\/$/.test(sanitized)
    if (!isListRoute) {
      sanitized = sanitized.slice(0, -1)
    }
  }

  // Block path traversal attempts
  if (sanitized.includes('..')) {
    return ''
  }

  return sanitized
}

function validateContentType(request: NextRequest): boolean {
  const method = request.method
  if (method === 'GET' || method === 'DELETE' || method === 'OPTIONS') {
    return true
  }

  const contentType = request.headers.get('Content-Type')
  // Allow requests without body or with JSON content type
  if (!contentType) return true
  return contentType.includes('application/json')
}

// =============================================================================
// Middleware
// =============================================================================

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const method = request.method
  const origin = request.headers.get('Origin')
  const requestId = crypto.randomUUID()

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 })
    response.headers.set('X-Request-Id', requestId)
    return addCorsHeaders(response, origin)
  }

  // Sanitize and validate path
  const sanitizedPath = sanitizePath(pathname)
  if (!sanitizedPath) {
    const response = NextResponse.json(
      {
        error: 'Invalid path',
        status: 400,
        requestId,
      },
      { status: 400 }
    )
    response.headers.set('X-Request-Id', requestId)
    return addCorsHeaders(response, origin)
  }

  // Validate content type for write operations
  if (isWriteOperation(method) && !validateContentType(request)) {
    const response = NextResponse.json(
      {
        error: 'Content-Type must be application/json',
        status: 415,
        requestId,
      },
      { status: 415 }
    )
    response.headers.set('X-Request-Id', requestId)
    return addCorsHeaders(response, origin)
  }

  // Check authentication for protected paths
  if (isProtectedPath(sanitizedPath) && isWriteOperation(method)) {
    const apiKey = extractApiKey(request)
    if (!isValidApiKey(apiKey)) {
      const response = NextResponse.json(
        {
          error: 'Authentication required',
          status: 401,
          requestId,
        },
        { status: 401 }
      )
      response.headers.set('X-Request-Id', requestId)
      response.headers.set('WWW-Authenticate', 'Bearer realm="esm.do"')
      return addCorsHeaders(response, origin)
    }
  }

  // Rewrite path if needed (handle @ prefix normalization)
  let rewrittenPath = sanitizedPath
  if (sanitizedPath.match(/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]/)) {
    // Path like /math/add should work the same as /@math/add
    // The handler will add the @ prefix when needed
  }

  // Add request ID and security headers
  const response = NextResponse.next()
  response.headers.set('X-Request-Id', requestId)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Add CORS headers to all responses
  addCorsHeaders(response, origin)

  return response
}

// =============================================================================
// Matcher Configuration
// =============================================================================

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}

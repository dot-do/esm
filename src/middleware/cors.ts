/**
 * CORS Middleware for ESM Module System
 *
 * Provides CORS support for cross-origin module imports and API requests.
 * Handles preflight OPTIONS requests and adds appropriate CORS headers.
 */

// =============================================================================
// Types
// =============================================================================

export interface CorsConfig {
  allowOrigins: string[] | '*'
  allowMethods: string[]
  allowHeaders: string[]
  exposeHeaders: string[]
  maxAge: number
  credentials?: boolean
}

export interface CorsMiddleware {
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
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: CorsConfig = {
  allowOrigins: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposeHeaders: ['ETag', 'Cache-Control', 'Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours
  credentials: false,
}

// =============================================================================
// CORS Middleware Factory
// =============================================================================

/**
 * Creates a CORS middleware instance with the specified configuration.
 *
 * @param config - Partial CORS configuration to override defaults
 * @returns CorsMiddleware instance
 */
export function createCorsMiddleware(config?: Partial<CorsConfig>): CorsMiddleware {
  const mergedConfig: CorsConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  }

  /**
   * Check if an origin is allowed based on the configuration.
   */
  function isOriginAllowed(origin: string): boolean {
    if (mergedConfig.allowOrigins === '*') {
      return true
    }

    const normalizedOrigin = origin.toLowerCase()
    return mergedConfig.allowOrigins.some(
      (allowed) => allowed.toLowerCase() === normalizedOrigin
    )
  }

  /**
   * Determine the value for Access-Control-Allow-Origin header.
   */
  function getAllowOriginValue(requestOrigin?: string): string {
    // If credentials are enabled and we have a specific origin, echo it back
    if (mergedConfig.credentials && requestOrigin) {
      if (isOriginAllowed(requestOrigin)) {
        return requestOrigin
      }
    }

    // If allowOrigins is '*' and credentials are not enabled, return '*'
    if (mergedConfig.allowOrigins === '*' && !mergedConfig.credentials) {
      return '*'
    }

    // If we have a request origin and it's allowed, echo it back
    if (requestOrigin && isOriginAllowed(requestOrigin)) {
      return requestOrigin
    }

    // Default to '*' if allowOrigins is '*'
    if (mergedConfig.allowOrigins === '*') {
      return '*'
    }

    // Return first allowed origin as fallback
    return mergedConfig.allowOrigins[0] || '*'
  }

  /**
   * Add CORS headers to an existing response.
   * Preserves existing headers and does not overwrite existing CORS headers.
   */
  function addCorsHeaders(response: Response, origin?: string): Response {
    // Clone headers from original response
    const headers = new Headers(response.headers)

    // Only add Access-Control-Allow-Origin if not already present
    if (!headers.has('Access-Control-Allow-Origin')) {
      headers.set('Access-Control-Allow-Origin', getAllowOriginValue(origin))
    }

    // Add Access-Control-Expose-Headers if not already present
    if (!headers.has('Access-Control-Expose-Headers')) {
      headers.set('Access-Control-Expose-Headers', mergedConfig.exposeHeaders.join(', '))
    }

    // Add credentials header if configured
    if (mergedConfig.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true')
    }

    // Create new response with CORS headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  /**
   * Handle OPTIONS preflight request.
   * Returns a 204 response with all necessary CORS preflight headers.
   */
  function handlePreflight(request: Request): Response {
    const requestOrigin = request.headers.get('Origin') || undefined

    const headers = new Headers({
      'Access-Control-Allow-Origin': getAllowOriginValue(requestOrigin),
      'Access-Control-Allow-Methods': mergedConfig.allowMethods.join(', '),
      'Access-Control-Allow-Headers': mergedConfig.allowHeaders.join(', '),
      'Access-Control-Max-Age': String(mergedConfig.maxAge),
      'Access-Control-Expose-Headers': mergedConfig.exposeHeaders.join(', '),
    })

    if (mergedConfig.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true')
    }

    return new Response(null, {
      status: 204,
      headers,
    })
  }

  /**
   * Get the current CORS configuration.
   */
  function getConfig(): CorsConfig {
    return { ...mergedConfig }
  }

  return {
    addCorsHeaders,
    handlePreflight,
    isOriginAllowed,
    getConfig,
  }
}

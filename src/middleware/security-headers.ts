/**
 * Security Headers Middleware
 *
 * This middleware adds security headers to HTTP responses to protect against
 * common web vulnerabilities including:
 * - MIME type sniffing
 * - Clickjacking
 * - Cross-site scripting (XSS)
 * - Information leakage via referrer
 * - Unauthorized feature access
 */

// =============================================================================
// Types
// =============================================================================

/**
 * CSPDirective - Content-Security-Policy directive values
 */
export type CSPDirective =
  | "'self'"
  | "'none'"
  | "'unsafe-inline'"
  | "'unsafe-eval'"
  | "'strict-dynamic'"
  | "'unsafe-hashes'"
  | 'blob:'
  | 'data:'
  | string

/**
 * ContentSecurityPolicy - CSP configuration
 */
export interface ContentSecurityPolicy {
  /** Default policy for loading content */
  'default-src'?: CSPDirective[]
  /** Policy for script sources */
  'script-src'?: CSPDirective[]
  /** Policy for style sources */
  'style-src'?: CSPDirective[]
  /** Policy for image sources */
  'img-src'?: CSPDirective[]
  /** Policy for font sources */
  'font-src'?: CSPDirective[]
  /** Policy for connect/fetch sources */
  'connect-src'?: CSPDirective[]
  /** Policy for frame sources */
  'frame-src'?: CSPDirective[]
  /** Policy for object/embed/applet sources */
  'object-src'?: CSPDirective[]
  /** Policy for media sources */
  'media-src'?: CSPDirective[]
  /** Policy for form action targets */
  'form-action'?: CSPDirective[]
  /** Policy for frame ancestors (clickjacking protection) */
  'frame-ancestors'?: CSPDirective[]
  /** Policy for base URI */
  'base-uri'?: CSPDirective[]
  /** Policy for Worker script sources */
  'worker-src'?: CSPDirective[]
  /** Policy for manifest sources */
  'manifest-src'?: CSPDirective[]
  /** Upgrade insecure requests */
  'upgrade-insecure-requests'?: boolean
  /** Block all mixed content */
  'block-all-mixed-content'?: boolean
  /** Report URI for CSP violations */
  'report-uri'?: string
  /** Report endpoint for CSP violations (newer) */
  'report-to'?: string
}

/**
 * XFrameOptions - X-Frame-Options header values
 */
export type XFrameOptions = 'DENY' | 'SAMEORIGIN'

/**
 * ReferrerPolicy - Referrer-Policy header values
 */
export type ReferrerPolicy =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url'

/**
 * SecurityHeadersConfig - Configuration for security headers middleware
 */
export interface SecurityHeadersConfig {
  /** X-Content-Type-Options: nosniff (default: true) */
  contentTypeOptions?: boolean
  /** X-Frame-Options value (default: 'DENY') */
  frameOptions?: XFrameOptions | false
  /** Content-Security-Policy configuration */
  contentSecurityPolicy?: ContentSecurityPolicy | false
  /** Use Content-Security-Policy-Report-Only instead of CSP (default: false) */
  cspReportOnly?: boolean
  /** X-XSS-Protection header (default: true for legacy browser support) */
  xssProtection?: boolean
  /** Referrer-Policy value (default: 'strict-origin-when-cross-origin') */
  referrerPolicy?: ReferrerPolicy | false
  /** Permissions-Policy configuration */
  permissionsPolicy?: Record<string, string[]> | false
  /** Strict-Transport-Security configuration */
  hsts?: {
    maxAge: number
    includeSubDomains?: boolean
    preload?: boolean
  } | false
  /** Cross-Origin-Opener-Policy */
  coopPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false
  /** Cross-Origin-Embedder-Policy */
  coepPolicy?: 'require-corp' | 'credentialless' | 'unsafe-none' | false
  /** Cross-Origin-Resource-Policy */
  corpPolicy?: 'same-site' | 'same-origin' | 'cross-origin' | false
}

/**
 * SecurityHeadersMiddleware - Security headers middleware interface
 */
export interface SecurityHeadersMiddleware {
  /** Add security headers to a response */
  addSecurityHeaders(response: Response): Response
  /** Generate CSP header string from config */
  generateCSPHeader(): string
  /** Generate Permissions-Policy header string */
  generatePermissionsPolicyHeader(): string
  /** Get the middleware configuration */
  getConfig(): SecurityHeadersConfig
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: SecurityHeadersConfig = {
  contentTypeOptions: true,
  frameOptions: 'DENY',
  contentSecurityPolicy: false, // Default to false, users should configure explicitly
  cspReportOnly: false,
  xssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: false,
  hsts: false,
  coopPolicy: false,
  coepPolicy: false,
  corpPolicy: false,
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Creates a security headers middleware instance
 */
export function createSecurityHeadersMiddleware(
  config: SecurityHeadersConfig = {}
): SecurityHeadersMiddleware {
  // Merge with defaults
  const resolvedConfig: SecurityHeadersConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  }

  /**
   * Generate Content-Security-Policy header string
   */
  function generateCSPHeader(): string {
    const csp = resolvedConfig.contentSecurityPolicy
    if (!csp) {
      return ''
    }

    const directives: string[] = []

    // Process array directives
    const arrayDirectives = [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'frame-src',
      'object-src',
      'media-src',
      'form-action',
      'frame-ancestors',
      'base-uri',
      'worker-src',
      'manifest-src',
    ] as const

    for (const directive of arrayDirectives) {
      const value = csp[directive]
      if (value && Array.isArray(value) && value.length > 0) {
        directives.push(`${directive} ${value.join(' ')}`)
      }
    }

    // Process boolean directives
    if (csp['upgrade-insecure-requests'] === true) {
      directives.push('upgrade-insecure-requests')
    }
    if (csp['block-all-mixed-content'] === true) {
      directives.push('block-all-mixed-content')
    }

    // Process string directives
    if (csp['report-uri']) {
      directives.push(`report-uri ${csp['report-uri']}`)
    }
    if (csp['report-to']) {
      directives.push(`report-to ${csp['report-to']}`)
    }

    return directives.join('; ')
  }

  /**
   * Generate Permissions-Policy header string
   */
  function generatePermissionsPolicyHeader(): string {
    const policy = resolvedConfig.permissionsPolicy
    if (!policy) {
      return ''
    }

    const directives: string[] = []

    for (const [feature, origins] of Object.entries(policy)) {
      if (origins.length === 0) {
        directives.push(`${feature}=()`)
      } else {
        const formattedOrigins = origins.map((origin) => {
          // 'self' should not be quoted in Permissions-Policy
          if (origin === 'self') {
            return 'self'
          }
          // URLs should be quoted
          return `"${origin}"`
        }).join(' ')
        directives.push(`${feature}=(${formattedOrigins})`)
      }
    }

    return directives.join(', ')
  }

  /**
   * Add security headers to a response
   */
  function addSecurityHeaders(response: Response): Response {
    // Create a new headers object with existing headers
    const headers = new Headers(response.headers)

    // X-Content-Type-Options
    if (resolvedConfig.contentTypeOptions && !headers.has('X-Content-Type-Options')) {
      headers.set('X-Content-Type-Options', 'nosniff')
    }

    // X-Frame-Options
    if (resolvedConfig.frameOptions && !headers.has('X-Frame-Options')) {
      headers.set('X-Frame-Options', resolvedConfig.frameOptions)
    }

    // X-XSS-Protection
    if (resolvedConfig.xssProtection && !headers.has('X-XSS-Protection')) {
      headers.set('X-XSS-Protection', '1; mode=block')
    }

    // Referrer-Policy
    if (resolvedConfig.referrerPolicy && !headers.has('Referrer-Policy')) {
      headers.set('Referrer-Policy', resolvedConfig.referrerPolicy)
    }

    // Content-Security-Policy
    if (resolvedConfig.contentSecurityPolicy) {
      const cspHeader = generateCSPHeader()
      if (cspHeader) {
        if (resolvedConfig.cspReportOnly) {
          if (!headers.has('Content-Security-Policy-Report-Only')) {
            headers.set('Content-Security-Policy-Report-Only', cspHeader)
          }
        } else {
          if (!headers.has('Content-Security-Policy')) {
            headers.set('Content-Security-Policy', cspHeader)
          }
        }
      }
    }

    // Permissions-Policy
    if (resolvedConfig.permissionsPolicy) {
      const policyHeader = generatePermissionsPolicyHeader()
      if (policyHeader && !headers.has('Permissions-Policy')) {
        headers.set('Permissions-Policy', policyHeader)
      }
    }

    // Strict-Transport-Security (HSTS)
    if (resolvedConfig.hsts && !headers.has('Strict-Transport-Security')) {
      let hstsValue = `max-age=${resolvedConfig.hsts.maxAge}`
      if (resolvedConfig.hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains'
      }
      if (resolvedConfig.hsts.preload) {
        hstsValue += '; preload'
      }
      headers.set('Strict-Transport-Security', hstsValue)
    }

    // Cross-Origin-Opener-Policy
    if (resolvedConfig.coopPolicy && !headers.has('Cross-Origin-Opener-Policy')) {
      headers.set('Cross-Origin-Opener-Policy', resolvedConfig.coopPolicy)
    }

    // Cross-Origin-Embedder-Policy
    if (resolvedConfig.coepPolicy && !headers.has('Cross-Origin-Embedder-Policy')) {
      headers.set('Cross-Origin-Embedder-Policy', resolvedConfig.coepPolicy)
    }

    // Cross-Origin-Resource-Policy
    if (resolvedConfig.corpPolicy && !headers.has('Cross-Origin-Resource-Policy')) {
      headers.set('Cross-Origin-Resource-Policy', resolvedConfig.corpPolicy)
    }

    // Create new response with updated headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  /**
   * Get the resolved configuration
   */
  function getConfig(): SecurityHeadersConfig {
    return { ...resolvedConfig }
  }

  return {
    addSecurityHeaders,
    generateCSPHeader,
    generatePermissionsPolicyHeader,
    getConfig,
  }
}

// =============================================================================
// Preset Configurations
// =============================================================================

/**
 * Get secure preset with strict security headers
 * Suitable for production applications requiring high security
 */
export function getSecurePreset(): SecurityHeadersConfig {
  return {
    contentTypeOptions: true,
    frameOptions: 'DENY',
    contentSecurityPolicy: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
      'upgrade-insecure-requests': true,
    },
    cspReportOnly: false,
    xssProtection: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      'interest-cohort': [],
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    coopPolicy: 'same-origin',
    coepPolicy: 'require-corp',
    corpPolicy: 'same-origin',
  }
}

/**
 * Get API preset optimized for API responses
 * APIs typically need different security settings than web pages
 */
export function getApiPreset(): SecurityHeadersConfig {
  return {
    contentTypeOptions: true,
    frameOptions: 'DENY',
    contentSecurityPolicy: {
      'default-src': ["'none'"],
      'frame-ancestors': ["'none'"],
    },
    cspReportOnly: false,
    xssProtection: true,
    referrerPolicy: 'no-referrer',
    permissionsPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    coopPolicy: false,
    coepPolicy: false,
    corpPolicy: 'same-origin',
  }
}

/**
 * Get relaxed preset for development
 * Less restrictive settings for easier development/debugging
 */
export function getRelaxedPreset(): SecurityHeadersConfig {
  return {
    contentTypeOptions: true,
    frameOptions: 'SAMEORIGIN',
    contentSecurityPolicy: false, // Disabled for development
    cspReportOnly: true, // Report-only mode if CSP is enabled
    xssProtection: true,
    referrerPolicy: 'no-referrer-when-downgrade',
    permissionsPolicy: false,
    hsts: false, // No HSTS for local development
    coopPolicy: false,
    coepPolicy: false,
    corpPolicy: false,
  }
}

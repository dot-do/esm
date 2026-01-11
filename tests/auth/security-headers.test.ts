/**
 * RED Tests for Security Headers (esm-auth.8)
 *
 * These tests are designed to FAIL until the security headers middleware is implemented.
 * They verify that proper security headers are added to responses.
 *
 * The security headers middleware should add:
 * 1. X-Content-Type-Options: nosniff - Prevents MIME type sniffing
 * 2. X-Frame-Options: DENY or SAMEORIGIN - Prevents clickjacking
 * 3. Content-Security-Policy - Controls resource loading and execution
 * 4. X-XSS-Protection - Legacy XSS protection (for older browsers)
 * 5. Referrer-Policy - Controls referrer information
 * 6. Permissions-Policy - Controls browser feature access
 */

import { describe, it, expect, beforeAll } from 'vitest'

// =============================================================================
// Security Headers Types (to be implemented in src/middleware/security-headers.ts)
// =============================================================================

/**
 * CSPDirective - Content-Security-Policy directive values
 */
type CSPDirective =
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
interface ContentSecurityPolicy {
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
type XFrameOptions = 'DENY' | 'SAMEORIGIN'

/**
 * ReferrerPolicy - Referrer-Policy header values
 */
type ReferrerPolicy =
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
interface SecurityHeadersConfig {
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
interface SecurityHeadersMiddleware {
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
// Helper Functions
// =============================================================================

function createMockResponse(options: {
  status?: number
  body?: string | null
  headers?: Record<string, string>
}): Response {
  const { status = 200, body = null, headers = {} } = options
  return new Response(body, {
    status,
    headers: new Headers(headers),
  })
}

// =============================================================================
// RED Tests: Security Headers Middleware Factory
// =============================================================================

describe('Security Headers Middleware Factory', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware

  beforeAll(async () => {
    // This import should fail until the middleware is implemented
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
  })

  it('should export createSecurityHeadersMiddleware function', () => {
    expect(typeof createSecurityHeadersMiddleware).toBe('function')
  })

  it('should create middleware with default config', () => {
    const middleware = createSecurityHeadersMiddleware()
    const config = middleware.getConfig()

    expect(config.contentTypeOptions).toBe(true)
    expect(config.frameOptions).toBe('DENY')
    expect(config.xssProtection).toBe(true)
    expect(config.referrerPolicy).toBe('strict-origin-when-cross-origin')
  })

  it('should create middleware with custom config', () => {
    const middleware = createSecurityHeadersMiddleware({
      frameOptions: 'SAMEORIGIN',
      referrerPolicy: 'no-referrer',
      contentTypeOptions: false,
    })
    const config = middleware.getConfig()

    expect(config.frameOptions).toBe('SAMEORIGIN')
    expect(config.referrerPolicy).toBe('no-referrer')
    expect(config.contentTypeOptions).toBe(false)
  })

  it('should allow disabling specific headers', () => {
    const middleware = createSecurityHeadersMiddleware({
      frameOptions: false,
      contentSecurityPolicy: false,
      referrerPolicy: false,
    })
    const config = middleware.getConfig()

    expect(config.frameOptions).toBe(false)
    expect(config.contentSecurityPolicy).toBe(false)
    expect(config.referrerPolicy).toBe(false)
  })
})

// =============================================================================
// RED Tests: X-Content-Type-Options Header
// =============================================================================

describe('Security Headers - X-Content-Type-Options', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware
  let middleware: SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
    middleware = createSecurityHeadersMiddleware()
  })

  it('should add X-Content-Type-Options: nosniff by default', () => {
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('should not add X-Content-Type-Options when disabled', () => {
    const disabledMiddleware = createSecurityHeadersMiddleware({
      contentTypeOptions: false,
    })
    const response = createMockResponse({})
    const securedResponse = disabledMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('X-Content-Type-Options')).toBe(false)
  })

  it('should preserve existing X-Content-Type-Options header', () => {
    const response = createMockResponse({
      headers: { 'X-Content-Type-Options': 'nosniff' },
    })
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

// =============================================================================
// RED Tests: X-Frame-Options Header
// =============================================================================

describe('Security Headers - X-Frame-Options', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware
  let middleware: SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
    middleware = createSecurityHeadersMiddleware()
  })

  it('should add X-Frame-Options: DENY by default', () => {
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('should add X-Frame-Options: SAMEORIGIN when configured', () => {
    const sameOriginMiddleware = createSecurityHeadersMiddleware({
      frameOptions: 'SAMEORIGIN',
    })
    const response = createMockResponse({})
    const securedResponse = sameOriginMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
  })

  it('should not add X-Frame-Options when disabled', () => {
    const disabledMiddleware = createSecurityHeadersMiddleware({
      frameOptions: false,
    })
    const response = createMockResponse({})
    const securedResponse = disabledMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('X-Frame-Options')).toBe(false)
  })

  it('should prevent clickjacking by blocking framing', () => {
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)
    const frameOptions = securedResponse.headers.get('X-Frame-Options')

    expect(['DENY', 'SAMEORIGIN']).toContain(frameOptions)
  })
})

// =============================================================================
// RED Tests: Content-Security-Policy Header
// =============================================================================

describe('Security Headers - Content-Security-Policy', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware
  let middleware: SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
    middleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'frame-ancestors': ["'none'"],
      },
    })
  })

  it('should add Content-Security-Policy header', () => {
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('Content-Security-Policy')).toBe(true)
  })

  it('should include default-src directive', () => {
    const csp = middleware.generateCSPHeader()

    expect(csp).toContain("default-src 'self'")
  })

  it('should include script-src directive', () => {
    const csp = middleware.generateCSPHeader()

    expect(csp).toContain('script-src')
    expect(csp).toContain("'self'")
  })

  it('should include style-src directive', () => {
    const csp = middleware.generateCSPHeader()

    expect(csp).toContain('style-src')
  })

  it('should include img-src directive', () => {
    const csp = middleware.generateCSPHeader()

    expect(csp).toContain('img-src')
    expect(csp).toContain('data:')
  })

  it('should include frame-ancestors directive for clickjacking protection', () => {
    const csp = middleware.generateCSPHeader()

    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('should not add CSP when disabled', () => {
    const disabledMiddleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: false,
    })
    const response = createMockResponse({})
    const securedResponse = disabledMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('Content-Security-Policy')).toBe(false)
  })

  it('should use Report-Only header when configured', () => {
    const reportOnlyMiddleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'default-src': ["'self'"],
      },
      cspReportOnly: true,
    })
    const response = createMockResponse({})
    const securedResponse = reportOnlyMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('Content-Security-Policy-Report-Only')).toBe(true)
    expect(securedResponse.headers.has('Content-Security-Policy')).toBe(false)
  })

  it('should support report-uri directive', () => {
    const reportingMiddleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'report-uri': '/csp-report',
      },
    })
    const csp = reportingMiddleware.generateCSPHeader()

    expect(csp).toContain('report-uri /csp-report')
  })

  it('should support upgrade-insecure-requests directive', () => {
    const httpsMiddleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'upgrade-insecure-requests': true,
      },
    })
    const csp = httpsMiddleware.generateCSPHeader()

    expect(csp).toContain('upgrade-insecure-requests')
  })
})

// =============================================================================
// RED Tests: CSP Generation
// =============================================================================

describe('Security Headers - CSP Header Generation', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
  })

  it('should format CSP directives correctly', () => {
    const middleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'script-src': ["'self'", 'https://cdn.example.com'],
      },
    })
    const csp = middleware.generateCSPHeader()

    // Directives should be separated by semicolons
    expect(csp).toMatch(/default-src 'self';\s*script-src 'self' https:\/\/cdn\.example\.com/)
  })

  it('should handle multiple values per directive', () => {
    const middleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'script-src': ["'self'", "'unsafe-inline'", 'https://example.com', 'https://cdn.example.com'],
      },
    })
    const csp = middleware.generateCSPHeader()

    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://example.com https://cdn.example.com")
  })

  it('should handle boolean directives', () => {
    const middleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'upgrade-insecure-requests': true,
        'block-all-mixed-content': true,
      },
    })
    const csp = middleware.generateCSPHeader()

    expect(csp).toContain('upgrade-insecure-requests')
    expect(csp).toContain('block-all-mixed-content')
  })

  it('should not include disabled boolean directives', () => {
    const middleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'upgrade-insecure-requests': false,
      },
    })
    const csp = middleware.generateCSPHeader()

    expect(csp).not.toContain('upgrade-insecure-requests')
  })
})

// =============================================================================
// RED Tests: X-XSS-Protection Header
// =============================================================================

describe('Security Headers - X-XSS-Protection', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware
  let middleware: SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
    middleware = createSecurityHeadersMiddleware()
  })

  it('should add X-XSS-Protection: 1; mode=block by default', () => {
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-XSS-Protection')).toBe('1; mode=block')
  })

  it('should not add X-XSS-Protection when disabled', () => {
    const disabledMiddleware = createSecurityHeadersMiddleware({
      xssProtection: false,
    })
    const response = createMockResponse({})
    const securedResponse = disabledMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('X-XSS-Protection')).toBe(false)
  })
})

// =============================================================================
// RED Tests: Referrer-Policy Header
// =============================================================================

describe('Security Headers - Referrer-Policy', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware
  let middleware: SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
    middleware = createSecurityHeadersMiddleware()
  })

  it('should add Referrer-Policy: strict-origin-when-cross-origin by default', () => {
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('should add custom Referrer-Policy when configured', () => {
    const noReferrerMiddleware = createSecurityHeadersMiddleware({
      referrerPolicy: 'no-referrer',
    })
    const response = createMockResponse({})
    const securedResponse = noReferrerMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('should support all valid Referrer-Policy values', () => {
    const policies: ReferrerPolicy[] = [
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url',
    ]

    for (const policy of policies) {
      const policyMiddleware = createSecurityHeadersMiddleware({
        referrerPolicy: policy,
      })
      const response = createMockResponse({})
      const securedResponse = policyMiddleware.addSecurityHeaders(response)

      expect(securedResponse.headers.get('Referrer-Policy')).toBe(policy)
    }
  })

  it('should not add Referrer-Policy when disabled', () => {
    const disabledMiddleware = createSecurityHeadersMiddleware({
      referrerPolicy: false,
    })
    const response = createMockResponse({})
    const securedResponse = disabledMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('Referrer-Policy')).toBe(false)
  })
})

// =============================================================================
// RED Tests: Permissions-Policy Header
// =============================================================================

describe('Security Headers - Permissions-Policy', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
  })

  it('should add Permissions-Policy header when configured', () => {
    const middleware = createSecurityHeadersMiddleware({
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: ['self'],
      },
    })
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('Permissions-Policy')).toBe(true)
  })

  it('should format Permissions-Policy correctly', () => {
    const middleware = createSecurityHeadersMiddleware({
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: ['self'],
      },
    })
    const policy = middleware.generatePermissionsPolicyHeader()

    expect(policy).toContain('camera=()')
    expect(policy).toContain('microphone=()')
    expect(policy).toContain('geolocation=(self)')
  })

  it('should support multiple origins in Permissions-Policy', () => {
    const middleware = createSecurityHeadersMiddleware({
      permissionsPolicy: {
        payment: ['self', 'https://payment.example.com'],
      },
    })
    const policy = middleware.generatePermissionsPolicyHeader()

    expect(policy).toContain('payment=(self "https://payment.example.com")')
  })

  it('should not add Permissions-Policy when disabled', () => {
    const disabledMiddleware = createSecurityHeadersMiddleware({
      permissionsPolicy: false,
    })
    const response = createMockResponse({})
    const securedResponse = disabledMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('Permissions-Policy')).toBe(false)
  })
})

// =============================================================================
// RED Tests: HSTS Header
// =============================================================================

describe('Security Headers - Strict-Transport-Security (HSTS)', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
  })

  it('should add Strict-Transport-Security header when configured', () => {
    const middleware = createSecurityHeadersMiddleware({
      hsts: {
        maxAge: 31536000,
      },
    })
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
  })

  it('should include includeSubDomains when configured', () => {
    const middleware = createSecurityHeadersMiddleware({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
    })
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Strict-Transport-Security')).toContain('includeSubDomains')
  })

  it('should include preload when configured', () => {
    const middleware = createSecurityHeadersMiddleware({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Strict-Transport-Security')).toContain('preload')
  })

  it('should not add HSTS when disabled', () => {
    const disabledMiddleware = createSecurityHeadersMiddleware({
      hsts: false,
    })
    const response = createMockResponse({})
    const securedResponse = disabledMiddleware.addSecurityHeaders(response)

    expect(securedResponse.headers.has('Strict-Transport-Security')).toBe(false)
  })
})

// =============================================================================
// RED Tests: Cross-Origin Headers
// =============================================================================

describe('Security Headers - Cross-Origin Policies', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
  })

  it('should add Cross-Origin-Opener-Policy when configured', () => {
    const middleware = createSecurityHeadersMiddleware({
      coopPolicy: 'same-origin',
    })
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
  })

  it('should add Cross-Origin-Embedder-Policy when configured', () => {
    const middleware = createSecurityHeadersMiddleware({
      coepPolicy: 'require-corp',
    })
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
  })

  it('should add Cross-Origin-Resource-Policy when configured', () => {
    const middleware = createSecurityHeadersMiddleware({
      corpPolicy: 'same-origin',
    })
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
  })

  it('should support all COOP policy values', () => {
    const policies = ['same-origin', 'same-origin-allow-popups', 'unsafe-none'] as const

    for (const policy of policies) {
      const middleware = createSecurityHeadersMiddleware({
        coopPolicy: policy,
      })
      const response = createMockResponse({})
      const securedResponse = middleware.addSecurityHeaders(response)

      expect(securedResponse.headers.get('Cross-Origin-Opener-Policy')).toBe(policy)
    }
  })

  it('should support all COEP policy values', () => {
    const policies = ['require-corp', 'credentialless', 'unsafe-none'] as const

    for (const policy of policies) {
      const middleware = createSecurityHeadersMiddleware({
        coepPolicy: policy,
      })
      const response = createMockResponse({})
      const securedResponse = middleware.addSecurityHeaders(response)

      expect(securedResponse.headers.get('Cross-Origin-Embedder-Policy')).toBe(policy)
    }
  })
})

// =============================================================================
// RED Tests: Response Preservation
// =============================================================================

describe('Security Headers - Response Preservation', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware
  let middleware: SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
    middleware = createSecurityHeadersMiddleware()
  })

  it('should preserve response status code', () => {
    const response = createMockResponse({ status: 404 })
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.status).toBe(404)
  })

  it('should preserve response body', async () => {
    const response = createMockResponse({
      body: JSON.stringify({ message: 'Hello' }),
    })
    const securedResponse = middleware.addSecurityHeaders(response)
    const body = await securedResponse.text()

    expect(body).toBe(JSON.stringify({ message: 'Hello' }))
  })

  it('should preserve existing headers', () => {
    const response = createMockResponse({
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Custom-Header': 'custom-value',
      },
    })
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('Content-Type')).toBe('application/json')
    expect(securedResponse.headers.get('Cache-Control')).toBe('no-cache')
    expect(securedResponse.headers.get('X-Custom-Header')).toBe('custom-value')
  })

  it('should not overwrite existing security headers', () => {
    const response = createMockResponse({
      headers: {
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "default-src 'none'",
      },
    })
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(securedResponse.headers.get('Content-Security-Policy')).toBe("default-src 'none'")
  })
})

// =============================================================================
// RED Tests: Preset Configurations
// =============================================================================

describe('Security Headers - Preset Configurations', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware
  let getSecurePreset: () => SecurityHeadersConfig
  let getApiPreset: () => SecurityHeadersConfig
  let getRelaxedPreset: () => SecurityHeadersConfig

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
    getSecurePreset = module.getSecurePreset
    getApiPreset = module.getApiPreset
    getRelaxedPreset = module.getRelaxedPreset
  })

  it('should export secure preset with strict security headers', () => {
    const preset = getSecurePreset()
    const middleware = createSecurityHeadersMiddleware(preset)
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-Frame-Options')).toBe('DENY')
    expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(securedResponse.headers.has('Content-Security-Policy')).toBe(true)
  })

  it('should export API preset optimized for API responses', () => {
    const preset = getApiPreset()
    const middleware = createSecurityHeadersMiddleware(preset)
    const response = createMockResponse({})
    const securedResponse = middleware.addSecurityHeaders(response)

    // APIs typically don't need frame protection but do need content type protection
    expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('should export relaxed preset for development', () => {
    const preset = getRelaxedPreset()

    // Relaxed preset should have less restrictive settings
    expect(preset.contentSecurityPolicy === false || preset.cspReportOnly === true).toBe(true)
  })
})

// =============================================================================
// RED Tests: Edge Cases and Error Handling
// =============================================================================

describe('Security Headers - Edge Cases', () => {
  let createSecurityHeadersMiddleware: (config?: SecurityHeadersConfig) => SecurityHeadersMiddleware

  beforeAll(async () => {
    const module = await import('../../src/middleware/security-headers.js')
    createSecurityHeadersMiddleware = module.createSecurityHeadersMiddleware
  })

  it('should handle empty CSP configuration', () => {
    const middleware = createSecurityHeadersMiddleware({
      contentSecurityPolicy: {},
    })
    const csp = middleware.generateCSPHeader()

    expect(csp).toBe('')
  })

  it('should handle empty Permissions-Policy configuration', () => {
    const middleware = createSecurityHeadersMiddleware({
      permissionsPolicy: {},
    })
    const policy = middleware.generatePermissionsPolicyHeader()

    expect(policy).toBe('')
  })

  it('should handle null/undefined response body', () => {
    const middleware = createSecurityHeadersMiddleware()
    const response = createMockResponse({ body: null })
    const securedResponse = middleware.addSecurityHeaders(response)

    expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('should handle various response status codes', () => {
    const middleware = createSecurityHeadersMiddleware()
    const statusCodes = [200, 201, 204, 301, 400, 401, 403, 404, 500]

    for (const status of statusCodes) {
      const response = createMockResponse({ status })
      const securedResponse = middleware.addSecurityHeaders(response)

      expect(securedResponse.status).toBe(status)
      expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    }
  })
})

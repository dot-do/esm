/**
 * Middleware Module
 *
 * Provides middleware utilities for the ESM module system including:
 * - Middleware chaining and composition
 * - CORS handling
 * - Authentication
 * - Security headers
 * - Prometheus metrics collection
 * - OpenTelemetry distributed tracing
 */

// Chain utilities
export {
  type Context,
  type Handler,
  type Middleware,
  applyMiddleware,
  compose,
} from './chain.js'

// CORS middleware
export {
  type CorsConfig,
  type CorsMiddleware,
  createCorsMiddleware,
} from './cors.js'

// Authentication middleware
export {
  type AuthConfig,
  type AuthUser,
  type AuthResult,
  type AuthMiddleware,
  createAuthMiddleware,
} from './auth.js'

// Security headers middleware
export {
  type CSPDirective,
  type ContentSecurityPolicy,
  type XFrameOptions,
  type ReferrerPolicy,
  type SecurityHeadersConfig,
  type SecurityHeadersMiddleware,
  createSecurityHeadersMiddleware,
  getSecurePreset,
  getApiPreset,
  getRelaxedPreset,
} from './security-headers.js'

// Metrics middleware (Prometheus)
export {
  type MetricsConfig,
  type Counter,
  type Gauge,
  type Histogram,
  type MetricsRegistry,
  type MetricsMiddleware,
  createMetricsMiddleware,
  createMetricsHandler,
} from './metrics.js'

// Tracing middleware (OpenTelemetry)
export {
  type TracingConfig,
  type SpanContext,
  type Span,
  type SpanEvent,
  type SpanStatus,
  type TracingMiddleware,
  type StartSpanOptions,
  createTracingMiddleware,
  createSpanContext,
  isValidSpanContext,
  isSampled,
} from './tracing.js'

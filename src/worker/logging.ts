/**
 * Logging Middleware
 *
 * This module implements request/response logging with:
 * - Unique request ID generation
 * - Request details logging (method, path, headers)
 * - Response details logging (status, duration, size)
 * - Structured JSON logging support
 * - Configurable log levels
 * - Error handling that doesn't break the request pipeline
 */

import type { Middleware, MiddlewareContext } from './middleware.js'

// =============================================================================
// Types
// =============================================================================

/**
 * Log levels from least to most verbose
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/**
 * Structured log entry
 */
export interface LogEntry {
  requestId: string
  method: string
  path: string
  query?: string
  status: number
  duration: number
  timestamp: string
  level: LogLevel
  contentType?: string
  userAgent?: string
  contentLength?: number
  headers?: Record<string, string>
  error?: string
  stack?: string
}

/**
 * Logger configuration
 */
export interface LoggingConfig {
  /** Log output format */
  format: 'json' | 'text'
  /** Callback for log entries */
  onLog?: (entry: LogEntry) => void | Promise<void>
  /** Minimum log level to output */
  level?: LogLevel
  /** Timestamp format */
  timestampFormat?: 'iso' | 'unix'
  /** Enable async logging (non-blocking) */
  async?: boolean
}

/**
 * Request logger instance
 */
export interface RequestLogger {
  config: LoggingConfig
  log: (entry: LogEntry) => void
}

/**
 * Logging middleware options
 */
export interface LoggingMiddlewareOptions {
  /** Custom logger instance */
  logger?: RequestLogger
  /** Log user agent header */
  logUserAgent?: boolean
  /** Log content length */
  logContentLength?: boolean
  /** Custom log prefix for text format */
  prefix?: string
  /** Paths to skip logging */
  skip?: (string | RegExp)[]
}

/**
 * Extended context with logging properties
 */
interface LoggingContext extends MiddlewareContext {
  request: Request
  response?: Response
  requestId?: string
  startTime?: number
}

// =============================================================================
// Constants
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern environments)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback implementation for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Get log level based on HTTP status code
 */
function getLogLevelFromStatus(status: number): LogLevel {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'info'
}

/**
 * Check if a path should be skipped
 */
function shouldSkipPath(path: string, skip: (string | RegExp)[]): boolean {
  for (const pattern of skip) {
    if (typeof pattern === 'string') {
      if (path === pattern) return true
    } else if (pattern.test(path)) {
      return true
    }
  }
  return false
}

/**
 * Check if log level should be output
 */
function shouldLog(entryLevel: LogLevel, configLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[entryLevel] <= LOG_LEVEL_PRIORITY[configLevel]
}

/**
 * Format timestamp based on config
 */
function formatTimestamp(format?: 'iso' | 'unix'): string {
  const now = new Date()
  if (format === 'unix') {
    return String(now.getTime())
  }
  return now.toISOString()
}

// =============================================================================
// Request Logger Factory
// =============================================================================

/**
 * Create a request logger instance
 */
export function createRequestLogger(config: LoggingConfig): RequestLogger {
  return {
    config,
    log: (entry: LogEntry) => {
      const effectiveLevel = config.level || 'info'

      // Check if this entry's level meets the threshold
      if (!shouldLog(entry.level, effectiveLevel)) {
        return
      }

      // Call the onLog callback if provided
      if (config.onLog) {
        if (config.async) {
          // Fire and forget for async logging
          Promise.resolve(config.onLog(entry)).catch(() => {
            // Silently ignore errors in async logging
          })
        } else {
          try {
            config.onLog(entry)
          } catch {
            // Silently ignore errors in logging
          }
        }
      }
    },
  }
}

// =============================================================================
// Logging Middleware
// =============================================================================

/**
 * Create a logging middleware
 */
export function loggingMiddleware(options: LoggingMiddlewareOptions = {}): Middleware<LoggingContext> {
  const { logger, logUserAgent = false, logContentLength = false, prefix, skip = [] } = options

  return async (ctx: LoggingContext, next: () => Promise<void>): Promise<void> => {
    // Extract or generate request ID
    const existingId = ctx.request.headers.get('X-Request-Id')
    const requestId = existingId || generateUUID()
    ctx.requestId = requestId

    // Get URL info
    const url = new URL(ctx.request.url)
    const path = url.pathname
    const query = url.search ? url.search.slice(1) : undefined

    // Check if path should be skipped
    if (shouldSkipPath(path, skip)) {
      // Still set request ID but don't log
      await executeNext(ctx, next, requestId)
      return
    }

    // Record start time
    const startTime = performance.now()
    ctx.startTime = startTime

    // Track if an error occurred
    let error: Error | undefined

    try {
      await next()
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
      throw err // Re-throw after logging
    } finally {
      // Calculate duration
      const duration = performance.now() - startTime

      // Get response info
      const status = ctx.response?.status ?? (error ? 500 : 200)
      const level = error ? 'error' : getLogLevelFromStatus(status)

      // Build log entry
      const entry: LogEntry = {
        requestId,
        method: ctx.request.method,
        path,
        status,
        duration,
        timestamp: formatTimestamp(logger?.config.timestampFormat),
        level,
      }

      if (query) {
        entry.query = query
      }

      // Add optional fields
      const contentType = ctx.request.headers.get('Content-Type')
      if (contentType) {
        entry.contentType = contentType
      }

      if (logUserAgent) {
        const userAgent = ctx.request.headers.get('User-Agent')
        if (userAgent) {
          entry.userAgent = userAgent
        }
      }

      if (logContentLength && ctx.response) {
        const contentLength = ctx.response.headers.get('Content-Length')
        if (contentLength) {
          entry.contentLength = parseInt(contentLength, 10)
        }
      }

      // Add headers in debug mode
      if (logger?.config.level === 'debug') {
        const headers: Record<string, string> = {}
        ctx.request.headers.forEach((value, key) => {
          headers[key] = value
        })
        entry.headers = headers
      }

      // Add error info
      if (error) {
        entry.error = error.message
        if (logger?.config.level === 'debug' && error.stack) {
          entry.stack = error.stack
        }
      }

      // Log using custom logger or console
      if (logger) {
        try {
          logger.log(entry)
        } catch {
          // Silently ignore logger errors
        }
      } else {
        // Default console logging
        try {
          const logMessage = formatLogMessage(entry, prefix, logUserAgent)
          console.log(logMessage)
        } catch {
          // Silently ignore console errors
        }
      }

      // Attach request ID to response if present
      if (ctx.response && !error) {
        attachRequestIdHeader(ctx, requestId)
      }
    }
  }
}

/**
 * Execute the next middleware and attach request ID header to response
 */
async function executeNext(
  ctx: LoggingContext,
  next: () => Promise<void>,
  requestId: string
): Promise<void> {
  await next()
  if (ctx.response) {
    attachRequestIdHeader(ctx, requestId)
  }
}

/**
 * Attach request ID header to response
 */
function attachRequestIdHeader(ctx: LoggingContext, requestId: string): void {
  if (ctx.response) {
    // Clone the response with the new header
    const newHeaders = new Headers(ctx.response.headers)
    newHeaders.set('X-Request-Id', requestId)
    ctx.response = new Response(ctx.response.body, {
      status: ctx.response.status,
      statusText: ctx.response.statusText,
      headers: newHeaders,
    })
  }
}

/**
 * Format a log message for console output
 */
function formatLogMessage(entry: LogEntry, prefix?: string, logUserAgent?: boolean): string {
  const parts: string[] = []

  if (prefix) {
    parts.push(prefix)
  }

  parts.push(`[${entry.requestId}]`)
  parts.push(entry.method)
  parts.push(entry.path)
  parts.push(String(entry.status))
  parts.push(`${Math.round(entry.duration)}ms`)

  if (entry.contentLength !== undefined) {
    parts.push(`${entry.contentLength}`)
  }

  if (logUserAgent && entry.userAgent) {
    parts.push(entry.userAgent)
  }

  if (entry.error) {
    parts.push(`Error: ${entry.error}`)
  }

  return parts.join(' ')
}

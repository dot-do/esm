/**
 * RED Tests for Logging Middleware
 *
 * Issue: esm-arch.6 - Test request/response logging with request ID
 *
 * These tests verify that the logging middleware correctly:
 * - Generates unique request IDs for each request
 * - Logs request details (method, path, headers)
 * - Logs response details (status, duration, size)
 * - Attaches request ID to response headers
 * - Supports structured logging format
 * - Handles errors gracefully without breaking the request pipeline
 *
 * These tests are designed to FAIL until the logging middleware is implemented
 * in src/worker/logging.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// This import should fail until the logging middleware module is created
import {
  loggingMiddleware,
  createRequestLogger,
  type LogLevel,
  type LogEntry,
  type LoggingConfig,
  type RequestLogger,
} from '../../src/worker/logging.js'

import type { Middleware, MiddlewareContext } from '../../src/worker/middleware.js'

// =============================================================================
// Helper Types for Testing
// =============================================================================

interface TestContext extends MiddlewareContext {
  request: Request
  response?: Response
  state: Record<string, unknown>
  requestId?: string
  startTime?: number
}

// =============================================================================
// Request ID Generation Tests
// =============================================================================
describe('Request ID Generation', () => {
  it('should export loggingMiddleware function', () => {
    expect(typeof loggingMiddleware).toBe('function')
  })

  it('should export createRequestLogger function', () => {
    expect(typeof createRequestLogger).toBe('function')
  })

  it('should generate a unique request ID for each request', async () => {
    const middleware = loggingMiddleware()
    const ids: string[] = []

    for (let i = 0; i < 10; i++) {
      const ctx: TestContext = {
        request: new Request('https://example.com/test'),
        state: {},
      }

      await middleware(ctx, async () => {})
      ids.push(ctx.requestId!)
    }

    // All IDs should be unique
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(10)
  })

  it('should generate request ID in UUID format', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {})

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(ctx.requestId).toMatch(uuidRegex)
  })

  it('should use existing request ID from X-Request-Id header if present', async () => {
    const middleware = loggingMiddleware()
    const existingId = 'existing-request-id-12345'
    const ctx: TestContext = {
      request: new Request('https://example.com/test', {
        headers: { 'X-Request-Id': existingId },
      }),
      state: {},
    }

    await middleware(ctx, async () => {})

    expect(ctx.requestId).toBe(existingId)
  })

  it('should attach request ID to response headers', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    expect(ctx.response?.headers.get('X-Request-Id')).toBe(ctx.requestId)
  })
})

// =============================================================================
// Request Logging Tests
// =============================================================================
describe('Request Logging', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('should log request method and path', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/api/modules/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('GET')
    expect(logCalls).toContain('/api/modules/test')
  })

  it('should log POST requests correctly', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/api/modules', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      }),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('Created', { status: 201 })
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('POST')
    expect(logCalls).toContain('/api/modules')
  })

  it('should include request ID in log output', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain(ctx.requestId!)
  })

  it('should log user agent when available', async () => {
    const middleware = loggingMiddleware({ logUserAgent: true })
    const ctx: TestContext = {
      request: new Request('https://example.com/test', {
        headers: { 'User-Agent': 'TestClient/1.0' },
      }),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('TestClient/1.0')
  })
})

// =============================================================================
// Response Logging Tests
// =============================================================================
describe('Response Logging', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('should log response status code', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK', { status: 200 })
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('200')
  })

  it('should log 404 status for not found', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/not-found'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('Not Found', { status: 404 })
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('404')
  })

  it('should log 500 status for server errors', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/error'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('Internal Server Error', { status: 500 })
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('500')
  })

  it('should log request duration in milliseconds', async () => {
    const middleware = loggingMiddleware()
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10))
      ctx.response = new Response('OK')
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    // Should contain duration in ms format like "15ms" or "(15ms)"
    expect(logCalls).toMatch(/\d+\s*ms/)
  })

  it('should log response content length when available', async () => {
    const middleware = loggingMiddleware({ logContentLength: true })
    const body = 'Hello, World!'
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response(body, {
        headers: { 'Content-Length': body.length.toString() },
      })
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('13') // Length of "Hello, World!"
  })
})

// =============================================================================
// Structured Logging Tests
// =============================================================================
describe('Structured Logging', () => {
  it('should support JSON log format', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    expect(logs.length).toBeGreaterThan(0)
    const logEntry = logs[0]
    expect(logEntry).toHaveProperty('requestId')
    expect(logEntry).toHaveProperty('method')
    expect(logEntry).toHaveProperty('path')
    expect(logEntry).toHaveProperty('status')
    expect(logEntry).toHaveProperty('duration')
    expect(logEntry).toHaveProperty('timestamp')
  })

  it('should include all request details in structured log', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/api/test?foo=bar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TestClient/1.0',
        },
      }),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('Created', { status: 201 })
    })

    const logEntry = logs[0]
    expect(logEntry.method).toBe('POST')
    expect(logEntry.path).toBe('/api/test')
    expect(logEntry.query).toBe('foo=bar')
    expect(logEntry.status).toBe(201)
    expect(logEntry.contentType).toBe('application/json')
  })

  it('should support different log levels', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
      level: 'debug',
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    // Debug level should include more details
    const logEntry = logs[0]
    expect(logEntry).toHaveProperty('headers')
    expect(logEntry.level).toBe('info') // Request logs are info level
  })

  it('should log errors at error level', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('Internal Server Error', { status: 500 })
    })

    const logEntry = logs[0]
    expect(logEntry.level).toBe('error')
  })

  it('should categorize log levels by status code', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const middleware = loggingMiddleware({ logger })

    // Test 2xx - should be info
    const ctx200: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }
    await middleware(ctx200, async () => {
      ctx200.response = new Response('OK', { status: 200 })
    })

    // Test 4xx - should be warn
    const ctx404: TestContext = {
      request: new Request('https://example.com/not-found'),
      state: {},
    }
    await middleware(ctx404, async () => {
      ctx404.response = new Response('Not Found', { status: 404 })
    })

    // Test 5xx - should be error
    const ctx500: TestContext = {
      request: new Request('https://example.com/error'),
      state: {},
    }
    await middleware(ctx500, async () => {
      ctx500.response = new Response('Error', { status: 500 })
    })

    expect(logs[0].level).toBe('info')
    expect(logs[1].level).toBe('warn')
    expect(logs[2].level).toBe('error')
  })
})

// =============================================================================
// Error Handling in Logging Tests
// =============================================================================
describe('Logging Error Handling', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('should not break request pipeline when logger throws', async () => {
    const brokenLogger = createRequestLogger({
      format: 'json',
      onLog: () => {
        throw new Error('Logger is broken')
      },
    })

    const middleware = loggingMiddleware({ logger: brokenLogger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    // Should not throw despite broken logger
    await expect(
      middleware(ctx, async () => {
        ctx.response = new Response('OK')
      })
    ).resolves.toBeUndefined()

    // Response should still be set correctly
    expect(ctx.response?.status).toBe(200)
  })

  it('should log errors that occur during request handling', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    const error = new Error('Handler error')

    await expect(
      middleware(ctx, async () => {
        throw error
      })
    ).rejects.toThrow('Handler error')

    // Should still log the request with error information
    expect(logs.length).toBeGreaterThan(0)
    const logEntry = logs[0]
    expect(logEntry.error).toBe('Handler error')
    expect(logEntry.level).toBe('error')
  })

  it('should capture error stack trace in debug mode', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
      level: 'debug',
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    try {
      await middleware(ctx, async () => {
        throw new Error('Debug error')
      })
    } catch {
      // Expected to throw
    }

    const logEntry = logs[0]
    expect(logEntry.stack).toBeDefined()
    expect(logEntry.stack).toContain('Debug error')
  })
})

// =============================================================================
// Configuration Tests
// =============================================================================
describe('Logging Configuration', () => {
  it('should support skip patterns to exclude certain paths', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const middleware = loggingMiddleware({
      logger,
      skip: ['/health', '/metrics', /^\/internal\//],
    })

    // These should be skipped
    const healthCtx: TestContext = {
      request: new Request('https://example.com/health'),
      state: {},
    }
    await middleware(healthCtx, async () => {
      healthCtx.response = new Response('OK')
    })

    const metricsCtx: TestContext = {
      request: new Request('https://example.com/metrics'),
      state: {},
    }
    await middleware(metricsCtx, async () => {
      metricsCtx.response = new Response('OK')
    })

    const internalCtx: TestContext = {
      request: new Request('https://example.com/internal/debug'),
      state: {},
    }
    await middleware(internalCtx, async () => {
      internalCtx.response = new Response('OK')
    })

    // This should be logged
    const apiCtx: TestContext = {
      request: new Request('https://example.com/api/modules'),
      state: {},
    }
    await middleware(apiCtx, async () => {
      apiCtx.response = new Response('OK')
    })

    expect(logs.length).toBe(1)
    expect(logs[0].path).toBe('/api/modules')
  })

  it('should support custom timestamp format', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
      timestampFormat: 'iso',
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    // ISO format: 2024-01-15T10:30:00.000Z
    expect(logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('should support custom log prefix', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const middleware = loggingMiddleware({
      prefix: '[ESM-API]',
    })

    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })

    const logCalls = consoleSpy.mock.calls.flat().join(' ')
    expect(logCalls).toContain('[ESM-API]')

    consoleSpy.mockRestore()
  })

  it('should respect log level filtering', async () => {
    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
      level: 'warn', // Only log warn and error
    })

    const middleware = loggingMiddleware({ logger })

    // 200 OK - should NOT be logged (info level)
    const ctx200: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }
    await middleware(ctx200, async () => {
      ctx200.response = new Response('OK', { status: 200 })
    })

    // 404 Not Found - should be logged (warn level)
    const ctx404: TestContext = {
      request: new Request('https://example.com/not-found'),
      state: {},
    }
    await middleware(ctx404, async () => {
      ctx404.response = new Response('Not Found', { status: 404 })
    })

    expect(logs.length).toBe(1)
    expect(logs[0].status).toBe(404)
  })
})

// =============================================================================
// Performance Tests
// =============================================================================
describe('Logging Performance', () => {
  it('should add minimal overhead to request processing', async () => {
    const middleware = loggingMiddleware()

    const iterations = 100
    const durations: number[] = []

    for (let i = 0; i < iterations; i++) {
      const ctx: TestContext = {
        request: new Request('https://example.com/test'),
        state: {},
      }

      const start = performance.now()
      await middleware(ctx, async () => {
        ctx.response = new Response('OK')
      })
      durations.push(performance.now() - start)
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / iterations
    // Logging middleware should add less than 1ms overhead on average
    expect(avgDuration).toBeLessThan(1)
  })

  it('should support async logging without blocking response', async () => {
    let logComplete = false
    const logger = createRequestLogger({
      format: 'json',
      onLog: async () => {
        // Simulate slow async logging
        await new Promise((resolve) => setTimeout(resolve, 50))
        logComplete = true
      },
      async: true, // Enable async logging
    })

    const middleware = loggingMiddleware({ logger })
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    const start = performance.now()
    await middleware(ctx, async () => {
      ctx.response = new Response('OK')
    })
    const duration = performance.now() - start

    // Response should return before async logging completes
    expect(duration).toBeLessThan(50)
    expect(logComplete).toBe(false)
  })
})

// =============================================================================
// Integration with Middleware Pipeline Tests
// =============================================================================
describe('Logging Middleware Pipeline Integration', () => {
  it('should work with compose function', async () => {
    // This test requires the middleware composer from esm-arch.4
    // Import is expected to fail until that's implemented
    const { compose } = await import('../../src/worker/middleware.js')

    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const logging = loggingMiddleware({ logger })
    const handler: Middleware<TestContext> = async (ctx, next) => {
      ctx.response = new Response('Hello, World!')
      await next()
    }

    const pipeline = compose([logging, handler])
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await pipeline(ctx)

    expect(ctx.response?.status).toBe(200)
    expect(logs.length).toBe(1)
    expect(logs[0].status).toBe(200)
  })

  it('should capture timing for entire middleware chain', async () => {
    const { compose } = await import('../../src/worker/middleware.js')

    const logs: LogEntry[] = []
    const logger = createRequestLogger({
      format: 'json',
      onLog: (entry) => logs.push(entry),
    })

    const logging = loggingMiddleware({ logger })
    const slowMiddleware: Middleware<TestContext> = async (ctx, next) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      await next()
    }
    const handler: Middleware<TestContext> = async (ctx, next) => {
      ctx.response = new Response('OK')
      await next()
    }

    const pipeline = compose([logging, slowMiddleware, handler])
    const ctx: TestContext = {
      request: new Request('https://example.com/test'),
      state: {},
    }

    await pipeline(ctx)

    // Duration should include the slow middleware time
    expect(logs[0].duration).toBeGreaterThanOrEqual(20)
  })
})

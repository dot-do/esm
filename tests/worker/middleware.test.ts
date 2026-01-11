/**
 * RED Tests for Middleware Pipeline
 *
 * Issue: esm-arch.4 - Test compose([m1,m2]) runs in order
 *
 * These tests verify that the middleware pipeline composer correctly:
 * - Composes multiple middleware functions into a single pipeline
 * - Executes middleware in the correct order (left to right)
 * - Passes context through the middleware chain
 * - Supports async middleware
 * - Handles early termination/short-circuiting
 * - Properly propagates errors
 *
 * These tests are designed to FAIL until the middleware composer is implemented
 * in src/worker/middleware.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// This import should fail until the middleware module is created
import {
  compose,
  type Middleware,
  type MiddlewareContext,
  type MiddlewareNext,
} from '../../src/worker/middleware.js'

// =============================================================================
// Helper Types for Testing
// =============================================================================

interface TestContext extends MiddlewareContext {
  request: Request
  response?: Response
  state: Record<string, unknown>
  executionOrder: string[]
}

// =============================================================================
// Basic Composition Tests
// =============================================================================
describe('Middleware Pipeline Composition', () => {
  it('should export compose function', () => {
    expect(typeof compose).toBe('function')
  })

  it('should export Middleware type', () => {
    // Type test - this compiles if the type exists
    const middleware: Middleware<TestContext> = async (ctx, next) => {
      await next()
    }
    expect(middleware).toBeDefined()
  })

  it('should return a function when composing middleware', () => {
    const m1: Middleware<TestContext> = async (ctx, next) => await next()
    const composed = compose([m1])
    expect(typeof composed).toBe('function')
  })

  it('should handle empty middleware array', async () => {
    const composed = compose<TestContext>([])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)
    // Should complete without error
    expect(ctx.executionOrder).toEqual([])
  })
})

// =============================================================================
// Execution Order Tests
// =============================================================================
describe('Middleware Execution Order', () => {
  it('should execute middleware in order (m1 before m2)', async () => {
    const m1: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m1-before')
      await next()
      ctx.executionOrder.push('m1-after')
    }

    const m2: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m2-before')
      await next()
      ctx.executionOrder.push('m2-after')
    }

    const composed = compose([m1, m2])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.executionOrder).toEqual([
      'm1-before',
      'm2-before',
      'm2-after',
      'm1-after',
    ])
  })

  it('should execute three middleware in correct order', async () => {
    const m1: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m1-start')
      await next()
      ctx.executionOrder.push('m1-end')
    }

    const m2: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m2-start')
      await next()
      ctx.executionOrder.push('m2-end')
    }

    const m3: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m3-start')
      await next()
      ctx.executionOrder.push('m3-end')
    }

    const composed = compose([m1, m2, m3])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.executionOrder).toEqual([
      'm1-start',
      'm2-start',
      'm3-start',
      'm3-end',
      'm2-end',
      'm1-end',
    ])
  })

  it('should allow middleware to modify context for downstream', async () => {
    const auth: Middleware<TestContext> = async (ctx, next) => {
      ctx.state.user = { id: 1, name: 'Alice' }
      await next()
    }

    const handler: Middleware<TestContext> = async (ctx, next) => {
      ctx.state.greeting = `Hello, ${(ctx.state.user as { name: string }).name}!`
      await next()
    }

    const composed = compose([auth, handler])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.state.user).toEqual({ id: 1, name: 'Alice' })
    expect(ctx.state.greeting).toBe('Hello, Alice!')
  })
})

// =============================================================================
// Short-Circuit / Early Termination Tests
// =============================================================================
describe('Middleware Short-Circuiting', () => {
  it('should stop chain when middleware does not call next', async () => {
    const m1: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m1-before')
      // Intentionally NOT calling next() - short-circuit
      ctx.response = new Response('Blocked', { status: 403 })
      ctx.executionOrder.push('m1-after')
    }

    const m2: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m2-before')
      await next()
      ctx.executionOrder.push('m2-after')
    }

    const composed = compose([m1, m2])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    // m2 should never be called
    expect(ctx.executionOrder).toEqual(['m1-before', 'm1-after'])
    expect(ctx.response?.status).toBe(403)
  })

  it('should allow conditional middleware execution', async () => {
    const authCheck: Middleware<TestContext> = async (ctx, next) => {
      const token = ctx.request.headers.get('Authorization')
      if (!token) {
        ctx.response = new Response('Unauthorized', { status: 401 })
        return // Short-circuit
      }
      ctx.state.authenticated = true
      await next()
    }

    const handler: Middleware<TestContext> = async (ctx, next) => {
      ctx.state.handled = true
      ctx.response = new Response('OK')
      await next()
    }

    const composed = compose([authCheck, handler])

    // Test without auth
    const ctxNoAuth: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }
    await composed(ctxNoAuth)
    expect(ctxNoAuth.response?.status).toBe(401)
    expect(ctxNoAuth.state.handled).toBeUndefined()

    // Test with auth
    const ctxWithAuth: TestContext = {
      request: new Request('https://example.com', {
        headers: { Authorization: 'Bearer token' },
      }),
      state: {},
      executionOrder: [],
    }
    await composed(ctxWithAuth)
    expect(ctxWithAuth.response?.status).toBe(200)
    expect(ctxWithAuth.state.handled).toBe(true)
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================
describe('Middleware Error Handling', () => {
  it('should propagate errors from middleware', async () => {
    const errorMiddleware: Middleware<TestContext> = async () => {
      throw new Error('Middleware error')
    }

    const composed = compose([errorMiddleware])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await expect(composed(ctx)).rejects.toThrow('Middleware error')
  })

  it('should allow error middleware to catch errors', async () => {
    const errorHandler: Middleware<TestContext> = async (ctx, next) => {
      try {
        await next()
      } catch (error) {
        ctx.state.error = error instanceof Error ? error.message : String(error)
        ctx.response = new Response('Error caught', { status: 500 })
      }
    }

    const errorMiddleware: Middleware<TestContext> = async () => {
      throw new Error('Something went wrong')
    }

    const composed = compose([errorHandler, errorMiddleware])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.state.error).toBe('Something went wrong')
    expect(ctx.response?.status).toBe(500)
  })

  it('should propagate errors through the chain', async () => {
    const outer: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('outer-before')
      await next()
      ctx.executionOrder.push('outer-after')
    }

    const errorMiddleware: Middleware<TestContext> = async () => {
      throw new Error('Inner error')
    }

    const composed = compose([outer, errorMiddleware])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await expect(composed(ctx)).rejects.toThrow('Inner error')
    // outer-before should have run, but outer-after should not
    expect(ctx.executionOrder).toEqual(['outer-before'])
  })
})

// =============================================================================
// Async Middleware Tests
// =============================================================================
describe('Async Middleware Support', () => {
  it('should handle async middleware correctly', async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    const slowMiddleware: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('slow-start')
      await delay(10)
      ctx.executionOrder.push('slow-middle')
      await next()
      ctx.executionOrder.push('slow-end')
    }

    const fastMiddleware: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('fast')
      await next()
    }

    const composed = compose([slowMiddleware, fastMiddleware])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.executionOrder).toEqual([
      'slow-start',
      'slow-middle',
      'fast',
      'slow-end',
    ])
  })

  it('should wait for async operations to complete', async () => {
    const fetchMiddleware: Middleware<TestContext> = async (ctx, next) => {
      // Simulate async operation
      await Promise.resolve()
      ctx.state.fetched = true
      await next()
    }

    const composed = compose([fetchMiddleware])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.state.fetched).toBe(true)
  })
})

// =============================================================================
// Context Mutation Tests
// =============================================================================
describe('Context Mutation', () => {
  it('should share context mutations between middleware', async () => {
    const m1: Middleware<TestContext> = async (ctx, next) => {
      ctx.state.count = 1
      await next()
      expect(ctx.state.count).toBe(3)
    }

    const m2: Middleware<TestContext> = async (ctx, next) => {
      ctx.state.count = (ctx.state.count as number) + 1
      await next()
      expect(ctx.state.count).toBe(3)
    }

    const m3: Middleware<TestContext> = async (ctx, next) => {
      ctx.state.count = (ctx.state.count as number) + 1
      await next()
    }

    const composed = compose([m1, m2, m3])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)
    expect(ctx.state.count).toBe(3)
  })

  it('should allow response modification in reverse order', async () => {
    const logger: Middleware<TestContext> = async (ctx, next) => {
      await next()
      // After response is created, add a header
      if (ctx.response) {
        const newHeaders = new Headers(ctx.response.headers)
        newHeaders.set('X-Logged', 'true')
        ctx.response = new Response(ctx.response.body, {
          status: ctx.response.status,
          headers: newHeaders,
        })
      }
    }

    const handler: Middleware<TestContext> = async (ctx, next) => {
      ctx.response = new Response('Hello', { status: 200 })
      await next()
    }

    const composed = compose([logger, handler])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.response?.headers.get('X-Logged')).toBe('true')
  })
})

// =============================================================================
// Multiple next() Call Prevention Tests
// =============================================================================
describe('Multiple next() Call Prevention', () => {
  it('should throw error if next() is called multiple times', async () => {
    const badMiddleware: Middleware<TestContext> = async (ctx, next) => {
      await next()
      await next() // This should throw
    }

    const composed = compose([badMiddleware])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await expect(composed(ctx)).rejects.toThrow(/next.*called.*multiple|already.*called/)
  })
})

// =============================================================================
// Composability Tests
// =============================================================================
describe('Middleware Composability', () => {
  it('should allow composing composed middleware', async () => {
    const m1: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m1')
      await next()
    }

    const m2: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m2')
      await next()
    }

    const m3: Middleware<TestContext> = async (ctx, next) => {
      ctx.executionOrder.push('m3')
      await next()
    }

    // Compose m1 and m2
    const inner = compose([m1, m2])

    // Convert composed middleware to a regular middleware
    const innerAsMiddleware: Middleware<TestContext> = async (ctx, next) => {
      await inner(ctx)
      await next()
    }

    // Compose with m3
    const outer = compose([innerAsMiddleware, m3])

    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await outer(ctx)

    expect(ctx.executionOrder).toEqual(['m1', 'm2', 'm3'])
  })
})

// =============================================================================
// Real-World Use Case Tests
// =============================================================================
describe('Real-World Middleware Patterns', () => {
  it('should implement request timing middleware', async () => {
    const timing: Middleware<TestContext> = async (ctx, next) => {
      const start = Date.now()
      await next()
      const duration = Date.now() - start
      ctx.state.duration = duration
    }

    const handler: Middleware<TestContext> = async (ctx, next) => {
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 5))
      ctx.response = new Response('OK')
      await next()
    }

    const composed = compose([timing, handler])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(typeof ctx.state.duration).toBe('number')
    expect(ctx.state.duration).toBeGreaterThanOrEqual(0)
  })

  it('should implement CORS middleware', async () => {
    const cors: Middleware<TestContext> = async (ctx, next) => {
      await next()
      if (ctx.response) {
        const newHeaders = new Headers(ctx.response.headers)
        newHeaders.set('Access-Control-Allow-Origin', '*')
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        ctx.response = new Response(ctx.response.body, {
          status: ctx.response.status,
          headers: newHeaders,
        })
      }
    }

    const handler: Middleware<TestContext> = async (ctx, next) => {
      ctx.response = new Response('Hello')
      await next()
    }

    const composed = compose([cors, handler])
    const ctx: TestContext = {
      request: new Request('https://example.com'),
      state: {},
      executionOrder: [],
    }

    await composed(ctx)

    expect(ctx.response?.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should implement rate limiting middleware', async () => {
    const requestCounts = new Map<string, number>()

    const rateLimit: Middleware<TestContext> = async (ctx, next) => {
      const ip = ctx.request.headers.get('X-Forwarded-For') || 'unknown'
      const count = (requestCounts.get(ip) || 0) + 1
      requestCounts.set(ip, count)

      if (count > 3) {
        ctx.response = new Response('Rate limited', { status: 429 })
        return // Short-circuit
      }

      await next()
    }

    const handler: Middleware<TestContext> = async (ctx, next) => {
      ctx.response = new Response('OK')
      await next()
    }

    const composed = compose([rateLimit, handler])

    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      const ctx: TestContext = {
        request: new Request('https://example.com', {
          headers: { 'X-Forwarded-For': '1.2.3.4' },
        }),
        state: {},
        executionOrder: [],
      }
      await composed(ctx)
      expect(ctx.response?.status).toBe(200)
    }

    // 4th request should be rate limited
    const ctx: TestContext = {
      request: new Request('https://example.com', {
        headers: { 'X-Forwarded-For': '1.2.3.4' },
      }),
      state: {},
      executionOrder: [],
    }
    await composed(ctx)
    expect(ctx.response?.status).toBe(429)
  })
})

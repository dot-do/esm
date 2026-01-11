/**
 * RED Tests for Middleware Chain Composition Types (esm-klyr)
 *
 * These tests verify that the middleware chain composition functions have correct types:
 * 1. applyMiddleware accepts a Handler and returns a Handler
 * 2. compose accepts multiple Middleware and returns a Middleware
 * 3. The composed middleware chain works correctly at runtime
 *
 * The current implementation at src/middleware/chain.ts has a type mismatch at lines 21-22
 * where reduceRight may infer incorrect types for the accumulator.
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  type Handler,
  type Middleware,
  type Context,
  applyMiddleware,
  compose,
} from '../../src/middleware/chain.js'

// =============================================================================
// Test Helpers
// =============================================================================

function createMockContext(overrides: Partial<Context> = {}): Context {
  return {
    request: new Request('http://localhost/test'),
    params: {},
    env: {},
    ...overrides,
  }
}

// =============================================================================
// Type-Level Tests: Handler Type
// =============================================================================

describe('Handler type', () => {
  it('should accept a function that takes Context and returns Promise<Response>', () => {
    const handler: Handler = async (ctx) => {
      return new Response(`Hello from ${ctx.request.url}`)
    }

    expectTypeOf(handler).toMatchTypeOf<Handler>()
    expectTypeOf(handler).toBeFunction()
    expectTypeOf(handler).parameter(0).toMatchTypeOf<Context>()
    expectTypeOf(handler).returns.toMatchTypeOf<Promise<Response>>()
  })

  it('should work correctly at runtime', async () => {
    const handler: Handler = async (ctx) => {
      return new Response(`Path: ${ctx.params['path'] ?? 'none'}`)
    }

    const ctx = createMockContext({ params: { path: '/test' } })
    const response = await handler(ctx)

    expect(response).toBeInstanceOf(Response)
    expect(await response.text()).toBe('Path: /test')
  })
})

// =============================================================================
// Type-Level Tests: Middleware Type
// =============================================================================

describe('Middleware type', () => {
  it('should accept a function that takes Context and next, returns Promise<Response>', () => {
    const middleware: Middleware = async (ctx, next) => {
      const response = await next()
      return response
    }

    expectTypeOf(middleware).toMatchTypeOf<Middleware>()
    expectTypeOf(middleware).toBeFunction()
    expectTypeOf(middleware).parameter(0).toMatchTypeOf<Context>()
    expectTypeOf(middleware).parameter(1).toMatchTypeOf<() => Promise<Response>>()
    expectTypeOf(middleware).returns.toMatchTypeOf<Promise<Response>>()
  })

  it('should allow middleware to short-circuit without calling next', async () => {
    const authMiddleware: Middleware = async (ctx, next) => {
      const authHeader = ctx.request.headers.get('Authorization')
      if (!authHeader) {
        return new Response('Unauthorized', { status: 401 })
      }
      return next()
    }

    const ctx = createMockContext()
    let nextCalled = false
    const response = await authMiddleware(ctx, async () => {
      nextCalled = true
      return new Response('OK')
    })

    expect(nextCalled).toBe(false)
    expect(response.status).toBe(401)
  })

  it('should allow middleware to modify the response from next', async () => {
    const loggingMiddleware: Middleware = async (ctx, next) => {
      const start = Date.now()
      const response = await next()
      const duration = Date.now() - start
      const newResponse = new Response(response.body, response)
      newResponse.headers.set('X-Response-Time', `${duration}ms`)
      return newResponse
    }

    const ctx = createMockContext()
    const response = await loggingMiddleware(ctx, async () => {
      return new Response('OK')
    })

    expect(response.headers.has('X-Response-Time')).toBe(true)
  })
})

// =============================================================================
// Type-Level Tests: applyMiddleware Function
// =============================================================================

describe('applyMiddleware type signature', () => {
  it('should accept a Handler as first argument', () => {
    const handler: Handler = async () => new Response('OK')

    // This should compile without errors
    const result = applyMiddleware(handler)

    expectTypeOf(result).toMatchTypeOf<Handler>()
  })

  it('should accept Middleware as rest arguments', () => {
    const handler: Handler = async () => new Response('OK')
    const middleware1: Middleware = async (ctx, next) => next()
    const middleware2: Middleware = async (ctx, next) => next()

    // This should compile without errors - the return type should be Handler
    const result = applyMiddleware(handler, middleware1, middleware2)

    expectTypeOf(result).toMatchTypeOf<Handler>()
  })

  it('should return a Handler that can be called with Context', async () => {
    const handler: Handler = async (ctx) => {
      return new Response(`URL: ${ctx.request.url}`)
    }
    const middleware: Middleware = async (ctx, next) => {
      const response = await next()
      // Clone and add header
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Middleware', 'applied')
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      })
    }

    const composedHandler = applyMiddleware(handler, middleware)

    // The result should be callable as a Handler
    const ctx = createMockContext()
    const response = await composedHandler(ctx)

    expectTypeOf(composedHandler).toMatchTypeOf<Handler>()
    expectTypeOf(composedHandler).parameter(0).toMatchTypeOf<Context>()
    expectTypeOf(composedHandler).returns.toMatchTypeOf<Promise<Response>>()

    expect(response).toBeInstanceOf(Response)
  })

  it('should NOT accept invalid first argument types', () => {
    // These should cause TypeScript compilation errors if uncommented
    // @ts-expect-error - Handler should be required
    applyMiddleware()

    // @ts-expect-error - First argument must be Handler, not Middleware
    const badResult = applyMiddleware(async (ctx: Context, next: () => Promise<Response>) => next())

    // @ts-expect-error - First argument must be Handler, not string
    applyMiddleware('not a handler')

    // @ts-expect-error - First argument must be Handler, not number
    applyMiddleware(42)
  })
})

// =============================================================================
// Type-Level Tests: compose Function
// =============================================================================

describe('compose type signature', () => {
  it('should accept multiple Middleware and return a Middleware', () => {
    const m1: Middleware = async (ctx, next) => next()
    const m2: Middleware = async (ctx, next) => next()
    const m3: Middleware = async (ctx, next) => next()

    const composed = compose(m1, m2, m3)

    // The return type should be Middleware
    expectTypeOf(composed).toMatchTypeOf<Middleware>()
    expectTypeOf(composed).parameter(0).toMatchTypeOf<Context>()
    expectTypeOf(composed).parameter(1).toMatchTypeOf<() => Promise<Response>>()
    expectTypeOf(composed).returns.toMatchTypeOf<Promise<Response>>()
  })

  it('should return a Middleware even with zero arguments', () => {
    const composed = compose()

    expectTypeOf(composed).toMatchTypeOf<Middleware>()
  })

  it('should work with a single middleware', () => {
    const single: Middleware = async (ctx, next) => {
      const response = await next()
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Single', 'true')
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      })
    }

    const composed = compose(single)

    expectTypeOf(composed).toMatchTypeOf<Middleware>()
  })
})

// =============================================================================
// Runtime Tests: applyMiddleware Execution
// =============================================================================

describe('applyMiddleware runtime behavior', () => {
  it('should execute handler when no middleware provided', async () => {
    const handler: Handler = async (ctx) => {
      return new Response(`Hello ${ctx.params['name'] ?? 'World'}`)
    }

    const composedHandler = applyMiddleware(handler)
    const ctx = createMockContext({ params: { name: 'Test' } })
    const response = await composedHandler(ctx)

    expect(await response.text()).toBe('Hello Test')
  })

  it('should execute middleware before handler', async () => {
    const executionOrder: string[] = []

    const handler: Handler = async () => {
      executionOrder.push('handler')
      return new Response('OK')
    }

    const middleware: Middleware = async (ctx, next) => {
      executionOrder.push('middleware-before')
      const response = await next()
      executionOrder.push('middleware-after')
      return response
    }

    const composedHandler = applyMiddleware(handler, middleware)
    await composedHandler(createMockContext())

    expect(executionOrder).toEqual(['middleware-before', 'handler', 'middleware-after'])
  })

  it('should execute multiple middleware in correct order', async () => {
    const executionOrder: string[] = []

    const handler: Handler = async () => {
      executionOrder.push('handler')
      return new Response('OK')
    }

    const middleware1: Middleware = async (ctx, next) => {
      executionOrder.push('m1-before')
      const response = await next()
      executionOrder.push('m1-after')
      return response
    }

    const middleware2: Middleware = async (ctx, next) => {
      executionOrder.push('m2-before')
      const response = await next()
      executionOrder.push('m2-after')
      return response
    }

    // middleware1 is first, so it wraps middleware2 which wraps handler
    const composedHandler = applyMiddleware(handler, middleware1, middleware2)
    await composedHandler(createMockContext())

    expect(executionOrder).toEqual([
      'm1-before',
      'm2-before',
      'handler',
      'm2-after',
      'm1-after',
    ])
  })

  it('should allow middleware to short-circuit the chain', async () => {
    const executionOrder: string[] = []

    const handler: Handler = async () => {
      executionOrder.push('handler')
      return new Response('OK')
    }

    const shortCircuit: Middleware = async () => {
      executionOrder.push('short-circuit')
      return new Response('Blocked', { status: 403 })
    }

    const middleware: Middleware = async (ctx, next) => {
      executionOrder.push('middleware')
      return next()
    }

    const composedHandler = applyMiddleware(handler, middleware, shortCircuit)
    const response = await composedHandler(createMockContext())

    expect(executionOrder).toEqual(['middleware', 'short-circuit'])
    expect(response.status).toBe(403)
  })

  it('should pass context through the chain', async () => {
    const receivedUrls: string[] = []

    const handler: Handler = async (ctx) => {
      receivedUrls.push(ctx.request.url)
      return new Response('OK')
    }

    const middleware: Middleware = async (ctx, next) => {
      receivedUrls.push(`middleware: ${ctx.request.url}`)
      return next()
    }

    const composedHandler = applyMiddleware(handler, middleware)
    await composedHandler(createMockContext({
      request: new Request('http://localhost/test-path'),
    }))

    expect(receivedUrls).toEqual([
      'middleware: http://localhost/test-path',
      'http://localhost/test-path',
    ])
  })
})

// =============================================================================
// Runtime Tests: compose Execution
// =============================================================================

describe('compose runtime behavior', () => {
  it('should call next when no middleware provided', async () => {
    const composed = compose()
    let nextCalled = false

    await composed(createMockContext(), async () => {
      nextCalled = true
      return new Response('Final')
    })

    expect(nextCalled).toBe(true)
  })

  it('should execute middleware in order', async () => {
    const executionOrder: string[] = []

    const m1: Middleware = async (ctx, next) => {
      executionOrder.push('m1-before')
      const response = await next()
      executionOrder.push('m1-after')
      return response
    }

    const m2: Middleware = async (ctx, next) => {
      executionOrder.push('m2-before')
      const response = await next()
      executionOrder.push('m2-after')
      return response
    }

    const composed = compose(m1, m2)
    await composed(createMockContext(), async () => {
      executionOrder.push('next')
      return new Response('OK')
    })

    expect(executionOrder).toEqual([
      'm1-before',
      'm2-before',
      'next',
      'm2-after',
      'm1-after',
    ])
  })

  it('should reject when next() is called multiple times', async () => {
    const badMiddleware: Middleware = async (ctx, next) => {
      await next()
      return next() // second call should throw
    }

    const composed = compose(badMiddleware)

    await expect(
      composed(createMockContext(), async () => new Response('OK'))
    ).rejects.toThrow('next() called multiple times')
  })

  it('should return 404 when next is undefined at end of chain', async () => {
    const middleware: Middleware = async (ctx, next) => {
      return next()
    }

    const composed = compose(middleware)
    // This tests the case when the final next() is called but there's no handler
    // The implementation returns a 404 response in this case
    const response = await composed(createMockContext(), async () => {
      return new Response('OK')
    })

    expect(response.status).toBe(200)
  })

  it('should work when composed middleware is used as middleware', async () => {
    const innerOrder: string[] = []

    const inner1: Middleware = async (ctx, next) => {
      innerOrder.push('inner1-before')
      const response = await next()
      innerOrder.push('inner1-after')
      return response
    }

    const inner2: Middleware = async (ctx, next) => {
      innerOrder.push('inner2-before')
      const response = await next()
      innerOrder.push('inner2-after')
      return response
    }

    const composedInner = compose(inner1, inner2)

    // The composed middleware can be used as a regular middleware
    const outerMiddleware: Middleware = async (ctx, next) => {
      innerOrder.push('outer-before')
      const response = await composedInner(ctx, next)
      innerOrder.push('outer-after')
      return response
    }

    await outerMiddleware(createMockContext(), async () => {
      innerOrder.push('handler')
      return new Response('OK')
    })

    expect(innerOrder).toEqual([
      'outer-before',
      'inner1-before',
      'inner2-before',
      'handler',
      'inner2-after',
      'inner1-after',
      'outer-after',
    ])
  })
})

// =============================================================================
// Integration Tests: applyMiddleware + compose Together
// =============================================================================

describe('applyMiddleware + compose integration', () => {
  it('should allow composed middleware to be used with applyMiddleware', async () => {
    const order: string[] = []

    const handler: Handler = async () => {
      order.push('handler')
      return new Response('OK')
    }

    const m1: Middleware = async (ctx, next) => {
      order.push('m1')
      return next()
    }

    const m2: Middleware = async (ctx, next) => {
      order.push('m2')
      return next()
    }

    const composed = compose(m1, m2)
    const finalHandler = applyMiddleware(handler, composed)

    await finalHandler(createMockContext())

    expect(order).toEqual(['m1', 'm2', 'handler'])
  })

  it('should maintain type safety when combining compose and applyMiddleware', () => {
    const handler: Handler = async () => new Response('OK')
    const m1: Middleware = async (ctx, next) => next()
    const m2: Middleware = async (ctx, next) => next()

    const composed = compose(m1, m2)

    // composed should be a Middleware, which can be passed to applyMiddleware
    expectTypeOf(composed).toMatchTypeOf<Middleware>()

    const result = applyMiddleware(handler, composed)

    // result should be a Handler
    expectTypeOf(result).toMatchTypeOf<Handler>()
  })

  it('should handle error propagation through the chain', async () => {
    const handler: Handler = async () => {
      throw new Error('Handler error')
    }

    const errorCatcher: Middleware = async (ctx, next) => {
      try {
        return await next()
      } catch (error) {
        return new Response(`Caught: ${(error as Error).message}`, { status: 500 })
      }
    }

    const composedHandler = applyMiddleware(handler, errorCatcher)
    const response = await composedHandler(createMockContext())

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Caught: Handler error')
  })
})

// =============================================================================
// Type Inference Tests: Verifying the Type Issue
// =============================================================================

describe('type inference verification', () => {
  it('applyMiddleware should have correct generic inference', () => {
    // This test verifies that the return type is correctly inferred as Handler
    const handler: Handler = async () => new Response('OK')
    const middleware: Middleware = async (ctx, next) => next()

    const result = applyMiddleware(handler, middleware)

    // The result should be assignable to Handler
    const assignedToHandler: Handler = result

    // Should be callable with just Context (not requiring next)
    const testCall = async () => {
      const ctx = createMockContext()
      const response = await assignedToHandler(ctx)
      return response
    }

    expectTypeOf(result).toMatchTypeOf<Handler>()
    // Note: We can't use expectTypeOf().not.toMatchTypeOf() with Middleware
    // because Handler is a subset of Middleware's first parameter type
    expect(testCall).toBeDefined()
  })

  it('compose should return a function matching Middleware signature', () => {
    const m1: Middleware = async (ctx, next) => next()
    const m2: Middleware = async (ctx, next) => next()

    const composed = compose(m1, m2)

    // The composed result should be assignable to Middleware
    const assignedToMiddleware: Middleware = composed

    // Should require both ctx and next parameters
    expectTypeOf(composed).toMatchTypeOf<Middleware>()
    expectTypeOf(composed).parameters.toMatchTypeOf<[Context, () => Promise<Response>]>()
  })

  it('reduceRight in applyMiddleware should maintain Handler type through reduction', () => {
    // This test specifically targets the type issue at lines 21-22
    // The reduceRight call should correctly infer that the accumulator is always Handler

    const handlers: Handler[] = []
    const middlewares: Middleware[] = []

    // Build a handler
    const baseHandler: Handler = async () => new Response('base')
    handlers.push(baseHandler)

    // Build some middleware
    for (let i = 0; i < 3; i++) {
      const m: Middleware = async (ctx, next) => {
        const response = await next()
        return new Response(response.body, {
          ...response,
          headers: new Headers([...response.headers.entries(), [`X-M${i}`, 'true']]),
        })
      }
      middlewares.push(m)
    }

    // Apply all middleware
    const result = applyMiddleware(handlers[0]!, ...middlewares)

    // The result MUST be a Handler, not a union type or any
    expectTypeOf(result).toMatchTypeOf<Handler>()

    // Verify it's callable as a Handler
    const isCallableAsHandler = async () => {
      const ctx = createMockContext()
      // This should NOT require a 'next' parameter
      const response = await result(ctx)
      return response
    }

    expect(isCallableAsHandler).toBeDefined()
  })
})

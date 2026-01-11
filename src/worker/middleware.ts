/**
 * Middleware Pipeline Composer
 *
 * This module implements a Koa-style middleware composer that allows
 * composing multiple middleware functions into a single pipeline.
 *
 * Features:
 * - Executes middleware in order (left to right)
 * - Supports async middleware
 * - Enables short-circuiting by not calling next()
 * - Properly propagates errors through the chain
 * - Prevents multiple next() calls
 */

/**
 * Base middleware context interface.
 * Extend this interface to add custom context properties.
 */
export interface MiddlewareContext {
  [key: string]: unknown
}

/**
 * Next function type that middleware calls to continue the chain.
 */
export type MiddlewareNext = () => Promise<void>

/**
 * Middleware function type.
 * @template C - The context type extending MiddlewareContext
 */
export type Middleware<C extends MiddlewareContext = MiddlewareContext> = (
  ctx: C,
  next: MiddlewareNext
) => Promise<void> | void

/**
 * Composed middleware function type.
 * @template C - The context type extending MiddlewareContext
 */
export type ComposedMiddleware<C extends MiddlewareContext = MiddlewareContext> = (ctx: C) => Promise<void>

/**
 * Composes an array of middleware functions into a single middleware function.
 *
 * The composed middleware executes in order (left to right), with each middleware
 * able to perform operations before and after calling next(). This creates a
 * "onion" pattern where the first middleware wraps the second, which wraps
 * the third, and so on.
 *
 * @template C - The context type extending MiddlewareContext
 * @param middleware - Array of middleware functions to compose
 * @returns A composed middleware function that executes all middleware in sequence
 *
 * @example
 * ```typescript
 * const m1: Middleware<MyContext> = async (ctx, next) => {
 *   console.log('m1 before')
 *   await next()
 *   console.log('m1 after')
 * }
 *
 * const m2: Middleware<MyContext> = async (ctx, next) => {
 *   console.log('m2')
 *   await next()
 * }
 *
 * const composed = compose([m1, m2])
 * await composed(ctx)
 * // Output: m1 before, m2, m1 after
 * ```
 */
export function compose<C extends MiddlewareContext = MiddlewareContext>(
  middleware: Middleware<C>[]
): ComposedMiddleware<C> {
  // Validate middleware array
  if (!Array.isArray(middleware)) {
    throw new TypeError('Middleware stack must be an array!')
  }

  for (const fn of middleware) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be composed of functions!')
    }
  }

  /**
   * Return the composed middleware function.
   * @param ctx - The context object passed through the middleware chain
   * @returns A promise that resolves when all middleware have completed
   */
  return function composedMiddleware(ctx: C): Promise<void> {
    // Track the last called middleware index to detect multiple next() calls
    let index = -1

    /**
     * Dispatch to a specific middleware by index.
     * @param i - The index of the middleware to execute
     * @returns A promise that resolves when the middleware (and its downstream) completes
     */
    function dispatch(i: number): Promise<void> {
      // Prevent multiple next() calls - if we're dispatching to an index
      // that's <= the last called index, next() was called multiple times
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'))
      }

      index = i

      // Get the middleware function at this index
      const fn = middleware[i]

      // If we've run out of middleware, resolve immediately
      if (!fn) {
        return Promise.resolve()
      }

      try {
        // Execute the middleware, passing the context and a next function
        // that dispatches to the next middleware in the chain
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)))
      } catch (err) {
        // If the middleware throws synchronously, reject with the error
        return Promise.reject(err)
      }
    }

    // Start executing from the first middleware
    return dispatch(0)
  }
}

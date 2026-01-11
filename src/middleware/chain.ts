/** Worker environment bindings - generic record for middleware compatibility */
export type WorkerEnv = Record<string, unknown>

export type Context = {
  request: Request
  params: Record<string, string>
  env: WorkerEnv
}

export type Handler = (ctx: Context) => Promise<Response>

export type Middleware = (
  ctx: Context,
  next: () => Promise<Response>
) => Promise<Response>

export function applyMiddleware(
  handler: Handler,
  ...middleware: Middleware[]
): Handler {
  return middleware.reduceRight<Handler>(
    (h, m) => (ctx) => m(ctx, () => h(ctx)),
    handler
  )
}

export function compose(...middleware: Middleware[]): Middleware {
  return (ctx, next) => {
    let index = -1
    const dispatch = (i: number): Promise<Response> => {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      index = i
      const fn = i === middleware.length ? next : middleware[i]
      return fn ? fn(ctx, () => dispatch(i + 1)) : Promise.resolve(new Response('Not Found', { status: 404 }))
    }
    return dispatch(0)
  }
}

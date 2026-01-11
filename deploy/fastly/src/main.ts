/**
 * Fastly Compute@Edge Entry Point for esm.do
 *
 * This adapter bridges the esm.do worker to Fastly's Compute@Edge runtime.
 * It converts Fastly's request handling to the standard fetch API used by
 * the esm.do worker.
 *
 * ARCHITECTURE
 * ============
 *
 * Fastly Compute@Edge uses WebAssembly to run JavaScript/TypeScript at the edge.
 * This adapter:
 * 1. Receives incoming requests via Fastly's event handler
 * 2. Creates a mock environment that matches the Cloudflare Workers interface
 * 3. Invokes the esm.do worker fetch handler
 * 4. Returns the response to the client
 *
 * CONFIGURATION
 * =============
 *
 * Environment configuration is read from:
 * - Config Store (Dictionary): Runtime configuration
 * - Secret Store: API keys and authentication tokens
 * - KV Store: Module caching
 * - Object Store: Module persistence
 *
 * DEPLOYMENT
 * ==========
 *
 * Deploy using the Fastly CLI:
 *
 *   # Build and deploy
 *   cd deploy/fastly && npm run deploy
 *
 *   # Local development
 *   fastly compute serve
 */

/// <reference types="@fastly/js-compute" />

import { env } from 'fastly:env'
import { ConfigStore } from 'fastly:config-store'
import { SecretStore } from 'fastly:secret-store'
import { KVStore } from 'fastly:kv-store'

// Type for the worker module's default export
interface WorkerModule {
  fetch(request: Request, env: WorkerEnv): Promise<Response>
}

// Environment bindings expected by the esm.do worker
interface WorkerEnv {
  unsafe_eval: {
    eval(code: string): unknown
    newFunction(...args: string[]): (...args: unknown[]) => unknown
  }
}

// Cache for compiled worker module
let workerModule: WorkerModule | null = null

/**
 * Load the esm.do worker module
 * The worker is bundled at build time by webpack
 */
async function getWorker(): Promise<WorkerModule> {
  if (!workerModule) {
    // Import the bundled worker
    // This path is resolved at build time by webpack
    workerModule = await import('./worker-bundle.js') as WorkerModule
  }
  return workerModule
}

/**
 * Create an unsafe_eval environment for Fastly Compute
 *
 * Fastly Compute@Edge runs in a WebAssembly sandbox with limited
 * dynamic code execution capabilities. This implementation provides
 * a compatible interface that works within those constraints.
 *
 * Note: Full eval() support may require enabling the `--experimental-dynamic-import`
 * flag or using the experimental JavaScript engine features.
 */
function createUnsafeEvalEnv(): WorkerEnv['unsafe_eval'] {
  // Check if dynamic code execution is enabled
  const config = new ConfigStore('config')
  const enableUnsafeEval = config.get('enable_unsafe_eval') === 'true'

  if (!enableUnsafeEval) {
    return {
      eval: () => {
        throw new Error('Dynamic code execution is disabled. Enable via config store.')
      },
      newFunction: () => {
        throw new Error('Dynamic code execution is disabled. Enable via config store.')
      }
    }
  }

  // Fastly Compute@Edge has limited eval support
  // For production, consider pre-compiling modules or using WASM-based execution
  return {
    eval: (code: string) => {
      // Use indirect eval for global scope execution
      // Note: This may have limitations in Compute@Edge environment
      try {
        return (0, eval)(code)
      } catch (e) {
        throw new Error(`Dynamic eval not supported in Compute@Edge: ${e}`)
      }
    },
    newFunction: (...args: string[]) => {
      try {
        return new Function(...args) as (...fnArgs: unknown[]) => unknown
      } catch (e) {
        throw new Error(`Dynamic Function creation not supported in Compute@Edge: ${e}`)
      }
    }
  }
}

/**
 * Add Fastly-specific headers and geo information to the request
 */
function enrichRequest(request: Request): Request {
  const headers = new Headers(request.headers)

  // Add client IP for rate limiting (Fastly provides this)
  const clientIp = request.headers.get('fastly-client-ip') ||
                   request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   'unknown'
  headers.set('cf-connecting-ip', clientIp)

  // Add geo information if available
  const geo = env('FASTLY_POP') || 'unknown'
  headers.set('x-fastly-pop', geo)

  // Create new request with enriched headers
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect
  })
}

/**
 * Add Fastly-specific response headers
 */
function enrichResponse(response: Response, startTime: number): Response {
  const headers = new Headers(response.headers)

  // Add timing information
  const duration = Date.now() - startTime
  headers.set('x-fastly-timing', `${duration}ms`)

  // Add cache status
  headers.set('x-fastly-cache', 'MISS')  // Compute@Edge is origin-processing

  // Add Fastly POP information
  const pop = env('FASTLY_POP')
  if (pop) {
    headers.set('x-served-by', pop)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

/**
 * Handle cache for GET requests
 * Uses Fastly KV Store for caching module responses
 */
async function handleCache(request: Request): Promise<Response | null> {
  if (request.method !== 'GET') {
    return null
  }

  const url = new URL(request.url)

  // Only cache module files (.mjs, .d.ts, .bundle.mjs)
  const cacheableExtensions = ['.mjs', '.d.ts', '.bundle.mjs']
  const isCacheable = cacheableExtensions.some(ext => url.pathname.endsWith(ext))

  if (!isCacheable) {
    return null
  }

  try {
    const cache = new KVStore('module_cache')
    const cacheKey = url.pathname

    const cached = await cache.get(cacheKey)
    if (cached) {
      const cachedData = await cached.json() as { body: string; headers: Record<string, string>; status: number }
      const headers = new Headers(cachedData.headers)
      headers.set('x-fastly-cache', 'HIT')
      return new Response(cachedData.body, {
        status: cachedData.status,
        headers
      })
    }
  } catch {
    // Cache miss or error, continue to origin
  }

  return null
}

/**
 * Store response in cache
 */
async function cacheResponse(request: Request, response: Response): Promise<void> {
  if (request.method !== 'GET' || !response.ok) {
    return
  }

  const url = new URL(request.url)
  const cacheableExtensions = ['.mjs', '.d.ts', '.bundle.mjs']
  const isCacheable = cacheableExtensions.some(ext => url.pathname.endsWith(ext))

  if (!isCacheable) {
    return
  }

  try {
    const cache = new KVStore('module_cache')
    const cacheKey = url.pathname

    // Clone response to read body
    const clonedResponse = response.clone()
    const body = await clonedResponse.text()

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    await cache.put(cacheKey, JSON.stringify({
      body,
      headers,
      status: response.status
    }))
  } catch {
    // Caching failed, continue without caching
  }
}

/**
 * Main Fastly Compute@Edge fetch handler
 */
async function handleRequest(event: FetchEvent): Promise<Response> {
  const startTime = Date.now()
  const request = event.request

  try {
    // Check cache first
    const cachedResponse = await handleCache(request)
    if (cachedResponse) {
      return enrichResponse(cachedResponse, startTime)
    }

    // Enrich request with Fastly-specific headers
    const enrichedRequest = enrichRequest(request)

    // Load the worker module
    const worker = await getWorker()

    // Create the worker environment
    const workerEnv: WorkerEnv = {
      unsafe_eval: createUnsafeEvalEnv()
    }

    // Call the worker's fetch handler
    const response = await worker.fetch(enrichedRequest, workerEnv)

    // Cache the response if applicable
    await cacheResponse(request, response)

    // Enrich response with Fastly headers
    return enrichResponse(response, startTime)

  } catch (error) {
    console.error('Compute@Edge handler error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: errorMessage,
      stack: env('FASTLY_SERVICE_VERSION') === 'dev' ? errorStack : undefined,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'x-fastly-timing': `${Date.now() - startTime}ms`
      }
    })
  }
}

// Register the fetch event handler
addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleRequest(event))
})

// Export for testing
export { handleRequest, createUnsafeEvalEnv, enrichRequest, enrichResponse }

/**
 * Azure Functions HTTP Handler for esm.do
 *
 * This adapter bridges the Cloudflare Workers fetch API to Azure Functions.
 * It converts Azure's HttpRequest/HttpResponseInit to the standard
 * Request/Response interface used by the esm.do worker.
 *
 * ARCHITECTURE
 * ============
 *
 * Azure Functions uses a different HTTP abstraction than Cloudflare Workers:
 * - Azure: HttpRequest -> HttpResponseInit (or HttpResponse class)
 * - Workers: Request -> Response (Web Standards)
 *
 * This adapter:
 * 1. Converts Azure HttpRequest to standard Request
 * 2. Invokes the esm.do worker fetch handler
 * 3. Converts the Response back to Azure's HttpResponseInit
 *
 * CONFIGURATION
 * =============
 *
 * Environment variables:
 * - ESM_DO_BASE_URL: Base URL for the service (default: derived from request)
 * - ESM_DO_STORAGE_TYPE: Storage backend type ('memory' | 'azure-blob' | 'cosmosdb')
 * - ESM_DO_ENABLE_UNSAFE_EVAL: Enable dynamic code execution (required for tests/scripts)
 *
 * DEPLOYMENT
 * ==========
 *
 * Deploy using Azure Functions Core Tools or Azure CLI:
 *
 *   # Local development
 *   cd deploy/azure && npm install && npm run build && func start
 *
 *   # Deploy to Azure
 *   func azure functionapp publish <app-name>
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

// Type for the worker module's default export
interface WorkerModule {
  fetch(request: Request, env: WorkerEnv): Promise<Response>
}

// Environment bindings expected by the worker
interface WorkerEnv {
  unsafe_eval: {
    eval(code: string): unknown
    newFunction(...args: string[]): (...args: unknown[]) => unknown
  }
}

// Lazy-loaded worker module
let workerModule: WorkerModule | null = null

/**
 * Load the esm.do worker module
 * Uses dynamic import to load the compiled worker
 */
async function getWorker(): Promise<WorkerModule> {
  if (!workerModule) {
    // Import the worker from the main package
    // In production, this would be the compiled dist/api/worker.js
    try {
      workerModule = await import('../../../dist/api/worker.js') as WorkerModule
    } catch {
      // Fallback: try importing from the source location
      workerModule = await import('../../../src/api/worker.js') as WorkerModule
    }
  }
  return workerModule
}

/**
 * Create a mock unsafe_eval environment for Azure Functions
 *
 * Azure Functions runs in Node.js, so we can use eval() and new Function()
 * directly, unlike Cloudflare Workers which requires the unsafe_eval binding.
 */
function createUnsafeEvalEnv(): WorkerEnv['unsafe_eval'] {
  const isEnabled = process.env.ESM_DO_ENABLE_UNSAFE_EVAL === 'true'

  if (!isEnabled) {
    return {
      eval: () => {
        throw new Error('Dynamic code execution is disabled. Set ESM_DO_ENABLE_UNSAFE_EVAL=true to enable.')
      },
      newFunction: () => {
        throw new Error('Dynamic code execution is disabled. Set ESM_DO_ENABLE_UNSAFE_EVAL=true to enable.')
      }
    }
  }

  return {
    eval: (code: string) => {
      // eslint-disable-next-line no-eval
      return eval(code)
    },
    newFunction: (...args: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return new Function(...args) as (...fnArgs: unknown[]) => unknown
    }
  }
}

/**
 * Convert Azure HttpRequest to Web Standard Request
 */
async function toStandardRequest(req: HttpRequest, context: InvocationContext): Promise<Request> {
  // Build the full URL
  const protocol = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host') || process.env.ESM_DO_BASE_URL || 'localhost:7071'
  const path = req.params.path || ''
  const queryString = req.query.toString()
  const url = `${protocol}://${host}/${path}${queryString ? '?' + queryString : ''}`

  context.log(`[Azure Functions] ${req.method} ${url}`)

  // Build headers
  const headers = new Headers()
  req.headers.forEach((value, key) => {
    headers.set(key, value)
  })

  // Add Azure-specific headers for rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   req.headers.get('x-azure-clientip') ||
                   'unknown'
  headers.set('cf-connecting-ip', clientIp)

  // Build request options
  const init: RequestInit = {
    method: req.method,
    headers
  }

  // Add body for non-GET/HEAD requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const bodyText = await req.text()
    if (bodyText) {
      init.body = bodyText
    }
  }

  return new Request(url, init)
}

/**
 * Convert Web Standard Response to Azure HttpResponseInit
 */
async function toAzureResponse(response: Response): Promise<HttpResponseInit> {
  // Extract headers
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  // Get body
  const body = await response.text()

  return {
    status: response.status,
    headers,
    body
  }
}

/**
 * Main Azure Functions HTTP handler
 *
 * This function handles all HTTP requests and routes them to the esm.do worker.
 */
async function httpHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    // Load the worker module
    const worker = await getWorker()

    // Convert Azure request to standard Request
    const standardRequest = await toStandardRequest(req, context)

    // Create the worker environment
    const env: WorkerEnv = {
      unsafe_eval: createUnsafeEvalEnv()
    }

    // Call the worker's fetch handler
    const response = await worker.fetch(standardRequest, env)

    // Convert back to Azure response
    return await toAzureResponse(response)

  } catch (error) {
    context.error('Handler error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    return {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': context.invocationId
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        requestId: context.invocationId
      })
    }
  }
}

// Register the HTTP handler with Azure Functions
app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*path}',
  handler: httpHandler
})

// Export for testing
export { httpHandler, toStandardRequest, toAzureResponse }

/**
 * AWS Lambda Handler for esm.do
 *
 * This module adapts the Cloudflare Workers fetch API to AWS Lambda events,
 * allowing the esm.do worker to run on AWS Lambda with API Gateway HTTP API (v2).
 *
 * ARCHITECTURE
 * ============
 *
 * The handler bridges two different runtime environments:
 *
 * 1. Cloudflare Workers: Uses the standard Fetch API with Request/Response objects
 * 2. AWS Lambda: Uses APIGatewayProxyEventV2 and APIGatewayProxyResultV2
 *
 * This adapter converts:
 * - APIGatewayProxyEventV2 -> Request (Web API)
 * - Response (Web API) -> APIGatewayProxyResultV2
 *
 * LIMITATIONS
 * ===========
 *
 * - The unsafe_eval binding from Cloudflare Workers is not available on Lambda.
 *   This means dynamic code execution (tests, scripts) uses Node.js vm module
 *   or Function constructor instead.
 *
 * - Rate limiting state is per-Lambda-instance, not global. For production,
 *   consider using DynamoDB or ElastiCache for distributed rate limiting.
 *
 * USAGE
 * =====
 *
 * This handler is designed to be used with API Gateway HTTP API (v2).
 * Configure routes in serverless.yml to match the worker's expected paths.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda'

// Import the worker's default export
// The worker exports a default object with a fetch method
import worker from '../../src/api/worker.js'

/**
 * Environment interface matching Cloudflare Workers bindings
 *
 * On AWS Lambda, we simulate the unsafe_eval binding using Node.js
 * built-in Function constructor, which is available in Lambda.
 */
interface LambdaEnv {
  unsafe_eval: {
    eval(code: string): unknown
    newFunction(...args: string[]): (...args: unknown[]) => unknown
  }
}

/**
 * Create a simulated unsafe_eval binding for Lambda
 *
 * In Cloudflare Workers, unsafe_eval is a special binding that provides
 * eval() and newFunction() in an environment where they're normally blocked.
 *
 * On Lambda, we have full access to eval() and Function constructor,
 * so we can provide a compatible implementation.
 */
function createUnsafeEvalBinding(): LambdaEnv['unsafe_eval'] {
  return {
    eval(code: string): unknown {
      // Using indirect eval for global scope
      // eslint-disable-next-line no-eval
      return (0, eval)(code)
    },
    newFunction(...args: string[]): (...fnArgs: unknown[]) => unknown {
      // Standard Function constructor behavior
      // args = [...paramNames, body]
      return new Function(...args) as (...fnArgs: unknown[]) => unknown
    },
  }
}

/**
 * Convert API Gateway v2 event to a Web API Request object
 *
 * @param event - The API Gateway v2 event
 * @returns A standard Request object compatible with the Fetch API
 */
function eventToRequest(event: APIGatewayProxyEventV2): Request {
  // Build the full URL from the event
  const protocol = 'https'
  const host = event.requestContext.domainName || 'localhost'
  const path = event.rawPath || '/'
  const queryString = event.rawQueryString || ''

  const url = queryString
    ? `${protocol}://${host}${path}?${queryString}`
    : `${protocol}://${host}${path}`

  // Extract headers - API Gateway v2 uses lowercase header names
  const headers = new Headers()
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value) {
        headers.set(key, value)
      }
    }
  }

  // Add client IP for rate limiting (matching cf-connecting-ip)
  const sourceIp = event.requestContext.http?.sourceIp
  if (sourceIp && !headers.has('cf-connecting-ip')) {
    headers.set('cf-connecting-ip', sourceIp)
  }

  // Build request options
  const method = event.requestContext.http?.method || 'GET'

  const init: RequestInit = {
    method,
    headers,
  }

  // Add body for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(method) && event.body) {
    // Handle base64 encoded body
    if (event.isBase64Encoded) {
      init.body = Buffer.from(event.body, 'base64').toString('utf-8')
    } else {
      init.body = event.body
    }
  }

  return new Request(url, init)
}

/**
 * Convert a Web API Response to API Gateway v2 result
 *
 * @param response - The Response object from the worker
 * @returns An APIGatewayProxyResultV2 compatible with API Gateway v2
 */
async function responseToResult(
  response: Response
): Promise<APIGatewayProxyResultV2> {
  // Extract response body
  const body = await response.text()

  // Convert headers to plain object
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  // Determine if body should be base64 encoded
  // Binary content types should be encoded
  const contentType = response.headers.get('content-type') || ''
  const isBinary =
    contentType.includes('application/octet-stream') ||
    contentType.includes('image/') ||
    contentType.includes('audio/') ||
    contentType.includes('video/')

  return {
    statusCode: response.status,
    headers,
    body: isBinary ? Buffer.from(body).toString('base64') : body,
    isBase64Encoded: isBinary,
  }
}

/**
 * Main Lambda handler
 *
 * This is the entry point for AWS Lambda. It receives API Gateway v2 events,
 * converts them to standard Requests, invokes the worker, and converts the
 * Response back to an API Gateway result.
 *
 * @param event - The API Gateway v2 proxy event
 * @param context - The Lambda context (unused but required by Lambda)
 * @returns The API Gateway v2 proxy result
 */
export async function handler(
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> {
  try {
    // Convert API Gateway event to standard Request
    const request = eventToRequest(event)

    // Create the environment with simulated unsafe_eval binding
    const env = createUnsafeEvalBinding()

    // Call the worker's fetch handler
    // The worker expects (request: Request, env: Env)
    const response = await worker.fetch(request, { unsafe_eval: env })

    // Convert the Response to API Gateway result
    return await responseToResult(response)
  } catch (error) {
    // Handle unexpected errors
    const err = error instanceof Error ? error : new Error(String(error))

    console.error('Lambda handler error:', err)

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        requestId: event.requestContext.requestId,
      }),
    }
  }
}

/**
 * Export for ES modules
 */
export default { handler }

/**
 * esm.do Bun Server Entry Point
 *
 * High-performance HTTP server using Bun.serve() that adapts the
 * ESM worker's fetch handler for the Bun runtime.
 *
 * Features:
 * - Native Bun.serve() for maximum performance
 * - Hot reload support with --hot flag
 * - Environment variable configuration
 * - Graceful shutdown handling
 *
 * Usage:
 *   # Development with hot reload
 *   bun run --hot deploy/bun/server.ts
 *
 *   # Production
 *   bun run deploy/bun/server.ts
 *
 * Environment Variables:
 *   PORT - Server port (default: 8787)
 *   HOST - Server host (default: 0.0.0.0)
 *   NODE_ENV - Environment mode (development/production)
 */

// Import the ESM worker fetch handler
import worker from '../../src/api/worker.js'

// Configuration from environment variables
const PORT = parseInt(process.env['PORT'] ?? '8787', 10)
const HOST = process.env['HOST'] ?? '0.0.0.0'
const NODE_ENV = process.env['NODE_ENV'] ?? 'development'

// Create a mock environment for the worker
// In Bun, we don't have unsafe_eval binding like Cloudflare Workers,
// but we can use standard eval() and new Function()
const env = {
  unsafe_eval: {
    eval: (code: string): unknown => {
      // Bun supports eval() natively
      return eval(code)
    },
    newFunction: (...args: string[]): ((...fnArgs: unknown[]) => unknown) => {
      // Use Function constructor for dynamic function creation
      return new Function(...args) as (...fnArgs: unknown[]) => unknown
    }
  }
}

// Create the Bun server
const server = Bun.serve({
  port: PORT,
  hostname: HOST,

  // Use the worker's fetch handler
  fetch: async (request: Request): Promise<Response> => {
    try {
      // Pass request to worker with environment bindings
      return await worker.fetch(request, env)
    } catch (error) {
      console.error('[Bun Server] Request error:', error)
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Internal server error',
          status: 500
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  },

  // Error handler
  error: (error: Error): Response => {
    console.error('[Bun Server] Server error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        status: 500
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})

// Log server startup
console.log(`
  esm.do Bun Server
  =================
  Environment: ${NODE_ENV}
  URL: http://${HOST}:${PORT}
  Hot Reload: ${process.argv.includes('--hot') ? 'enabled' : 'disabled'}

  Ready to accept connections!
`)

// Graceful shutdown handling
const shutdown = () => {
  console.log('\n[Bun Server] Shutting down gracefully...')
  server.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Export server for testing purposes
export { server }

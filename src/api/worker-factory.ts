/**
 * Worker Factory with Storage Injection
 *
 * This module provides a factory function for creating workers with
 * injected storage, enabling persistence across worker restarts and
 * supporting different storage backends (in-memory, Durable Objects, etc.)
 *
 * Related issues:
 * - esm-stor.16: GREEN: Connect storage to routes
 */

import type { ModuleStorage, StoredModule, WriteResult, ModuleVersion } from '../storage/types.js'

// Env interface for worker bindings
interface Env {
  unsafe_eval?: {
    eval(code: string): unknown
    newFunction(...args: string[]): (...args: unknown[]) => unknown
  }
}

/**
 * Interface for worker with storage injection
 */
export interface WorkerWithStorage {
  fetch(request: Request, env?: Env): Promise<Response>
  getStorage(): ModuleStorage
}

/**
 * In-memory storage implementation for fallback
 */
export class InMemoryStorage implements ModuleStorage {
  private modules = new Map<string, StoredModule>()
  private versionHistory = new Map<string, Array<{ version: string; module: StoredModule; timestamp: Date }>>()

  async read(name: string, version?: string): Promise<StoredModule | null> {
    if (version) {
      const history = this.versionHistory.get(name)
      const entry = history?.find(h => h.version === version)
      return entry?.module || null
    }
    return this.modules.get(name) || null
  }

  async write(name: string, data: StoredModule): Promise<WriteResult> {
    const version = `sha_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const storedModule = { ...data, name, version }
    this.modules.set(name, storedModule)

    // Track version history
    const history = this.versionHistory.get(name) || []
    history.unshift({
      version,
      module: storedModule,
      timestamp: new Date(),
    })
    this.versionHistory.set(name, history)

    return { version, name }
  }

  async delete(name: string): Promise<void> {
    this.modules.delete(name)
  }

  async list(pattern?: string): Promise<string[]> {
    const names = Array.from(this.modules.keys())
    if (!pattern) return names.sort()
    return names.filter(n => n.includes(pattern.replace(/\*/g, ''))).sort()
  }

  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    const history = this.versionHistory.get(name) || []
    const limited = limit ? history.slice(0, limit) : history
    return limited.map(h => ({
      version: h.version,
      message: `Update ${name}`,
      timestamp: h.timestamp,
    }))
  }
}

// Helper: Generate request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

// CORS configuration
function addCorsHeaders(headers: Headers): void {
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
}

// Helper: Create JSON response
function jsonResponse(
  data: unknown,
  status: number = 200,
  requestId: string = generateRequestId(),
  error?: string
): Response {
  let responseBody: unknown
  if (error) {
    responseBody = { error, status, requestId }
  } else {
    responseBody = data
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  })
  addCorsHeaders(headers)

  return new Response(JSON.stringify(responseBody), { status, headers })
}

// Helper: Parse module name from path
function parseModulePath(path: string): { scope: string; name: string } | null {
  path = path.startsWith('/') ? path.slice(1) : path
  if (!path) return null

  const match = path.match(/^(@?[^/]+)\/([^@.]+)/)
  if (!match) return null

  const scope = match[1]
  const name = match[2]
  if (!scope || !name) return null

  return {
    scope: scope.replace(/^@/, ''),
    name: name,
  }
}

function getFullName(scope: string, name: string): string {
  return `@${scope}/${name}`
}

/**
 * Create a worker with injected storage
 *
 * @param storage - The storage implementation to use for module operations
 * @returns A worker instance that uses the injected storage
 */
export function createWorkerWithStorage(storage: ModuleStorage): WorkerWithStorage {
  return {
    getStorage(): ModuleStorage {
      return storage
    },

    async fetch(request: Request, _env?: Env): Promise<Response> {
      const url = new URL(request.url)
      const path = url.pathname
      const method = request.method
      const requestId = generateRequestId()

      // Handle OPTIONS (preflight)
      if (method === 'OPTIONS') {
        const headers = new Headers()
        addCorsHeaders(headers)
        return new Response(null, { status: 204, headers })
      }

      // Parse path
      const parsed = parseModulePath(path)
      if (!parsed) {
        return jsonResponse(null, 400, requestId, 'Invalid path')
      }

      const fullName = getFullName(parsed.scope, parsed.name)

      try {
        if (method === 'GET') {
          // Read module
          const module = await storage.read(fullName)
          if (!module) {
            return jsonResponse(null, 404, requestId, `Module '${fullName}' not found`)
          }

          const versions = await storage.versions(fullName)
          return jsonResponse({
            name: fullName,
            version: module.version,
            files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
            versions: versions.map(v => ({
              sha: v.version,
              message: v.message,
              timestamp: v.timestamp instanceof Date ? v.timestamp.toISOString() : new Date(v.timestamp).toISOString(),
            })),
          })
        }

        if (method === 'POST') {
          // Write module
          let body: {
            types?: string
            module?: string
            tests?: string
            script?: string
          }

          try {
            const text = await request.text()
            body = JSON.parse(text)
          } catch {
            return jsonResponse(null, 400, requestId, 'Invalid JSON in request body')
          }

          if (!body.types || !body.module) {
            return jsonResponse(null, 400, requestId, 'types and module fields are required')
          }

          const newModule: StoredModule = {
            name: fullName,
            types: body.types,
            module: body.module,
            tests: body.tests || '',
            script: body.script || '',
          }

          const writeResult = await storage.write(fullName, newModule)

          return jsonResponse({
            name: fullName,
            version: writeResult.version,
            files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
            created: true,
          }, 201)
        }

        if (method === 'DELETE') {
          const module = await storage.read(fullName)
          if (!module) {
            return jsonResponse(null, 404, requestId, `Module '${fullName}' not found`)
          }

          await storage.delete(fullName)
          return jsonResponse({ name: fullName, deleted: true })
        }

        return jsonResponse(null, 405, requestId, 'Method not allowed')
      } catch (error) {
        // Propagate storage errors with meaningful messages
        const errorMessage = error instanceof Error ? error.message : 'Internal server error'
        const isStorageError = errorMessage.toLowerCase().includes('storage') ||
                               error instanceof Error && error.name.includes('Storage')

        return jsonResponse(
          null,
          500,
          requestId,
          isStorageError ? `Storage error: ${errorMessage}` : errorMessage
        )
      }
    },
  }
}

/**
 * Default in-memory storage instance for fallback
 */
const defaultStorage = new InMemoryStorage()

/**
 * Create a worker with optional storage binding
 *
 * If no storage is provided (e.g., no Durable Object binding),
 * falls back to in-memory storage.
 *
 * @param storage - Optional storage implementation
 * @returns A worker instance
 */
export function createWorker(storage?: ModuleStorage): WorkerWithStorage {
  return createWorkerWithStorage(storage || defaultStorage)
}

export default { createWorkerWithStorage, createWorker, InMemoryStorage }

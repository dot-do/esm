/**
 * esm.do Vercel Edge Function Handler
 *
 * This Edge Function adapts the Cloudflare Workers fetch API to run on Vercel's Edge Runtime.
 * It handles all routes via catch-all pattern and delegates to the main ESM worker logic.
 *
 * Key differences from Cloudflare Workers:
 * - Uses Vercel's Edge Runtime instead of workerd
 * - No unsafe_eval binding available - uses native eval/Function (with security considerations)
 * - Uses Vercel KV for storage instead of Cloudflare KV
 * - Environment variables accessed via process.env
 */

import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'edge',
  // Regions where the function should be deployed
  regions: ['iad1', 'sfo1', 'lhr1', 'hnd1', 'sin1'],
}

// =============================================================================
// Types
// =============================================================================

interface StoredModule {
  name: string
  types: string
  module: string
  tests: string
  script: string
  version?: string
}

interface ModuleVersion {
  version: string
  message: string
  timestamp: Date
}

interface WriteResult {
  name: string
  version: string
}

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: unknown[]
}

interface TestResult {
  passed: number
  failed: number
  total: number
  duration: number
  tests: Array<{
    name: string
    status: 'passed' | 'failed'
    duration?: number
    error?: string
  }>
}

interface RunResult {
  success: boolean
  value?: unknown
  error?: string
  logs: LogEntry[]
  duration: number
}

// =============================================================================
// In-Memory Storage (for Edge Runtime)
// =============================================================================

class InMemoryStorage {
  private modules: Map<string, {
    current: StoredModule
    versions: Map<string, StoredModule>
    history: ModuleVersion[]
  }> = new Map()

  async read(name: string, version?: string): Promise<StoredModule | null> {
    const entry = this.modules.get(name)
    if (!entry) return null
    if (version) {
      return entry.versions.get(version) || null
    }
    return entry.current
  }

  async write(name: string, module: StoredModule): Promise<WriteResult> {
    const timestamp = Date.now()
    const nonce = Math.random().toString(36).slice(2, 10)
    const content = JSON.stringify({ ...module, _ts: timestamp, _nonce: nonce })

    // Simple hash for version
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    const version = Math.abs(hash).toString(16).slice(0, 12)

    const storedModule: StoredModule = { ...module, version }

    let entry = this.modules.get(name)
    if (!entry) {
      entry = { current: storedModule, versions: new Map(), history: [] }
      this.modules.set(name, entry)
    }

    entry.current = storedModule
    entry.versions.set(version, storedModule)
    entry.history.unshift({
      version,
      message: 'Module updated',
      timestamp: new Date(timestamp),
    })

    return { version, name }
  }

  async delete(name: string): Promise<void> {
    this.modules.delete(name)
  }

  async list(pattern?: string): Promise<string[]> {
    const names = Array.from(this.modules.keys())
    if (!pattern) return names

    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    const regex = new RegExp(`^${regexPattern}$`)
    return names.filter((name) => regex.test(name))
  }

  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    const entry = this.modules.get(name)
    if (!entry) return []
    return limit !== undefined ? entry.history.slice(0, limit) : entry.history
  }

  createTag(name: string, tag: string, version: string): void {
    const entry = this.modules.get(name)
    if (entry) {
      const module = entry.versions.get(version)
      if (module) {
        entry.versions.set(tag, module)
      }
    }
  }

  async getCommit(version: string): Promise<{ timestamp: number } | null> {
    for (const entry of this.modules.values()) {
      const historyItem = entry.history.find((h) => h.version === version)
      if (historyItem) {
        return { timestamp: historyItem.timestamp.getTime() }
      }
    }
    return null
  }
}

const storage = new InMemoryStorage()

// =============================================================================
// Utility Functions
// =============================================================================

function generateSha(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(12, '0')
}

function convertToExecutable(module: string): string {
  let code = module
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, '$1function $2')
  code = code.replace(/export\s+const\s+/g, 'const ')
  code = code.replace(/export\s+let\s+/g, 'let ')
  code = code.replace(/export\s+class\s+/g, 'class ')
  code = code.replace(/import\s+.*?from\s+['"][^'"]+['"]\s*;?/g, '')
  return code
}

function extractExportNames(module: string): string[] {
  const names: string[] = []
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+let\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(module)) !== null) {
      const name = match[1]
      if (name) names.push(name)
    }
  }

  return names
}

function resolveImports(code: string): string {
  return code.replace(
    /from\s+['"]esm\.do\/([^'"]+)['"]/g,
    "from 'https://esm.do/$1'"
  )
}

function computeETag(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `"${Math.abs(hash).toString(16)}"`
}

// =============================================================================
// Test Runner
// =============================================================================

function createTestRunner() {
  const results: Array<{
    name: string
    status: 'passed' | 'failed'
    duration?: number
    error?: string
  }> = []
  const describeStack: string[] = []

  function describe(name: string, fn: () => void) {
    describeStack.push(name)
    try {
      fn()
    } finally {
      describeStack.pop()
    }
  }

  function it(name: string, fn: () => void) {
    const fullName = [...describeStack, name].join(' > ')
    const start = Date.now()
    try {
      fn()
      results.push({ name: fullName, status: 'passed', duration: Date.now() - start })
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e))
      results.push({
        name: fullName,
        status: 'failed',
        duration: Date.now() - start,
        error: err.message,
      })
    }
  }

  function expect(actual: unknown) {
    return {
      toBe(expected: unknown) {
        if (actual !== expected) {
          throw new Error(
            `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
          )
        }
      },
      toEqual(expected: unknown) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(
            `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
          )
        }
      },
      toBeCloseTo(expected: number, precision = 2) {
        const actualNum = actual as number
        const diff = Math.abs(actualNum - expected)
        const epsilon = Math.pow(10, -precision)
        if (diff > epsilon) {
          throw new Error(
            `Expected ${expected} (within ${precision} decimal places) but got ${actualNum}`
          )
        }
      },
      toBeDefined() {
        if (actual === undefined) {
          throw new Error('Expected value to be defined but got undefined')
        }
      },
      toBeUndefined() {
        if (actual !== undefined) {
          throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`)
        }
      },
      toContain(expected: unknown) {
        if (Array.isArray(actual)) {
          if (!actual.includes(expected)) {
            throw new Error(`Expected array to contain ${JSON.stringify(expected)}`)
          }
        } else if (typeof actual === 'string') {
          if (!actual.includes(expected as string)) {
            throw new Error(`Expected string to contain "${expected}"`)
          }
        }
      },
      toMatch(pattern: RegExp) {
        if (typeof actual !== 'string' || !pattern.test(actual)) {
          throw new Error(`Expected "${actual}" to match ${pattern}`)
        }
      },
      toThrow(message?: string | RegExp) {
        const fn = actual as () => void
        let threw = false
        let thrownError: Error | null = null
        try {
          fn()
        } catch (e: unknown) {
          threw = true
          thrownError = e instanceof Error ? e : new Error(String(e))
        }
        if (!threw) {
          throw new Error('Expected function to throw but it did not')
        }
        if (message && thrownError) {
          if (typeof message === 'string' && !thrownError.message.includes(message)) {
            throw new Error(
              `Expected error message to include "${message}" but got "${thrownError.message}"`
            )
          }
          if (message instanceof RegExp && !message.test(thrownError.message)) {
            throw new Error(
              `Expected error message to match ${message} but got "${thrownError.message}"`
            )
          }
        }
      },
    }
  }

  return { describe, it, expect, results }
}

// =============================================================================
// Script/Test Execution
// =============================================================================

async function runTests(
  moduleCode: string,
  testCode: string,
  timeout = 5000
): Promise<TestResult> {
  const startTime = Date.now()

  try {
    const executableModule = convertToExecutable(moduleCode)
    const exportNames = extractExportNames(moduleCode)
    const { describe, it, expect, results } = createTestRunner()

    const context: Record<string, unknown> = {
      describe,
      it,
      expect,
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        debug: () => {},
      },
    }

    // Execute module to get exports
    const moduleWrapper = new Function(
      ...Object.keys(context),
      `${executableModule}\nreturn { ${exportNames.join(', ')} };`
    )
    const exports = moduleWrapper(...Object.values(context))

    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name]
    }

    // Execute tests
    const testWrapper = new Function(...Object.keys(context), testCode)

    const runTestsFn = async () => {
      testWrapper(...Object.values(context))
      return results
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Test timeout exceeded')), timeout)
    })

    const testResults = await Promise.race([runTestsFn(), timeoutPromise])

    const passed = testResults.filter((r) => r.status === 'passed').length
    const failed = testResults.filter((r) => r.status === 'failed').length

    return {
      passed,
      failed,
      total: passed + failed,
      duration: Date.now() - startTime,
      tests: testResults,
    }
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e))
    const isTimeout = err.message.toLowerCase().includes('timeout')

    return {
      passed: 0,
      failed: 1,
      total: 1,
      duration: Date.now() - startTime,
      tests: [
        {
          name: isTimeout ? 'Test execution' : 'Module/Test parsing',
          status: 'failed',
          error: err.message,
        },
      ],
    }
  }
}

async function runScript(
  moduleCode: string,
  scriptCode: string,
  args?: Record<string, unknown>,
  timeout = 5000
): Promise<RunResult> {
  const startTime = Date.now()
  const logs: LogEntry[] = []

  try {
    const executableModule = convertToExecutable(moduleCode)
    const exportNames = extractExportNames(moduleCode)

    const consoleProxy = {
      log: (...logArgs: unknown[]) =>
        logs.push({
          level: 'log',
          args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
        }),
      warn: (...logArgs: unknown[]) =>
        logs.push({
          level: 'warn',
          args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
        }),
      error: (...logArgs: unknown[]) =>
        logs.push({
          level: 'error',
          args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
        }),
      info: (...logArgs: unknown[]) =>
        logs.push({
          level: 'info',
          args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
        }),
      debug: (...logArgs: unknown[]) =>
        logs.push({
          level: 'debug',
          args: logArgs.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
        }),
    }

    const context: Record<string, unknown> = {
      console: consoleProxy,
      args: args || {},
      process: undefined,
      require: undefined,
      __dirname: undefined,
      __filename: undefined,
      global: undefined,
      Buffer: undefined,
      fetch: undefined,
    }

    const moduleWrapper = new Function(
      ...Object.keys(context),
      `"use strict";\n${executableModule}\nreturn { ${exportNames.join(', ')} };`
    )
    const exports = moduleWrapper(...Object.values(context))

    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name]
    }

    let wrappedScript = scriptCode
    if (scriptCode.includes('await ')) {
      wrappedScript = `return (async () => { ${scriptCode} })()`
    }

    const scriptWrapper = new Function(
      ...Object.keys(context),
      `"use strict";\n${wrappedScript}`
    )

    const runScriptFn = async () => {
      const result = scriptWrapper(...Object.values(context))
      return result instanceof Promise ? await result : result
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Script timeout exceeded')), timeout)
    })

    const value = await Promise.race([runScriptFn(), timeoutPromise])

    return {
      success: true,
      value,
      logs,
      duration: Date.now() - startTime,
    }
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e))

    return {
      success: false,
      error: err.message,
      logs,
      duration: Date.now() - startTime,
    }
  }
}

// =============================================================================
// Rate Limiting
// =============================================================================

const requestCounts = new Map<string, { count: number; resetAt: number }>()
const READ_RATE_LIMIT = parseInt(process.env.ESM_DO_RATE_LIMIT_READ || '500', 10)
const WRITE_RATE_LIMIT = parseInt(process.env.ESM_DO_RATE_LIMIT_WRITE || '100', 10)
const RATE_WINDOW = 60000

function getClientIP(request: NextRequest): string {
  const xForwardedFor = request.headers.get('x-forwarded-for')
  const xRealIp = request.headers.get('x-real-ip')
  return xForwardedFor?.split(',')[0]?.trim() || xRealIp || 'unknown'
}

function checkRateLimit(
  ip: string,
  isWriteOperation: boolean
): {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfter: number
} {
  const now = Date.now()
  const limit = isWriteOperation ? WRITE_RATE_LIMIT : READ_RATE_LIMIT
  const key = `${ip}:${isWriteOperation ? 'write' : 'read'}`
  let entry = requestCounts.get(key)

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_WINDOW }
    requestCounts.set(key, entry)
  }

  const allowed = entry.count < limit
  entry.count++

  const resetAtSeconds = Math.floor(entry.resetAt / 1000)
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
  const remaining = Math.max(0, limit - entry.count)

  return {
    allowed,
    limit,
    remaining,
    resetAt: resetAtSeconds,
    retryAfter,
  }
}

// =============================================================================
// Response Helpers
// =============================================================================

function addCorsHeaders(headers: Headers): void {
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  headers.set(
    'Access-Control-Expose-Headers',
    'ETag, Cache-Control, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, X-Request-Id'
  )
  headers.set('Access-Control-Max-Age', '86400')
}

function jsonResponse(
  data: unknown,
  status = 200,
  requestId: string = crypto.randomUUID(),
  additionalHeaders: Record<string, string> = {}
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    ...additionalHeaders,
  })
  addCorsHeaders(headers)

  return new Response(JSON.stringify(data), { status, headers })
}

function errorResponse(
  error: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>
): Response {
  const body = {
    error,
    status,
    requestId,
    ...(details && { details }),
  }
  return jsonResponse(body, status, requestId)
}

// =============================================================================
// Route Handlers
// =============================================================================

function parseModulePath(path: string): {
  scope: string
  name: string
  version?: string
  extension?: string
  action?: string
} | null {
  path = path.startsWith('/') ? path.slice(1) : path
  if (!path) return null

  // Action routes
  const actionMatch = path.match(/^(@?[^/]+)\/([^/]+)\/(test|run|diff|revert|deps)$/)
  if (actionMatch) {
    const [, scopeMatch, nameMatch, actionMatch2] = actionMatch
    if (!scopeMatch || !nameMatch || !actionMatch2) return null
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      action: actionMatch2,
    }
  }

  // Version with extension
  const versionExtMatch = path.match(
    /^(@?[^/]+)\/([^@]+)@((?:[^.]+\.)*[^.]+?)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/
  )
  if (versionExtMatch) {
    const [, scopeMatch, nameMatch, versionMatch, extensionMatch] = versionExtMatch
    if (!scopeMatch || !nameMatch || !versionMatch || !extensionMatch) return null
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      version: versionMatch,
      extension: extensionMatch.slice(1),
    }
  }

  // Version only
  const versionOnlyMatch = path.match(/^(@?[^/]+)\/([^@]+)@([^.\/][^\/]*)$/)
  if (versionOnlyMatch) {
    const [, scopeMatch, nameMatch, versionMatch] = versionOnlyMatch
    if (!scopeMatch || !nameMatch || !versionMatch) return null
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      version: versionMatch,
    }
  }

  // Extension
  const extMatch = path.match(
    /^(@?[^/]+)\/([^.]+)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/
  )
  if (extMatch) {
    const [, scopeMatch, nameMatch, extensionMatch] = extMatch
    if (!scopeMatch || !nameMatch || !extensionMatch) return null
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      extension: extensionMatch.slice(1),
    }
  }

  // Simple module path
  const simpleMatch = path.match(/^(@?[^/]+)\/([^@]+)(?:@(.+))?$/)
  if (simpleMatch) {
    const [, scopeMatch, nameMatch, versionMatch] = simpleMatch
    if (!scopeMatch || !nameMatch) return null
    const result: {
      scope: string
      name: string
      version?: string
    } = {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
    }
    if (versionMatch) {
      result.version = versionMatch
    }
    return result
  }

  return null
}

function getFullName(scope: string, name: string): string {
  return `@${scope}/${name}`
}

function isValidModuleName(scope: string, name: string): boolean {
  if (scope.includes('..') || name.includes('..')) return false
  const validPattern = /^[a-zA-Z0-9_-]+$/
  return validPattern.test(scope) && validPattern.test(name)
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(request: NextRequest): Promise<Response> {
  const url = new URL(request.url)
  let path = url.pathname
  const method = request.method
  const requestId = crypto.randomUUID()

  // Remove /api prefix if present (Vercel routes through /api)
  if (path.startsWith('/api')) {
    path = path.slice(4) || '/'
  }

  // Handle OPTIONS
  if (method === 'OPTIONS') {
    const headers = new Headers()
    addCorsHeaders(headers)
    return new Response(null, { status: 204, headers })
  }

  // Rate limiting
  const ip = getClientIP(request)
  const isWriteOperation = method === 'POST' || method === 'DELETE'
  const rateLimit = checkRateLimit(ip, isWriteOperation)

  const addRateLimitHeaders = (response: Response): Response => {
    response.headers.set('X-RateLimit-Limit', rateLimit.limit.toString())
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString())
    response.headers.set('X-RateLimit-Reset', rateLimit.resetAt.toString())
    if (!rateLimit.allowed) {
      response.headers.set('Retry-After', rateLimit.retryAfter.toString())
    }
    return response
  }

  if (!rateLimit.allowed) {
    return addRateLimitHeaders(
      errorResponse('Rate limit exceeded', 429, requestId)
    )
  }

  // Handle scope listing
  const listMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/$/)
  if (listMatch && method === 'GET') {
    const scope = listMatch[1]
    if (scope) {
      const modules = await storage.list(`@${scope}/*`)
      return addRateLimitHeaders(
        jsonResponse({ modules, scope: `@${scope}`, count: modules.length })
      )
    }
  }

  // Parse path
  const parsed = parseModulePath(path)
  if (!parsed) {
    return addRateLimitHeaders(errorResponse('Invalid path', 400, requestId))
  }

  const { scope, name, version, extension, action } = parsed

  if (!isValidModuleName(scope, name)) {
    return addRateLimitHeaders(errorResponse('Invalid module name', 400, requestId))
  }

  const fullName = getFullName(scope, name)
  let response: Response

  try {
    if (method === 'GET') {
      if (action === 'deps') {
        const module = await storage.read(fullName)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const deps: string[] = []
        const matches = module.module.matchAll(/from\s+['"]esm\.do\/([^'"]+)['"]/g)
        for (const match of matches) {
          if (match[1]) deps.push(match[1])
        }
        response = jsonResponse({ name: fullName, dependencies: deps })
      } else if (action === 'diff') {
        const fromSha = url.searchParams.get('from')
        const toSha = url.searchParams.get('to')
        if (!fromSha || !toSha) {
          return addRateLimitHeaders(
            errorResponse('Missing from or to query parameters', 400, requestId)
          )
        }
        const fromModule = await storage.read(fullName, fromSha)
        const toModule = await storage.read(fullName, toSha)
        if (!fromModule || !toModule) {
          return addRateLimitHeaders(
            errorResponse('One or both versions not found', 404, requestId)
          )
        }
        response = jsonResponse({ from: fromSha, to: toSha, diff: '' })
      } else if (extension === 'd.ts') {
        const module = await storage.read(fullName, version)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const etag = computeETag(module.types)
        const ifNoneMatch = request.headers.get('If-None-Match')
        if (ifNoneMatch === etag) {
          const headers = new Headers()
          addCorsHeaders(headers)
          return addRateLimitHeaders(new Response(null, { status: 304, headers }))
        }
        const headers = new Headers({
          'Content-Type': 'application/typescript',
          'Cache-Control': version
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=300',
          ETag: etag,
        })
        addCorsHeaders(headers)
        response = new Response(module.types, { status: 200, headers })
      } else if (extension === 'mjs') {
        const module = await storage.read(fullName, version)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const content = resolveImports(module.module)
        const etag = computeETag(content)
        const ifNoneMatch = request.headers.get('If-None-Match')
        if (ifNoneMatch === etag) {
          const headers = new Headers()
          addCorsHeaders(headers)
          return addRateLimitHeaders(new Response(null, { status: 304, headers }))
        }
        const headers = new Headers({
          'Content-Type': 'application/javascript',
          'Cache-Control': version
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=300',
          ETag: etag,
        })
        addCorsHeaders(headers)
        response = new Response(content, { status: 200, headers })
      } else if (extension === 'test.js') {
        const module = await storage.read(fullName)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const headers = new Headers({ 'Content-Type': 'application/javascript' })
        addCorsHeaders(headers)
        response = new Response(module.tests, { status: 200, headers })
      } else if (extension === 'script.js') {
        const module = await storage.read(fullName)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const headers = new Headers({ 'Content-Type': 'application/javascript' })
        addCorsHeaders(headers)
        response = new Response(module.script, { status: 200, headers })
      } else if (extension === 'bundle.mjs') {
        const module = await storage.read(fullName)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const content = resolveImports(module.module)
        const headers = new Headers({ 'Content-Type': 'application/javascript' })
        addCorsHeaders(headers)
        response = new Response(content, { status: 200, headers })
      } else {
        // Module info
        const module = await storage.read(fullName, version)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const versions = await storage.versions(fullName)
        const deps: string[] = []
        const externalDeps: string[] = []
        const matches = module.module.matchAll(/from\s+['"]([^'"]+)['"]/g)
        for (const match of matches) {
          const dep = match[1]
          if (dep?.startsWith('esm.do/') || dep?.startsWith('https://esm.do/')) {
            deps.push(dep.replace(/^(https:\/\/)?esm\.do\//, ''))
          } else if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
            externalDeps.push(dep)
          }
        }
        response = jsonResponse({
          name: fullName,
          version: module.version,
          files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
          versions: versions.map((v) => ({
            sha: v.version,
            message: v.message,
            timestamp: v.timestamp.toISOString(),
          })),
          dependencies: deps,
          externalDependencies: externalDeps.length > 0 ? externalDeps : undefined,
        })
      }
    } else if (method === 'POST') {
      if (action === 'test') {
        const module = await storage.read(fullName)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        let timeout: number | undefined
        try {
          const text = await request.text()
          if (text) {
            const body = JSON.parse(text)
            timeout = body.timeout
          }
        } catch {
          // Ignore
        }
        const results = await runTests(module.module, module.tests, timeout)
        response = jsonResponse(results)
      } else if (action === 'run') {
        const module = await storage.read(fullName)
        if (!module) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        let input: Record<string, unknown> | undefined
        let timeout: number | undefined
        try {
          const text = await request.text()
          if (text) {
            const body = JSON.parse(text)
            input = body.input
            timeout = body.timeout
          }
        } catch {
          // Ignore
        }
        const result = await runScript(module.module, module.script, input, timeout)
        if (result.error) {
          const status = result.error.includes('timeout') ? 408 : 500
          response = jsonResponse(
            {
              error: result.error,
              logs: result.logs,
              duration: result.duration,
            },
            status
          )
        } else {
          response = jsonResponse({
            result: result.value,
            logs: result.logs,
            duration: result.duration,
          })
        }
      } else if (action === 'revert') {
        let body: { to?: string }
        try {
          const text = await request.text()
          body = JSON.parse(text)
        } catch {
          return addRateLimitHeaders(
            errorResponse('Invalid JSON in request body', 400, requestId)
          )
        }
        if (!body.to) {
          return addRateLimitHeaders(
            errorResponse('Missing "to" field in request body', 400, requestId)
          )
        }
        const currentModule = await storage.read(fullName)
        if (!currentModule) {
          return addRateLimitHeaders(
            errorResponse(`Module '${fullName}' not found`, 404, requestId)
          )
        }
        const targetModule = await storage.read(fullName, body.to)
        if (!targetModule) {
          return addRateLimitHeaders(
            errorResponse(`Version '${body.to}' not found`, 404, requestId)
          )
        }
        const writeResult = await storage.write(fullName, {
          name: fullName,
          types: targetModule.types,
          module: targetModule.module,
          tests: targetModule.tests,
          script: targetModule.script,
        })
        response = jsonResponse({
          reverted: true,
          from: currentModule.version,
          to: body.to,
          newVersion: writeResult.version,
        })
      } else {
        // Create/update module
        if (fullName.startsWith('@protected/')) {
          const auth = request.headers.get('Authorization')
          if (!auth) {
            return addRateLimitHeaders(
              errorResponse('Authentication required', 401, requestId)
            )
          }
        }
        let body: {
          types?: string
          module?: string
          tests?: string
          script?: string
          options?: { force?: boolean; tag?: string; commitMessage?: string }
        }
        try {
          const text = await request.text()
          if (text.length > 10 * 1024 * 1024) {
            return addRateLimitHeaders(
              errorResponse('Payload too large', 413, requestId)
            )
          }
          body = JSON.parse(text)
        } catch {
          return addRateLimitHeaders(
            errorResponse('Invalid JSON in request body', 400, requestId)
          )
        }
        if (!body.types) {
          return addRateLimitHeaders(
            errorResponse('types field is required', 400, requestId)
          )
        }
        if (!body.module) {
          return addRateLimitHeaders(
            errorResponse('module field is required', 400, requestId)
          )
        }
        const existing = await storage.read(fullName)
        const isUpdate = !!existing
        const newModule: StoredModule = {
          name: fullName,
          types: body.types,
          module: body.module,
          tests: body.tests || '',
          script: body.script || '',
        }
        let testResults: TestResult | undefined
        let warning: string | undefined
        if (body.tests) {
          testResults = await runTests(body.module, body.tests)
          if (testResults.failed > 0 && !body.options?.force) {
            const headers = new Headers({
              'Content-Type': 'application/json',
              'X-Request-Id': requestId,
            })
            addCorsHeaders(headers)
            return addRateLimitHeaders(
              new Response(
                JSON.stringify({
                  error: 'Tests failed',
                  testResults,
                  status: 400,
                  requestId,
                }),
                { status: 400, headers }
              )
            )
          }
          if (testResults.failed > 0 && body.options?.force) {
            warning = 'Module saved with failing tests'
          }
        }
        const writeResult = await storage.write(fullName, newModule)
        const commitInfo = await storage.getCommit(writeResult.version)
        const timestamp = new Date(commitInfo?.timestamp || Date.now()).toISOString()
        const responseData: Record<string, unknown> = {
          name: fullName,
          version: writeResult.version,
          files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
          commit: {
            sha: writeResult.version,
            message:
              body.options?.commitMessage ||
              (isUpdate ? `Update ${fullName}` : `Create ${fullName}`),
            author: 'esm.do',
            timestamp,
          },
          [isUpdate ? 'updated' : 'created']: true,
        }
        if (body.options?.tag) {
          storage.createTag(fullName, body.options.tag, writeResult.version)
          responseData.tag = body.options.tag
        }
        if (testResults) {
          responseData.testResults = testResults
        }
        if (warning) {
          responseData.warning = warning
        }
        response = jsonResponse(responseData, isUpdate ? 200 : 201)
      }
    } else if (method === 'DELETE') {
      if (fullName.startsWith('@protected/')) {
        const auth = request.headers.get('Authorization')
        if (!auth) {
          return addRateLimitHeaders(
            errorResponse('Authentication required', 401, requestId)
          )
        }
      }
      const module = await storage.read(fullName)
      if (!module) {
        return addRateLimitHeaders(
          errorResponse(`Module '${fullName}' not found`, 404, requestId)
        )
      }
      const lastVersion = module.version
      await storage.delete(fullName)
      response = jsonResponse({
        name: fullName,
        deleted: true,
        commit: {
          sha: lastVersion || generateSha(`delete-${fullName}-${Date.now()}`),
          message: `Delete ${fullName}`,
          author: 'esm.do',
          timestamp: new Date().toISOString(),
        },
      })
    } else {
      response = errorResponse('Method not allowed', 405, requestId)
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    response = errorResponse(err.message, 500, requestId)
  }

  return addRateLimitHeaders(response)
}

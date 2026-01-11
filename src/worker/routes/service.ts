/**
 * Service Route Handlers for esm.do Worker
 *
 * These handlers are the main entry points for the esm.do managed service routes:
 * - GET /:scope/:name - Read module info
 * - GET /:scope/:name.ext - Read with format (ts, js, json)
 * - GET /:scope/:name/diff - Compare versions
 * - POST /:scope/:name - Write/create module
 * - POST /:scope/:name/test - Run tests
 * - POST /:scope/:name/run - Execute script
 * - DELETE /:scope/:name - Delete module
 *
 * Issue: esm-xlvb - Test esm.do managed service worker routes
 */

import type { ModuleStorage, StoredModule } from '../../storage/types.js'

// =============================================================================
// Types
// =============================================================================

/**
 * Base response type for all route handlers
 */
interface RouteResponse {
  status: number
}

/**
 * Success response with data
 */
interface SuccessResponse<T> extends RouteResponse {
  data: T
}

/**
 * Error response
 */
interface ErrorResponse extends RouteResponse {
  error: string
}

/**
 * Content response for file endpoints
 */
interface ContentResponse extends RouteResponse {
  content: string
  contentType: string
  headers?: Record<string, string>
}

/**
 * Union type for route handler responses
 */
type RouteResult<T = unknown> = SuccessResponse<T> | ErrorResponse | ContentResponse

// =============================================================================
// Test/Script Executor Interfaces
// =============================================================================

interface TestExecutorResult {
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

interface ScriptExecutorResult {
  success: boolean
  value?: unknown
  error?: string
  logs: Array<{ level: string; args: unknown[] }>
  duration: number
}

interface TestExecutor {
  runTests: (moduleCode: string, testCode: string, timeout?: number) => Promise<TestExecutorResult>
}

interface ScriptExecutor {
  runScript: (
    moduleCode: string,
    scriptCode: string,
    args?: Record<string, unknown>,
    timeout?: number
  ) => Promise<ScriptExecutorResult>
}

// =============================================================================
// Validator Interface
// =============================================================================

interface ValidatorResult {
  valid: boolean
  errors?: string[]
}

type Validator = (types: string, module: string) => Promise<ValidatorResult>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute ETag for content
 */
function computeETag(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `"${Math.abs(hash).toString(16)}"`
}

/**
 * Compute a simple unified diff between two strings
 */
function computeDiff(from: string, to: string): string {
  if (from === to) {
    return ''
  }

  const fromLines = from.split('\n')
  const toLines = to.split('\n')
  const diffLines: string[] = []

  // Simple line-by-line diff
  const maxLen = Math.max(fromLines.length, toLines.length)
  for (let i = 0; i < maxLen; i++) {
    const fromLine = fromLines[i]
    const toLine = toLines[i]

    if (fromLine === undefined && toLine !== undefined) {
      diffLines.push(`+${toLine}`)
    } else if (fromLine !== undefined && toLine === undefined) {
      diffLines.push(`-${fromLine}`)
    } else if (fromLine !== toLine) {
      diffLines.push(`-${fromLine}`)
      diffLines.push(`+${toLine}`)
    }
  }

  return diffLines.join('\n')
}

// =============================================================================
// GET /:scope/:name - Read Module Info
// =============================================================================

interface ReadModuleParams {
  scope: string
  name: string
  version?: string
  storage: ModuleStorage
  requestId?: string
}

interface ReadModuleData {
  name: string
  version: string
  files: string[]
  types?: string
  module?: string
  tests?: string
  script?: string
}

export async function handleReadModule(
  params: ReadModuleParams
): Promise<RouteResult<ReadModuleData>> {
  const { scope, name, version, storage } = params
  const fullName = `${scope}/${name}`

  const module = await storage.read(fullName, version)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  // Build files list based on what's present
  const files: string[] = []
  if (module.types) files.push('index.d.ts')
  if (module.module) files.push('index.mjs')
  if (module.tests) files.push('index.test.js')
  if (module.script) files.push('index.script.js')

  return {
    status: 200,
    data: {
      name: module.name,
      version: module.version || '',
      files,
      types: module.types,
      module: module.module,
      tests: module.tests,
      script: module.script,
    },
  }
}

// =============================================================================
// GET /:scope/:name.ext - Read with Format
// =============================================================================

interface ReadModuleWithFormatParams {
  scope: string
  name: string
  format: string
  version?: string
  storage: ModuleStorage
  requestId?: string
}

const SUPPORTED_FORMATS = ['ts', 'js', 'json', 'd.ts', 'mjs']

export async function handleReadModuleWithFormat(
  params: ReadModuleWithFormatParams
): Promise<RouteResult> {
  const { scope, name, format, version, storage } = params
  const fullName = `${scope}/${name}`

  // Validate format
  if (!SUPPORTED_FORMATS.includes(format)) {
    return {
      status: 400,
      error: `Unsupported format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
    }
  }

  const module = await storage.read(fullName, version)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  let content: string
  let contentType: string

  switch (format) {
    case 'ts':
    case 'd.ts':
      content = module.types
      contentType = 'application/typescript'
      break
    case 'js':
    case 'mjs':
      content = module.module
      contentType = 'application/javascript'
      break
    case 'json':
      content = JSON.stringify({
        name: module.name,
        types: module.types,
        module: module.module,
        tests: module.tests,
        script: module.script,
        version: module.version,
      })
      contentType = 'application/json'
      break
    default:
      return {
        status: 400,
        error: `Unsupported format: ${format}`,
      }
  }

  const etag = computeETag(content)
  const cacheControl = version ? 'public, max-age=31536000, immutable' : 'public, max-age=300'

  return {
    status: 200,
    content,
    contentType,
    headers: {
      'Cache-Control': cacheControl,
      'ETag': etag,
    },
  }
}

// =============================================================================
// GET /:scope/:name/diff - Compare Versions
// =============================================================================

interface DiffVersionsParams {
  scope: string
  name: string
  from: string
  to: string
  storage: ModuleStorage
  requestId?: string
}

interface DiffVersionsData {
  changes: string
  additions: number
  deletions: number
}

export async function handleDiffVersions(
  params: DiffVersionsParams
): Promise<RouteResult<DiffVersionsData>> {
  const { scope, name, from, to, storage } = params
  const fullName = `${scope}/${name}`

  // Validate required parameters
  if (!from) {
    return {
      status: 400,
      error: 'Missing required parameter: from',
    }
  }

  if (!to) {
    return {
      status: 400,
      error: 'Missing required parameter: to',
    }
  }

  // Read both versions
  const fromModule = await storage.read(fullName, from)
  const toModule = await storage.read(fullName, to)

  if (!fromModule) {
    return {
      status: 404,
      error: `Version ${from} not found`,
    }
  }

  if (!toModule) {
    return {
      status: 404,
      error: `Version ${to} not found`,
    }
  }

  // Compute combined diff
  const diffs: string[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  // Types diff
  const typesDiff = computeDiff(fromModule.types, toModule.types)
  if (typesDiff) {
    diffs.push(`--- a/index.d.ts\n+++ b/index.d.ts\n${typesDiff}`)
    totalAdditions += typesDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += typesDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  // Module diff
  const moduleDiff = computeDiff(fromModule.module, toModule.module)
  if (moduleDiff) {
    diffs.push(`--- a/index.mjs\n+++ b/index.mjs\n${moduleDiff}`)
    totalAdditions += moduleDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += moduleDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  // Tests diff
  const testsDiff = computeDiff(fromModule.tests, toModule.tests)
  if (testsDiff) {
    diffs.push(`--- a/index.test.js\n+++ b/index.test.js\n${testsDiff}`)
    totalAdditions += testsDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += testsDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  // Script diff
  const scriptDiff = computeDiff(fromModule.script, toModule.script)
  if (scriptDiff) {
    diffs.push(`--- a/index.script.js\n+++ b/index.script.js\n${scriptDiff}`)
    totalAdditions += scriptDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += scriptDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  return {
    status: 200,
    data: {
      changes: diffs.join('\n\n'),
      additions: totalAdditions,
      deletions: totalDeletions,
    },
  }
}

// =============================================================================
// POST /:scope/:name - Write Module
// =============================================================================

interface WriteModuleBody {
  types?: string
  module?: string
  tests?: string
  script?: string
}

interface WriteModuleParams {
  scope: string
  name: string
  body: WriteModuleBody
  storage: ModuleStorage
  validator?: Validator
  requestId?: string
}

interface WriteModuleData {
  version: string
  created?: boolean
  updated?: boolean
}

export async function handleWriteModule(
  params: WriteModuleParams
): Promise<RouteResult<WriteModuleData>> {
  const { scope, name, body, storage, validator } = params
  const fullName = `${scope}/${name}`

  // Validate required fields
  if (!body.types) {
    return {
      status: 400,
      error: 'types field is required',
    }
  }

  if (!body.module) {
    return {
      status: 400,
      error: 'module field is required',
    }
  }

  // Run validator if provided
  if (validator) {
    const validationResult = await validator(body.types, body.module)
    if (!validationResult.valid) {
      return {
        status: 400,
        error: `Invalid TypeScript syntax: ${validationResult.errors?.join(', ')}`,
      }
    }
  }

  // Check if module exists (for created vs updated)
  const existing = await storage.read(fullName)
  const isUpdate = !!existing

  // Create module object
  const newModule: StoredModule = {
    name: fullName,
    types: body.types,
    module: body.module,
    tests: body.tests || '',
    script: body.script || '',
  }

  // Write module to storage
  const writeResult = await storage.write(fullName, newModule)

  return {
    status: isUpdate ? 200 : 201,
    data: {
      version: writeResult.version,
      [isUpdate ? 'updated' : 'created']: true,
    },
  }
}

// =============================================================================
// POST /:scope/:name/test - Run Tests
// =============================================================================

interface RunTestsParams {
  scope: string
  name: string
  storage: ModuleStorage
  executor: TestExecutor
  timeout?: number
  requestId?: string
}

interface RunTestsData {
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

export async function handleRunTests(
  params: RunTestsParams
): Promise<RouteResult<RunTestsData>> {
  const { scope, name, storage, executor, timeout } = params
  const fullName = `${scope}/${name}`

  const module = await storage.read(fullName)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  if (!module.tests || module.tests.trim() === '') {
    return {
      status: 400,
      error: `Module "${fullName}" has no tests defined`,
    }
  }

  const results = await executor.runTests(module.module, module.tests, timeout)

  return {
    status: 200,
    data: {
      passed: results.passed,
      failed: results.failed,
      total: results.total,
      duration: results.duration,
      tests: results.tests,
    },
  }
}

// =============================================================================
// POST /:scope/:name/run - Execute Script
// =============================================================================

interface RunScriptParams {
  scope: string
  name: string
  storage: ModuleStorage
  executor: ScriptExecutor
  args?: Record<string, unknown>
  timeout?: number
  requestId?: string
}

interface RunScriptData {
  value: unknown
  logs: Array<{ level: string; args: unknown[] }>
  duration: number
}

export async function handleRunScript(
  params: RunScriptParams
): Promise<RouteResult<RunScriptData>> {
  const { scope, name, storage, executor, args, timeout } = params
  const fullName = `${scope}/${name}`

  const module = await storage.read(fullName)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  if (!module.script || module.script.trim() === '') {
    return {
      status: 400,
      error: `Module "${fullName}" has no script defined`,
    }
  }

  const result = await executor.runScript(module.module, module.script, args, timeout)

  if (!result.success) {
    return {
      status: 500,
      error: result.error || 'Script execution failed',
    }
  }

  return {
    status: 200,
    data: {
      value: result.value,
      logs: result.logs,
      duration: result.duration,
    },
  }
}

// =============================================================================
// DELETE /:scope/:name - Delete Module
// =============================================================================

interface DeleteModuleParams {
  scope: string
  name: string
  storage: ModuleStorage
  requestId?: string
}

interface DeleteModuleData {
  deleted: boolean
  name: string
  commit: {
    sha: string
    message: string
  }
}

export async function handleDeleteModule(
  params: DeleteModuleParams
): Promise<RouteResult<DeleteModuleData>> {
  const { scope, name, storage } = params
  const fullName = `${scope}/${name}`

  const module = await storage.read(fullName)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  // Get version before deletion
  const lastVersion = module.version || 'unknown'

  await storage.delete(fullName)

  return {
    status: 200,
    data: {
      deleted: true,
      name: fullName,
      commit: {
        sha: lastVersion,
        message: `Delete ${fullName}`,
      },
    },
  }
}

// =============================================================================
// OPTIONS - CORS Preflight Handler
// =============================================================================

interface OptionsRequestParams {
  origin?: string
  allowAllOrigins?: boolean
  requestId?: string
}

interface OptionsResult {
  status: number
  headers: Record<string, string>
}

export async function handleOptionsRequest(
  params: OptionsRequestParams
): Promise<OptionsResult> {
  const { origin, allowAllOrigins } = params

  const allowOrigin = allowAllOrigins ? '*' : origin || '*'

  return {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
      'Access-Control-Max-Age': '86400',
    },
  }
}

// =============================================================================
// Security Headers
// =============================================================================

export function addSecurityHeaders(
  existingHeaders: Record<string, string>
): Record<string, string> {
  return {
    ...existingHeaders,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'",
  }
}

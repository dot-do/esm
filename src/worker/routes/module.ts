/**
 * Module Route Handlers for esm.do Worker
 *
 * These handlers are extracted from the main worker to enable isolated testing
 * and better separation of concerns.
 *
 * Issue: esm-arch.7 - GREEN: Create module routes
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

/**
 * Helper to check if response is an error
 * @internal Exported for testing or future use
 */
export function isErrorResponse(response: RouteResult): response is ErrorResponse {
  return 'error' in response
}

/**
 * Helper to check if response is a content response
 * @internal Exported for testing or future use
 */
export function isContentResponse(response: RouteResult): response is ContentResponse {
  return 'content' in response
}

// =============================================================================
// Test Executor Interface
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
// Extended ModuleStorage with getCommit
// =============================================================================

interface ExtendedModuleStorage extends ModuleStorage {
  getCommit?: (hash: string) => Promise<{ timestamp: number; message: string } | null>
  createTag?: (name: string, tag: string, commitSha: string) => void
}

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
 * Resolve esm.do imports to full URLs
 */
function resolveImports(code: string): string {
  return code.replace(
    /from\s+['"]esm\.do\/([^'"]+)['"]/g,
    "from 'https://esm.do/$1'"
  )
}

// =============================================================================
// GET Module Info Handler
// =============================================================================

interface GetModuleInfoParams {
  fullName: string
  version?: string
  storage: ExtendedModuleStorage
  requestId?: string
}

interface ModuleInfoData {
  name: string
  version: string | undefined
  files: string[]
}

export async function handleGetModuleInfo(
  params: GetModuleInfoParams
): Promise<RouteResult<ModuleInfoData>> {
  const { fullName, version, storage } = params

  const module = await storage.read(fullName, version)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  return {
    status: 200,
    data: {
      name: module.name,
      version: module.version,
      files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
    },
  }
}

// =============================================================================
// GET Types Handler
// =============================================================================

interface GetTypesParams {
  fullName: string
  version?: string
  storage: ExtendedModuleStorage
}

export async function handleGetTypes(
  params: GetTypesParams
): Promise<RouteResult> {
  const { fullName, version, storage } = params

  const module = await storage.read(fullName, version)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  const etag = computeETag(module.types)
  const cacheControl = version ? 'public, max-age=31536000, immutable' : 'public, max-age=300'

  return {
    status: 200,
    content: module.types,
    contentType: 'application/typescript',
    headers: {
      'Cache-Control': cacheControl,
      'ETag': etag,
    },
  }
}

// =============================================================================
// GET Module Handler
// =============================================================================

interface GetModuleParams {
  fullName: string
  version?: string
  storage: ExtendedModuleStorage
}

export async function handleGetModule(
  params: GetModuleParams
): Promise<RouteResult> {
  const { fullName, version, storage } = params

  const module = await storage.read(fullName, version)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  // Resolve imports to full URLs
  const content = resolveImports(module.module)
  const etag = computeETag(content)
  const cacheControl = version ? 'public, max-age=31536000, immutable' : 'public, max-age=300'

  return {
    status: 200,
    content,
    contentType: 'application/javascript',
    headers: {
      'Cache-Control': cacheControl,
      'ETag': etag,
    },
  }
}

// =============================================================================
// GET Tests Handler
// =============================================================================

interface GetTestsParams {
  fullName: string
  storage: ExtendedModuleStorage
}

export async function handleGetTests(
  params: GetTestsParams
): Promise<RouteResult> {
  const { fullName, storage } = params

  const module = await storage.read(fullName)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  return {
    status: 200,
    content: module.tests,
    contentType: 'application/javascript',
  }
}

// =============================================================================
// GET Script Handler
// =============================================================================

interface GetScriptParams {
  fullName: string
  storage: ExtendedModuleStorage
}

export async function handleGetScript(
  params: GetScriptParams
): Promise<RouteResult> {
  const { fullName, storage } = params

  const module = await storage.read(fullName)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  return {
    status: 200,
    content: module.script,
    contentType: 'application/javascript',
  }
}

// =============================================================================
// POST Create Module Handler
// =============================================================================

interface CreateModuleBody {
  types?: string
  module?: string
  tests?: string
  script?: string
  options?: {
    force?: boolean
    tag?: string
    commitMessage?: string
  }
}

interface CreateModuleParams {
  fullName: string
  body: CreateModuleBody
  storage: ExtendedModuleStorage
  executor?: TestExecutor
}

interface CreateModuleData {
  name: string
  version: string
  created?: boolean
  updated?: boolean
  testResults?: TestExecutorResult
  warning?: string
}

export async function handleCreateModule(
  params: CreateModuleParams
): Promise<RouteResult<CreateModuleData>> {
  const { fullName, body, storage, executor } = params

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

  // Run tests if provided and executor available
  let testResults: TestExecutorResult | undefined
  let warning: string | undefined

  if (body.tests && executor) {
    testResults = await executor.runTests(newModule.module, newModule.tests)

    // Check for failing tests
    if (testResults.failed > 0 && !body.options?.force) {
      return {
        status: 400,
        error: 'Tests failed',
      }
    }

    if (testResults.failed > 0 && body.options?.force) {
      warning = 'Module saved with failing tests'
    }
  }

  // Write module to storage
  const writeResult = await storage.write(fullName, newModule)

  const response: CreateModuleData = {
    name: fullName,
    version: writeResult.version,
    [isUpdate ? 'updated' : 'created']: true,
  }

  if (testResults) {
    response.testResults = testResults
  }

  if (warning) {
    response.warning = warning
  }

  return {
    status: isUpdate ? 200 : 201,
    data: response,
  }
}

// =============================================================================
// POST Run Tests Handler
// =============================================================================

interface RunTestsParams {
  fullName: string
  storage: ExtendedModuleStorage
  executor: TestExecutor
  timeout?: number
}

interface RunTestsData {
  passed: number
  failed: number
  total: number
  duration: number
  results: Array<{
    name: string
    status: 'passed' | 'failed'
    duration?: number
    error?: string
  }>
}

export async function handleRunTests(
  params: RunTestsParams
): Promise<RouteResult<RunTestsData>> {
  const { fullName, storage, executor, timeout } = params

  const module = await storage.read(fullName)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
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
      results: results.tests,
    },
  }
}

// =============================================================================
// POST Run Script Handler
// =============================================================================

interface RunScriptParams {
  fullName: string
  storage: ExtendedModuleStorage
  executor: ScriptExecutor
  input?: Record<string, unknown>
  timeout?: number
}

interface RunScriptData {
  result: unknown
  logs: Array<{ level: string; args: unknown[] }>
  duration: number
}

export async function handleRunScript(
  params: RunScriptParams
): Promise<RouteResult<RunScriptData>> {
  const { fullName, storage, executor, input, timeout } = params

  const module = await storage.read(fullName)

  if (!module) {
    return {
      status: 404,
      error: `Module "${fullName}" not found`,
    }
  }

  const result = await executor.runScript(module.module, module.script, input, timeout)

  if (!result.success) {
    return {
      status: 500,
      error: result.error || 'Script execution failed',
    }
  }

  return {
    status: 200,
    data: {
      result: result.value,
      logs: result.logs,
      duration: result.duration,
    },
  }
}

// =============================================================================
// DELETE Module Handler
// =============================================================================

interface DeleteModuleParams {
  fullName: string
  storage: ExtendedModuleStorage
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
  const { fullName, storage } = params

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

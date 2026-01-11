/**
 * Health Routes - Handlers for service health and status endpoints
 *
 * Issue: esm-arch.17 - Add health routes
 *
 * This module provides extracted route handlers for health-related operations:
 * - GET /health: Basic health check (liveness probe)
 * - GET /status: Detailed service status (readiness probe)
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Route handler result type - consistent across all handlers
 */
export interface RouteResult<T = unknown> {
  readonly status: number
  readonly data?: T
  readonly error?: string
}

/**
 * Health check response
 */
export interface HealthResponse {
  readonly healthy: boolean
  readonly timestamp: string
}

/**
 * Detailed status response
 */
export interface StatusResponse {
  readonly status: 'healthy' | 'degraded' | 'unhealthy'
  readonly version: string
  readonly uptime: number
  readonly timestamp: string
  readonly checks: {
    readonly storage: ServiceCheck
    readonly executor: ServiceCheck
  }
}

/**
 * Individual service check result
 */
export interface ServiceCheck {
  readonly status: 'healthy' | 'degraded' | 'unhealthy'
  readonly latency?: number
  readonly message?: string
}

/**
 * Request parameters for handleHealth
 */
export interface HealthParams {
  readonly requestId?: string
}

/**
 * Request parameters for handleStatus
 */
export interface StatusParams {
  readonly requestId?: string
  readonly checkStorage?: () => Promise<ServiceCheck>
  readonly checkExecutor?: () => Promise<ServiceCheck>
}

// =============================================================================
// Module-level state for uptime tracking
// =============================================================================

const startTime = Date.now()

/**
 * Get the service uptime in seconds
 */
export function getUptime(): number {
  return Math.floor((Date.now() - startTime) / 1000)
}

// =============================================================================
// Service version
// =============================================================================

/**
 * Service version - should match package.json
 */
export const SERVICE_VERSION = '0.1.0'

// =============================================================================
// GET Health Handler
// =============================================================================

/**
 * Handle GET /health - Basic health check endpoint
 *
 * This is a lightweight endpoint suitable for liveness probes.
 * It returns immediately without performing any dependency checks.
 *
 * @param params - Request parameters (optional requestId for tracing)
 * @returns Route result with health status
 */
export async function handleHealth(
  _params: HealthParams = {}
): Promise<RouteResult<HealthResponse>> {
  return {
    status: 200,
    data: {
      healthy: true,
      timestamp: new Date().toISOString(),
    },
  }
}

// =============================================================================
// GET Status Handler
// =============================================================================

/**
 * Default storage check - assumes healthy if no check provided
 */
async function defaultStorageCheck(): Promise<ServiceCheck> {
  return {
    status: 'healthy',
    latency: 0,
  }
}

/**
 * Default executor check - assumes healthy if no check provided
 */
async function defaultExecutorCheck(): Promise<ServiceCheck> {
  return {
    status: 'healthy',
    latency: 0,
  }
}

/**
 * Handle GET /status - Detailed service status endpoint
 *
 * This is a comprehensive endpoint suitable for readiness probes.
 * It performs dependency checks and returns detailed status information.
 *
 * @param params - Request parameters including optional dependency checks
 * @returns Route result with detailed status
 */
export async function handleStatus(
  params: StatusParams = {}
): Promise<RouteResult<StatusResponse>> {
  const checkStorage = params.checkStorage || defaultStorageCheck
  const checkExecutor = params.checkExecutor || defaultExecutorCheck

  // Perform checks in parallel
  const [storageCheck, executorCheck] = await Promise.all([
    checkStorage().catch((error): ServiceCheck => ({
      status: 'unhealthy',
      message: error instanceof Error ? error.message : String(error),
    })),
    checkExecutor().catch((error): ServiceCheck => ({
      status: 'unhealthy',
      message: error instanceof Error ? error.message : String(error),
    })),
  ])

  // Determine overall status
  const checks = {
    storage: storageCheck,
    executor: executorCheck,
  }

  const allHealthy = storageCheck.status === 'healthy' && executorCheck.status === 'healthy'
  const anyUnhealthy = storageCheck.status === 'unhealthy' || executorCheck.status === 'unhealthy'

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy'
  if (allHealthy) {
    overallStatus = 'healthy'
  } else if (anyUnhealthy) {
    overallStatus = 'unhealthy'
  } else {
    overallStatus = 'degraded'
  }

  const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503

  return {
    status: httpStatus,
    data: {
      status: overallStatus,
      version: SERVICE_VERSION,
      uptime: getUptime(),
      timestamp: new Date().toISOString(),
      checks,
    },
  }
}

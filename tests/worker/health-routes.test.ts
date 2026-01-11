/**
 * Tests for Health Routes
 *
 * Issue: esm-arch.17 - Add health routes
 *
 * These tests verify that health route handlers work correctly:
 * - GET /health: Basic health check (liveness probe)
 * - GET /status: Detailed service status (readiness probe)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  handleHealth,
  handleStatus,
  getUptime,
  SERVICE_VERSION,
  type HealthResponse,
  type StatusResponse,
  type ServiceCheck,
} from '../../src/worker/routes/health.js'

// =============================================================================
// GET Health Route Handler Tests
// =============================================================================
describe('GET Health Route Handler', () => {
  it('should be exported as a standalone function', () => {
    expect(typeof handleHealth).toBe('function')
  })

  it('should return 200 status', async () => {
    const result = await handleHealth()

    expect(result.status).toBe(200)
  })

  it('should return healthy: true', async () => {
    const result = await handleHealth()

    expect(result.data).toHaveProperty('healthy', true)
  })

  it('should include timestamp', async () => {
    const result = await handleHealth()

    expect(result.data).toHaveProperty('timestamp')
    expect(typeof result.data!.timestamp).toBe('string')
    // Verify it's a valid ISO date
    expect(() => new Date(result.data!.timestamp)).not.toThrow()
  })

  it('should accept optional requestId for tracing', async () => {
    const result = await handleHealth({ requestId: 'req-123' })

    expect(result.status).toBe(200)
  })

  it('should be fast (no external dependencies)', async () => {
    const start = Date.now()
    await handleHealth()
    const duration = Date.now() - start

    // Should complete in under 10ms as it has no I/O
    expect(duration).toBeLessThan(10)
  })
})

// =============================================================================
// GET Status Route Handler Tests
// =============================================================================
describe('GET Status Route Handler', () => {
  it('should be exported as a standalone function', () => {
    expect(typeof handleStatus).toBe('function')
  })

  it('should return 200 status when all checks pass', async () => {
    const result = await handleStatus()

    expect(result.status).toBe(200)
  })

  it('should return status: healthy when all checks pass', async () => {
    const result = await handleStatus()

    expect(result.data).toHaveProperty('status', 'healthy')
  })

  it('should include version information', async () => {
    const result = await handleStatus()

    expect(result.data).toHaveProperty('version')
    expect(typeof result.data!.version).toBe('string')
  })

  it('should include uptime in seconds', async () => {
    const result = await handleStatus()

    expect(result.data).toHaveProperty('uptime')
    expect(typeof result.data!.uptime).toBe('number')
    expect(result.data!.uptime).toBeGreaterThanOrEqual(0)
  })

  it('should include timestamp', async () => {
    const result = await handleStatus()

    expect(result.data).toHaveProperty('timestamp')
    expect(typeof result.data!.timestamp).toBe('string')
  })

  it('should include checks object', async () => {
    const result = await handleStatus()

    expect(result.data).toHaveProperty('checks')
    expect(result.data!.checks).toHaveProperty('storage')
    expect(result.data!.checks).toHaveProperty('executor')
  })

  it('should accept custom storage check function', async () => {
    const checkStorage = vi.fn().mockResolvedValue({
      status: 'healthy',
      latency: 5,
    })

    const result = await handleStatus({ checkStorage })

    expect(checkStorage).toHaveBeenCalled()
    expect(result.data!.checks.storage).toEqual({
      status: 'healthy',
      latency: 5,
    })
  })

  it('should accept custom executor check function', async () => {
    const checkExecutor = vi.fn().mockResolvedValue({
      status: 'healthy',
      latency: 3,
    })

    const result = await handleStatus({ checkExecutor })

    expect(checkExecutor).toHaveBeenCalled()
    expect(result.data!.checks.executor).toEqual({
      status: 'healthy',
      latency: 3,
    })
  })

  it('should return degraded status when one check is degraded', async () => {
    const checkStorage = vi.fn().mockResolvedValue({
      status: 'degraded',
      latency: 500,
      message: 'High latency',
    })

    const result = await handleStatus({ checkStorage })

    expect(result.data!.status).toBe('degraded')
    expect(result.status).toBe(200) // Still 200 for degraded
  })

  it('should return unhealthy status when one check fails', async () => {
    const checkStorage = vi.fn().mockResolvedValue({
      status: 'unhealthy',
      message: 'Storage unavailable',
    })

    const result = await handleStatus({ checkStorage })

    expect(result.data!.status).toBe('unhealthy')
    expect(result.status).toBe(503)
  })

  it('should return 503 when service is unhealthy', async () => {
    const checkExecutor = vi.fn().mockResolvedValue({
      status: 'unhealthy',
      message: 'Executor down',
    })

    const result = await handleStatus({ checkExecutor })

    expect(result.status).toBe(503)
  })

  it('should handle check function errors gracefully', async () => {
    const checkStorage = vi.fn().mockRejectedValue(new Error('Connection failed'))

    const result = await handleStatus({ checkStorage })

    expect(result.data!.checks.storage.status).toBe('unhealthy')
    expect(result.data!.checks.storage.message).toContain('Connection failed')
  })

  it('should run checks in parallel', async () => {
    let storageStarted = false
    let executorStarted = false

    const checkStorage = vi.fn().mockImplementation(async () => {
      storageStarted = true
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { status: 'healthy', latency: 10 }
    })

    const checkExecutor = vi.fn().mockImplementation(async () => {
      executorStarted = true
      // If running sequentially, storageStarted would be true before this runs
      return { status: 'healthy', latency: 5 }
    })

    const start = Date.now()
    await handleStatus({ checkStorage, checkExecutor })
    const duration = Date.now() - start

    // Both should have started
    expect(storageStarted).toBe(true)
    expect(executorStarted).toBe(true)

    // If parallel, should complete in ~10ms, not 15ms
    expect(duration).toBeLessThan(20)
  })

  it('should accept optional requestId for tracing', async () => {
    const result = await handleStatus({ requestId: 'req-456' })

    expect(result.status).toBe(200)
  })
})

// =============================================================================
// Uptime Tracking Tests
// =============================================================================
describe('Uptime Tracking', () => {
  it('should export getUptime function', () => {
    expect(typeof getUptime).toBe('function')
  })

  it('should return uptime in seconds', () => {
    const uptime = getUptime()

    expect(typeof uptime).toBe('number')
    expect(uptime).toBeGreaterThanOrEqual(0)
  })

  it('should increase over time', async () => {
    const uptime1 = getUptime()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const uptime2 = getUptime()

    // Should be the same or slightly higher (within same second)
    expect(uptime2).toBeGreaterThanOrEqual(uptime1)
  })
})

// =============================================================================
// Service Version Tests
// =============================================================================
describe('Service Version', () => {
  it('should export SERVICE_VERSION constant', () => {
    expect(typeof SERVICE_VERSION).toBe('string')
  })

  it('should be a valid semver format', () => {
    // Basic semver pattern: major.minor.patch
    expect(SERVICE_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('should be included in status response', async () => {
    const result = await handleStatus()

    expect(result.data!.version).toBe(SERVICE_VERSION)
  })
})

// =============================================================================
// Route Handler Interface Tests
// =============================================================================
describe('Health Route Handler Interface', () => {
  it('should export all health route handlers from a single module', async () => {
    const handlers = await import('../../src/worker/routes/health.js')

    expect(handlers).toHaveProperty('handleHealth')
    expect(handlers).toHaveProperty('handleStatus')
    expect(handlers).toHaveProperty('getUptime')
    expect(handlers).toHaveProperty('SERVICE_VERSION')
  })

  it('should have consistent return type across handlers', async () => {
    const healthResult = await handleHealth()
    const statusResult = await handleStatus()

    // Both should have status property
    expect(healthResult).toHaveProperty('status')
    expect(statusResult).toHaveProperty('status')

    // Both should have data property on success
    expect(healthResult).toHaveProperty('data')
    expect(statusResult).toHaveProperty('data')
  })

  it('health response should have correct shape', async () => {
    const result = await handleHealth()

    expect(result.data).toMatchObject({
      healthy: expect.any(Boolean),
      timestamp: expect.any(String),
    })
  })

  it('status response should have correct shape', async () => {
    const result = await handleStatus()

    expect(result.data).toMatchObject({
      status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
      version: expect.any(String),
      uptime: expect.any(Number),
      timestamp: expect.any(String),
      checks: {
        storage: expect.objectContaining({
          status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
        }),
        executor: expect.objectContaining({
          status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
        }),
      },
    })
  })
})

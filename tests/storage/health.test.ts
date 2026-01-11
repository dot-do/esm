/**
 * RED tests for Storage Health Check - esm-stor.14
 *
 * These tests define the expected interface and behavior for storage health checks.
 * Tests are written to FAIL until implementation exists.
 *
 * The storage health check is used by the /health endpoint to verify storage connectivity.
 * It should:
 * - Perform a lightweight connectivity check
 * - Return latency information
 * - Indicate healthy/degraded/unhealthy status
 * - Handle timeout scenarios
 * - Work with different storage backends (GitxStorage, CloudflareStorage)
 *
 * Related issues:
 * - esm-stor.14: RED tests for storage health check (this file)
 * - esm-stor.17: GREEN implementation for storage health
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModuleStorage, StoredModule, WriteResult, ModuleVersion } from '../../src/storage/types.js'

// =============================================================================
// Type definitions for storage health check
// =============================================================================

/**
 * Result of a storage health check
 */
interface StorageHealthResult {
  /** Status of the storage: healthy, degraded, or unhealthy */
  status: 'healthy' | 'degraded' | 'unhealthy'
  /** Latency in milliseconds (if check succeeded) */
  latency?: number
  /** Optional message with details */
  message?: string
  /** Timestamp when check was performed */
  timestamp: string
}

/**
 * Options for configuring health check behavior
 */
interface HealthCheckOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number
  /** Whether to include detailed diagnostics */
  verbose?: boolean
}

/**
 * Interface for storage that supports health checks
 */
interface HealthCheckableStorage extends ModuleStorage {
  /** Perform a health check on the storage */
  healthCheck(options?: HealthCheckOptions): Promise<StorageHealthResult>
}

/**
 * StorageHealthChecker - NOT YET IMPLEMENTED
 * This import will fail until the implementation exists.
 */
// @ts-expect-error - StorageHealthChecker not yet implemented
import { StorageHealthChecker, createStorageHealthCheck } from '../../src/storage/health.js'

// =============================================================================
// Mock storage helpers
// =============================================================================

function createMockStorage(options: {
  readLatency?: number
  shouldFail?: boolean
  errorMessage?: string
} = {}): ModuleStorage {
  const { readLatency = 10, shouldFail = false, errorMessage = 'Storage unavailable' } = options

  return {
    async read(name: string, version?: string): Promise<StoredModule | null> {
      await new Promise(resolve => setTimeout(resolve, readLatency))
      if (shouldFail) {
        throw new Error(errorMessage)
      }
      return null
    },
    async write(name: string, module: StoredModule): Promise<WriteResult> {
      if (shouldFail) throw new Error(errorMessage)
      return { version: 'test-version', name }
    },
    async delete(name: string): Promise<void> {
      if (shouldFail) throw new Error(errorMessage)
    },
    async list(pattern?: string): Promise<string[]> {
      if (shouldFail) throw new Error(errorMessage)
      return []
    },
    async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
      if (shouldFail) throw new Error(errorMessage)
      return []
    },
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('StorageHealthChecker', () => {
  describe('constructor', () => {
    it('should accept a ModuleStorage instance', () => {
      const mockStorage = createMockStorage()
      const checker = new StorageHealthChecker(mockStorage)
      expect(checker).toBeDefined()
      expect(checker).toBeInstanceOf(StorageHealthChecker)
    })

    it('should accept optional configuration', () => {
      const mockStorage = createMockStorage()
      const checker = new StorageHealthChecker(mockStorage, {
        defaultTimeout: 3000,
        healthyLatencyThreshold: 100,
        degradedLatencyThreshold: 500,
      })
      expect(checker).toBeDefined()
    })

    it('should throw if storage is null or undefined', () => {
      // @ts-expect-error - Testing invalid input
      expect(() => new StorageHealthChecker(null)).toThrow()
      // @ts-expect-error - Testing invalid input
      expect(() => new StorageHealthChecker(undefined)).toThrow()
    })
  })

  describe('check()', () => {
    it('should return healthy status when storage is responsive', async () => {
      const mockStorage = createMockStorage({ readLatency: 5 })
      const checker = new StorageHealthChecker(mockStorage)

      const result = await checker.check()

      expect(result.status).toBe('healthy')
      expect(result.latency).toBeDefined()
      expect(result.latency).toBeLessThan(100)
      expect(result.timestamp).toBeDefined()
    })

    it('should include latency measurement in milliseconds', async () => {
      const mockStorage = createMockStorage({ readLatency: 50 })
      const checker = new StorageHealthChecker(mockStorage)

      const result = await checker.check()

      expect(result.latency).toBeDefined()
      expect(typeof result.latency).toBe('number')
      expect(result.latency).toBeGreaterThanOrEqual(50)
      expect(result.latency).toBeLessThan(200) // Allow some variance
    })

    it('should return degraded status when latency is high', async () => {
      const mockStorage = createMockStorage({ readLatency: 300 })
      const checker = new StorageHealthChecker(mockStorage, {
        healthyLatencyThreshold: 100,
        degradedLatencyThreshold: 500,
      })

      const result = await checker.check()

      expect(result.status).toBe('degraded')
      expect(result.message).toContain('latency')
    })

    it('should return unhealthy status when storage throws error', async () => {
      const mockStorage = createMockStorage({
        shouldFail: true,
        errorMessage: 'Connection refused',
      })
      const checker = new StorageHealthChecker(mockStorage)

      const result = await checker.check()

      expect(result.status).toBe('unhealthy')
      expect(result.message).toContain('Connection refused')
    })

    it('should return unhealthy status when check times out', async () => {
      const mockStorage = createMockStorage({ readLatency: 10000 }) // Very slow
      const checker = new StorageHealthChecker(mockStorage)

      const result = await checker.check({ timeout: 100 })

      expect(result.status).toBe('unhealthy')
      expect(result.message).toContain('timeout')
    })

    it('should include ISO timestamp in result', async () => {
      const mockStorage = createMockStorage()
      const checker = new StorageHealthChecker(mockStorage)

      const result = await checker.check()

      expect(result.timestamp).toBeDefined()
      expect(typeof result.timestamp).toBe('string')
      // Verify it's a valid ISO date
      expect(() => new Date(result.timestamp)).not.toThrow()
    })

    it('should accept timeout option to override default', async () => {
      const mockStorage = createMockStorage({ readLatency: 50 })
      const checker = new StorageHealthChecker(mockStorage, {
        defaultTimeout: 10000, // Long default
      })

      // Override with short timeout
      const result = await checker.check({ timeout: 10 })

      // Should timeout because latency (50ms) > timeout (10ms)
      expect(result.status).toBe('unhealthy')
    })

    it('should not modify storage state during check', async () => {
      const mockStorage = createMockStorage()
      const writeSpy = vi.spyOn(mockStorage, 'write')
      const deleteSpy = vi.spyOn(mockStorage, 'delete')

      const checker = new StorageHealthChecker(mockStorage)
      await checker.check()

      expect(writeSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
    })
  })

  describe('checkConnectivity()', () => {
    it('should verify basic storage connectivity', async () => {
      const mockStorage = createMockStorage()
      const checker = new StorageHealthChecker(mockStorage)

      const isConnected = await checker.checkConnectivity()

      expect(typeof isConnected).toBe('boolean')
      expect(isConnected).toBe(true)
    })

    it('should return false when storage is unreachable', async () => {
      const mockStorage = createMockStorage({ shouldFail: true })
      const checker = new StorageHealthChecker(mockStorage)

      const isConnected = await checker.checkConnectivity()

      expect(isConnected).toBe(false)
    })

    it('should be a fast lightweight check', async () => {
      const mockStorage = createMockStorage({ readLatency: 5 })
      const checker = new StorageHealthChecker(mockStorage)

      const start = Date.now()
      await checker.checkConnectivity()
      const duration = Date.now() - start

      expect(duration).toBeLessThan(100)
    })
  })

  describe('getLatency()', () => {
    it('should measure and return storage latency', async () => {
      const mockStorage = createMockStorage({ readLatency: 25 })
      const checker = new StorageHealthChecker(mockStorage)

      const latency = await checker.getLatency()

      expect(typeof latency).toBe('number')
      expect(latency).toBeGreaterThanOrEqual(25)
      expect(latency).toBeLessThan(100)
    })

    it('should throw when storage is unreachable', async () => {
      const mockStorage = createMockStorage({ shouldFail: true })
      const checker = new StorageHealthChecker(mockStorage)

      await expect(checker.getLatency()).rejects.toThrow()
    })
  })
})

describe('createStorageHealthCheck()', () => {
  it('should be a factory function for creating health check callbacks', () => {
    expect(typeof createStorageHealthCheck).toBe('function')
  })

  it('should return a function compatible with handleStatus checkStorage', async () => {
    const mockStorage = createMockStorage()
    const healthCheck = createStorageHealthCheck(mockStorage)

    expect(typeof healthCheck).toBe('function')

    const result = await healthCheck()

    expect(result).toHaveProperty('status')
    expect(result.status).toMatch(/^(healthy|degraded|unhealthy)$/)
  })

  it('should create check with custom latency thresholds', async () => {
    const mockStorage = createMockStorage({ readLatency: 150 })
    const healthCheck = createStorageHealthCheck(mockStorage, {
      healthyLatencyThreshold: 100,
      degradedLatencyThreshold: 200,
    })

    const result = await healthCheck()

    expect(result.status).toBe('degraded')
  })

  it('should include latency in result for healthy storage', async () => {
    const mockStorage = createMockStorage({ readLatency: 10 })
    const healthCheck = createStorageHealthCheck(mockStorage)

    const result = await healthCheck()

    expect(result.latency).toBeDefined()
    expect(typeof result.latency).toBe('number')
  })

  it('should include error message for unhealthy storage', async () => {
    const mockStorage = createMockStorage({
      shouldFail: true,
      errorMessage: 'Database connection lost',
    })
    const healthCheck = createStorageHealthCheck(mockStorage)

    const result = await healthCheck()

    expect(result.status).toBe('unhealthy')
    expect(result.message).toContain('Database connection lost')
  })
})

describe('HealthCheckableStorage interface', () => {
  it('should extend ModuleStorage with healthCheck method', async () => {
    // This test verifies that storage implementations can add healthCheck
    // capability while still implementing ModuleStorage

    const mockStorage = createMockStorage() as HealthCheckableStorage

    // Add healthCheck method (simulating what implementation would do)
    mockStorage.healthCheck = async (options?: HealthCheckOptions) => ({
      status: 'healthy',
      latency: 5,
      timestamp: new Date().toISOString(),
    })

    // Should still work as ModuleStorage
    const readResult = await mockStorage.read('@test/module')
    expect(readResult).toBeNull() // Mock returns null

    // Should work as HealthCheckableStorage
    const healthResult = await mockStorage.healthCheck()
    expect(healthResult.status).toBe('healthy')
  })
})

describe('Integration with health routes', () => {
  it('should produce results compatible with ServiceCheck type', async () => {
    const mockStorage = createMockStorage()
    const healthCheck = createStorageHealthCheck(mockStorage)

    const result = await healthCheck()

    // ServiceCheck interface from health routes
    expect(result).toHaveProperty('status')
    expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status)

    if (result.latency !== undefined) {
      expect(typeof result.latency).toBe('number')
    }

    if (result.message !== undefined) {
      expect(typeof result.message).toBe('string')
    }
  })

  it('should be usable as checkStorage parameter in handleStatus', async () => {
    // This test verifies integration with the health routes
    // The createStorageHealthCheck should return a function that can be
    // passed directly to handleStatus({ checkStorage })

    const mockStorage = createMockStorage({ readLatency: 10 })
    const checkStorage = createStorageHealthCheck(mockStorage)

    // Simulate what handleStatus does
    const result = await checkStorage()

    expect(result).toMatchObject({
      status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
    })
  })
})

describe('Edge cases and error handling', () => {
  it('should handle storage that returns slowly but eventually succeeds', async () => {
    const mockStorage = createMockStorage({ readLatency: 200 })
    const checker = new StorageHealthChecker(mockStorage, {
      defaultTimeout: 5000,
      healthyLatencyThreshold: 100,
      degradedLatencyThreshold: 500,
    })

    const result = await checker.check()

    // Slow but successful should be degraded, not unhealthy
    expect(result.status).toBe('degraded')
    expect(result.latency).toBeGreaterThanOrEqual(200)
  })

  it('should handle concurrent health checks', async () => {
    const mockStorage = createMockStorage({ readLatency: 10 })
    const checker = new StorageHealthChecker(mockStorage)

    // Run multiple checks in parallel
    const results = await Promise.all([
      checker.check(),
      checker.check(),
      checker.check(),
    ])

    // All should succeed
    for (const result of results) {
      expect(result.status).toBe('healthy')
    }
  })

  it('should handle storage that intermittently fails', async () => {
    let callCount = 0
    const mockStorage = createMockStorage()

    // Override read to fail every other call
    mockStorage.read = async () => {
      callCount++
      if (callCount % 2 === 0) {
        throw new Error('Intermittent failure')
      }
      return null
    }

    const checker = new StorageHealthChecker(mockStorage)

    const result1 = await checker.check()
    const result2 = await checker.check()

    expect(result1.status).toBe('healthy')
    expect(result2.status).toBe('unhealthy')
  })

  it('should handle very fast storage (near-zero latency)', async () => {
    const mockStorage = createMockStorage({ readLatency: 0 })
    const checker = new StorageHealthChecker(mockStorage)

    const result = await checker.check()

    expect(result.status).toBe('healthy')
    expect(result.latency).toBeDefined()
    expect(result.latency).toBeGreaterThanOrEqual(0)
  })

  it('should provide meaningful error context on failure', async () => {
    const mockStorage = createMockStorage({
      shouldFail: true,
      errorMessage: 'ECONNREFUSED: Connection refused to localhost:5432',
    })
    const checker = new StorageHealthChecker(mockStorage)

    const result = await checker.check()

    expect(result.status).toBe('unhealthy')
    expect(result.message).toContain('ECONNREFUSED')
    expect(result.message).toContain('localhost:5432')
  })
})

describe('Configuration options', () => {
  it('should support configurable healthy latency threshold', async () => {
    const mockStorage = createMockStorage({ readLatency: 50 })

    // With default threshold (probably 100ms), this should be healthy
    const checker1 = new StorageHealthChecker(mockStorage, {
      healthyLatencyThreshold: 100,
      degradedLatencyThreshold: 500,
    })
    const result1 = await checker1.check()
    expect(result1.status).toBe('healthy')

    // With stricter threshold, this should be degraded
    const checker2 = new StorageHealthChecker(mockStorage, {
      healthyLatencyThreshold: 10,
      degradedLatencyThreshold: 500,
    })
    const result2 = await checker2.check()
    expect(result2.status).toBe('degraded')
  })

  it('should support configurable degraded latency threshold', async () => {
    const mockStorage = createMockStorage({ readLatency: 300 })

    // With high threshold, this should be degraded
    const checker1 = new StorageHealthChecker(mockStorage, {
      healthyLatencyThreshold: 100,
      degradedLatencyThreshold: 500,
    })
    const result1 = await checker1.check()
    expect(result1.status).toBe('degraded')

    // With low threshold, this should be unhealthy
    const checker2 = new StorageHealthChecker(mockStorage, {
      healthyLatencyThreshold: 100,
      degradedLatencyThreshold: 200,
    })
    const result2 = await checker2.check()
    expect(result2.status).toBe('unhealthy')
  })

  it('should support verbose mode with additional diagnostics', async () => {
    const mockStorage = createMockStorage()
    const checker = new StorageHealthChecker(mockStorage)

    const result = await checker.check({ verbose: true })

    expect(result).toBeDefined()
    // In verbose mode, message should include additional details
    if (result.message) {
      expect(typeof result.message).toBe('string')
    }
  })
})

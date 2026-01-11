/**
 * Storage Health Check implementation for esm.do
 *
 * Provides health checking capabilities for ModuleStorage implementations.
 * Used by the /health endpoint to verify storage connectivity.
 *
 * Related issues:
 * - esm-stor.14: RED tests for storage health check
 * - esm-stor.17: GREEN implementation for storage health
 */

import type { ModuleStorage } from './types.js'

/**
 * Result of a storage health check
 */
export interface StorageHealthResult {
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
export interface HealthCheckOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number
  /** Whether to include detailed diagnostics */
  verbose?: boolean
}

/**
 * Configuration for StorageHealthChecker
 */
export interface StorageHealthCheckerConfig {
  /** Default timeout in milliseconds */
  defaultTimeout?: number
  /** Latency threshold for healthy status (ms) */
  healthyLatencyThreshold?: number
  /** Latency threshold for degraded status (ms) - above this is unhealthy */
  degradedLatencyThreshold?: number
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<StorageHealthCheckerConfig> = {
  defaultTimeout: 5000,
  healthyLatencyThreshold: 100,
  degradedLatencyThreshold: 500,
}

/**
 * StorageHealthChecker - Performs health checks on ModuleStorage implementations
 *
 * This class wraps a ModuleStorage instance and provides methods to check
 * its health status, connectivity, and latency.
 */
export class StorageHealthChecker {
  private storage: ModuleStorage
  private config: Required<StorageHealthCheckerConfig>

  /**
   * Create a new StorageHealthChecker
   * @param storage The ModuleStorage instance to check
   * @param config Optional configuration
   */
  constructor(storage: ModuleStorage, config?: StorageHealthCheckerConfig) {
    if (storage === null || storage === undefined) {
      throw new Error('Storage instance is required')
    }
    this.storage = storage
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Perform a full health check on the storage
   * @param options Optional check options
   * @returns Health check result with status, latency, and timestamp
   */
  async check(options?: HealthCheckOptions): Promise<StorageHealthResult> {
    const timeout = options?.timeout ?? this.config.defaultTimeout
    const verbose = options?.verbose ?? false
    const timestamp = new Date().toISOString()

    try {
      const latency = await this.measureLatency(timeout)

      // Determine status based on latency thresholds
      let status: StorageHealthResult['status']
      let message: string | undefined

      if (latency <= this.config.healthyLatencyThreshold) {
        status = 'healthy'
        if (verbose) {
          message = `Storage responding normally with ${latency}ms latency`
        }
      } else if (latency <= this.config.degradedLatencyThreshold) {
        status = 'degraded'
        message = `High latency detected: ${latency}ms`
      } else {
        status = 'unhealthy'
        message = `Latency ${latency}ms exceeds threshold of ${this.config.degradedLatencyThreshold}ms`
      }

      const result: StorageHealthResult = {
        status,
        latency,
        timestamp,
      }
      if (message) result.message = message
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout')

      return {
        status: 'unhealthy',
        message: isTimeout ? `Health check timeout after ${timeout}ms` : errorMessage,
        timestamp,
      }
    }
  }

  /**
   * Check basic storage connectivity
   * @returns true if storage is reachable, false otherwise
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      // Use a short timeout for connectivity check
      await this.measureLatency(Math.min(this.config.defaultTimeout, 1000))
      return true
    } catch {
      return false
    }
  }

  /**
   * Measure storage latency
   * @returns Latency in milliseconds
   * @throws If storage is unreachable or times out
   */
  async getLatency(): Promise<number> {
    return this.measureLatency(this.config.defaultTimeout)
  }

  /**
   * Internal method to measure latency with timeout
   */
  private async measureLatency(timeout: number): Promise<number> {
    const start = performance.now()

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout after ${timeout}ms`))
      }, timeout)
    })

    // Perform a lightweight read operation to check connectivity
    // Using a special health check key that should return null quickly
    const checkPromise = this.storage.read('__health_check__')

    // Race between the check and timeout
    await Promise.race([checkPromise, timeoutPromise])

    const end = performance.now()
    return Math.round(end - start)
  }
}

/**
 * Factory function to create a health check callback compatible with handleStatus
 *
 * @param storage The ModuleStorage instance to check
 * @param config Optional configuration for thresholds
 * @returns A function that performs health checks and returns StorageHealthResult
 */
export function createStorageHealthCheck(
  storage: ModuleStorage,
  config?: StorageHealthCheckerConfig
): () => Promise<StorageHealthResult> {
  const checker = new StorageHealthChecker(storage, config)

  return async () => {
    return checker.check()
  }
}

/**
 * Prometheus Metrics Middleware for ESM Module System
 *
 * Provides comprehensive metrics collection for monitoring esm.do:
 * - Request duration histogram
 * - Request counter by status
 * - Active connections gauge
 * - Module execution metrics
 * - Cache hit/miss tracking
 * - TypeScript compilation metrics
 * - Sandbox violation tracking
 */

import type { Context, Middleware } from './chain.js'

// =============================================================================
// Types
// =============================================================================

export interface MetricsConfig {
  /** Prefix for all metric names (default: 'esm') */
  prefix: string
  /** Labels to add to all metrics */
  defaultLabels: Record<string, string>
  /** Histogram buckets for request duration in seconds */
  durationBuckets: number[]
  /** Histogram buckets for module execution duration in seconds */
  executionBuckets: number[]
  /** Enable detailed path-based metrics (can cause high cardinality) */
  enablePathMetrics: boolean
  /** Maximum number of unique paths to track (to prevent cardinality explosion) */
  maxPathCardinality: number
}

export interface Counter {
  inc(labels?: Record<string, string>, value?: number): void
  get(labels?: Record<string, string>): number
}

export interface Gauge {
  inc(labels?: Record<string, string>, value?: number): void
  dec(labels?: Record<string, string>, value?: number): void
  set(value: number, labels?: Record<string, string>): void
  get(labels?: Record<string, string>): number
}

export interface Histogram {
  observe(labels: Record<string, string>, value: number): void
  getBuckets(labels?: Record<string, string>): Map<number, number>
  getSum(labels?: Record<string, string>): number
  getCount(labels?: Record<string, string>): number
}

export interface MetricsRegistry {
  /** HTTP request duration histogram */
  httpRequestDuration: Histogram
  /** HTTP request counter */
  httpRequestsTotal: Counter
  /** Active connections gauge */
  activeConnections: Gauge
  /** Module execution duration histogram */
  moduleExecutionDuration: Histogram
  /** Module executions counter */
  moduleExecutionsTotal: Counter
  /** Module cache hits counter */
  moduleCacheHits: Counter
  /** Module cache misses counter */
  moduleCacheMisses: Counter
  /** TypeScript compilations counter */
  typescriptCompilations: Counter
  /** Sandbox violations counter */
  sandboxViolations: Counter
  /** Get all metrics in Prometheus exposition format */
  getMetrics(): string
  /** Reset all metrics */
  reset(): void
}

export interface MetricsMiddleware {
  /** Middleware function for request handling */
  middleware: Middleware
  /** Record a module execution */
  recordModuleExecution(module: string, status: 'success' | 'error', duration: number): void
  /** Record a cache hit */
  recordCacheHit(module: string): void
  /** Record a cache miss */
  recordCacheMiss(module: string): void
  /** Record a TypeScript compilation */
  recordTypeScriptCompilation(status: 'success' | 'error'): void
  /** Record a sandbox violation */
  recordSandboxViolation(violationType: string): void
  /** Increment active connections */
  incrementConnections(): void
  /** Decrement active connections */
  decrementConnections(): void
  /** Get the metrics registry */
  getRegistry(): MetricsRegistry
  /** Get metrics in Prometheus exposition format */
  getMetrics(): string
  /** Get the configuration */
  getConfig(): MetricsConfig
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: MetricsConfig = {
  prefix: 'esm',
  defaultLabels: {},
  durationBuckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  executionBuckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60],
  enablePathMetrics: false,
  maxPathCardinality: 100,
}

// =============================================================================
// Internal Metric Implementations
// =============================================================================

function createLabelsKey(labels: Record<string, string>): string {
  const sortedKeys = Object.keys(labels).sort()
  return sortedKeys.map((k) => `${k}="${labels[k]}"`).join(',')
}

function createCounter(name: string, help: string): Counter & { serialize(prefix: string): string } {
  const values = new Map<string, number>()

  return {
    inc(labels: Record<string, string> = {}, value = 1): void {
      const key = createLabelsKey(labels)
      values.set(key, (values.get(key) || 0) + value)
    },
    get(labels: Record<string, string> = {}): number {
      return values.get(createLabelsKey(labels)) || 0
    },
    serialize(prefix: string): string {
      const lines: string[] = []
      lines.push(`# HELP ${prefix}_${name} ${help}`)
      lines.push(`# TYPE ${prefix}_${name} counter`)

      if (values.size === 0) {
        lines.push(`${prefix}_${name} 0`)
      } else {
        for (const [labelsKey, value] of values) {
          const labelsPart = labelsKey ? `{${labelsKey}}` : ''
          lines.push(`${prefix}_${name}${labelsPart} ${value}`)
        }
      }

      return lines.join('\n')
    },
  }
}

function createGauge(name: string, help: string): Gauge & { serialize(prefix: string): string } {
  const values = new Map<string, number>()

  return {
    inc(labels: Record<string, string> = {}, value = 1): void {
      const key = createLabelsKey(labels)
      values.set(key, (values.get(key) || 0) + value)
    },
    dec(labels: Record<string, string> = {}, value = 1): void {
      const key = createLabelsKey(labels)
      values.set(key, (values.get(key) || 0) - value)
    },
    set(value: number, labels: Record<string, string> = {}): void {
      values.set(createLabelsKey(labels), value)
    },
    get(labels: Record<string, string> = {}): number {
      return values.get(createLabelsKey(labels)) || 0
    },
    serialize(prefix: string): string {
      const lines: string[] = []
      lines.push(`# HELP ${prefix}_${name} ${help}`)
      lines.push(`# TYPE ${prefix}_${name} gauge`)

      if (values.size === 0) {
        lines.push(`${prefix}_${name} 0`)
      } else {
        for (const [labelsKey, value] of values) {
          const labelsPart = labelsKey ? `{${labelsKey}}` : ''
          lines.push(`${prefix}_${name}${labelsPart} ${value}`)
        }
      }

      return lines.join('\n')
    },
  }
}

function createHistogram(
  name: string,
  help: string,
  buckets: number[]
): Histogram & { serialize(prefix: string): string } {
  const sortedBuckets = [...buckets].sort((a, b) => a - b)
  const observations = new Map<
    string,
    {
      buckets: Map<number, number>
      sum: number
      count: number
    }
  >()

  function getOrCreateObservation(labelsKey: string) {
    let obs = observations.get(labelsKey)
    if (!obs) {
      obs = {
        buckets: new Map(sortedBuckets.map((b) => [b, 0])),
        sum: 0,
        count: 0,
      }
      observations.set(labelsKey, obs)
    }
    return obs
  }

  return {
    observe(labels: Record<string, string>, value: number): void {
      const key = createLabelsKey(labels)
      const obs = getOrCreateObservation(key)

      obs.sum += value
      obs.count += 1

      for (const bucket of sortedBuckets) {
        if (value <= bucket) {
          obs.buckets.set(bucket, (obs.buckets.get(bucket) || 0) + 1)
        }
      }
    },
    getBuckets(labels: Record<string, string> = {}): Map<number, number> {
      const obs = observations.get(createLabelsKey(labels))
      return obs ? new Map(obs.buckets) : new Map()
    },
    getSum(labels: Record<string, string> = {}): number {
      const obs = observations.get(createLabelsKey(labels))
      return obs ? obs.sum : 0
    },
    getCount(labels: Record<string, string> = {}): number {
      const obs = observations.get(createLabelsKey(labels))
      return obs ? obs.count : 0
    },
    serialize(prefix: string): string {
      const lines: string[] = []
      lines.push(`# HELP ${prefix}_${name} ${help}`)
      lines.push(`# TYPE ${prefix}_${name} histogram`)

      if (observations.size === 0) {
        // Output empty histogram
        for (const bucket of sortedBuckets) {
          lines.push(`${prefix}_${name}_bucket{le="${bucket}"} 0`)
        }
        lines.push(`${prefix}_${name}_bucket{le="+Inf"} 0`)
        lines.push(`${prefix}_${name}_sum 0`)
        lines.push(`${prefix}_${name}_count 0`)
      } else {
        for (const [labelsKey, obs] of observations) {
          const labelsPrefix = labelsKey ? `${labelsKey},` : ''

          // Cumulative bucket counts
          let cumulative = 0
          for (const bucket of sortedBuckets) {
            cumulative += obs.buckets.get(bucket) || 0
            lines.push(`${prefix}_${name}_bucket{${labelsPrefix}le="${bucket}"} ${cumulative}`)
          }
          lines.push(`${prefix}_${name}_bucket{${labelsPrefix}le="+Inf"} ${obs.count}`)
          lines.push(
            `${prefix}_${name}_sum{${labelsKey ? labelsKey : ''}} ${obs.sum}`.replace('{}', '')
          )
          lines.push(
            `${prefix}_${name}_count{${labelsKey ? labelsKey : ''}} ${obs.count}`.replace('{}', '')
          )
        }
      }

      return lines.join('\n')
    },
  }
}

// =============================================================================
// Metrics Registry Factory
// =============================================================================

function createMetricsRegistry(config: MetricsConfig): MetricsRegistry & { serialize(): string } {
  const httpRequestDuration = createHistogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    config.durationBuckets
  )

  const httpRequestsTotal = createCounter(
    'http_requests_total',
    'Total number of HTTP requests'
  )

  const activeConnections = createGauge(
    'active_connections',
    'Number of active connections'
  )

  const moduleExecutionDuration = createHistogram(
    'module_execution_duration_seconds',
    'Module execution duration in seconds',
    config.executionBuckets
  )

  const moduleExecutionsTotal = createCounter(
    'module_executions_total',
    'Total number of module executions'
  )

  const moduleCacheHits = createCounter('module_cache_hits_total', 'Total module cache hits')

  const moduleCacheMisses = createCounter('module_cache_misses_total', 'Total module cache misses')

  const typescriptCompilations = createCounter(
    'typescript_compilations_total',
    'Total TypeScript compilations'
  )

  const sandboxViolations = createCounter(
    'sandbox_violations_total',
    'Total sandbox violations'
  )

  return {
    httpRequestDuration,
    httpRequestsTotal,
    activeConnections,
    moduleExecutionDuration,
    moduleExecutionsTotal,
    moduleCacheHits,
    moduleCacheMisses,
    typescriptCompilations,
    sandboxViolations,
    getMetrics(): string {
      return this.serialize()
    },
    serialize(): string {
      const prefix = config.prefix
      const parts = [
        httpRequestDuration.serialize(prefix),
        httpRequestsTotal.serialize(prefix),
        activeConnections.serialize(prefix),
        moduleExecutionDuration.serialize(prefix),
        moduleExecutionsTotal.serialize(prefix),
        moduleCacheHits.serialize(prefix),
        moduleCacheMisses.serialize(prefix),
        typescriptCompilations.serialize(prefix),
        sandboxViolations.serialize(prefix),
      ]
      return parts.join('\n\n')
    },
    reset(): void {
      // Note: In a real implementation, we'd need to clear all metrics
      // For now, this is a placeholder
    },
  }
}

// =============================================================================
// Metrics Middleware Factory
// =============================================================================

/**
 * Creates a Prometheus metrics middleware instance.
 *
 * @param config - Partial metrics configuration to override defaults
 * @returns MetricsMiddleware instance
 */
export function createMetricsMiddleware(config?: Partial<MetricsConfig>): MetricsMiddleware {
  const mergedConfig: MetricsConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    defaultLabels: {
      ...DEFAULT_CONFIG.defaultLabels,
      ...config?.defaultLabels,
    },
  }

  const registry = createMetricsRegistry(mergedConfig)
  const trackedPaths = new Set<string>()

  /**
   * Normalize path for metrics to prevent cardinality explosion.
   * Replaces dynamic segments with placeholders.
   */
  function normalizePath(path: string): string {
    if (!mergedConfig.enablePathMetrics) {
      return ''
    }

    // Replace common dynamic patterns
    let normalized = path
      // UUID patterns
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
      // Numeric IDs
      .replace(/\/\d+/g, '/:id')
      // Hash-like strings (32+ hex chars)
      .replace(/\/[0-9a-f]{32,}/gi, '/:hash')
      // Version patterns
      .replace(/\/v\d+(\.\d+)*\//g, '/:version/')

    // Check cardinality limit
    if (trackedPaths.size >= mergedConfig.maxPathCardinality && !trackedPaths.has(normalized)) {
      return '/other'
    }

    trackedPaths.add(normalized)
    return normalized
  }

  /**
   * Get status category (2xx, 3xx, 4xx, 5xx)
   */
  function getStatusCategory(status: number): string {
    if (status >= 200 && status < 300) return '2xx'
    if (status >= 300 && status < 400) return '3xx'
    if (status >= 400 && status < 500) return '4xx'
    if (status >= 500) return '5xx'
    return 'other'
  }

  /**
   * The middleware function that wraps request handling.
   */
  const middleware: Middleware = async (ctx: Context, next: () => Promise<Response>) => {
    const startTime = performance.now()
    const method = ctx.request.method
    const url = new URL(ctx.request.url)
    const path = normalizePath(url.pathname)

    // Increment active connections
    registry.activeConnections.inc()

    let response: Response
    let status = 500

    try {
      response = await next()
      status = response.status
    } catch (error) {
      status = 500
      throw error
    } finally {
      // Decrement active connections
      registry.activeConnections.dec()

      // Calculate duration in seconds
      const duration = (performance.now() - startTime) / 1000

      // Build labels
      const labels: Record<string, string> = {
        method,
        status: String(status),
        status_category: getStatusCategory(status),
        ...mergedConfig.defaultLabels,
      }

      if (path) {
        labels.path = path
      }

      // Record metrics
      registry.httpRequestDuration.observe(labels, duration)
      registry.httpRequestsTotal.inc(labels)
    }

    return response!
  }

  return {
    middleware,

    recordModuleExecution(module: string, status: 'success' | 'error', duration: number): void {
      const labels = { module, status, ...mergedConfig.defaultLabels }
      registry.moduleExecutionDuration.observe(labels, duration)
      registry.moduleExecutionsTotal.inc(labels)
    },

    recordCacheHit(module: string): void {
      registry.moduleCacheHits.inc({ module, ...mergedConfig.defaultLabels })
    },

    recordCacheMiss(module: string): void {
      registry.moduleCacheMisses.inc({ module, ...mergedConfig.defaultLabels })
    },

    recordTypeScriptCompilation(status: 'success' | 'error'): void {
      registry.typescriptCompilations.inc({ status, ...mergedConfig.defaultLabels })
    },

    recordSandboxViolation(violationType: string): void {
      registry.sandboxViolations.inc({
        violation_type: violationType,
        ...mergedConfig.defaultLabels,
      })
    },

    incrementConnections(): void {
      registry.activeConnections.inc()
    },

    decrementConnections(): void {
      registry.activeConnections.dec()
    },

    getRegistry(): MetricsRegistry {
      return registry
    },

    getMetrics(): string {
      return registry.getMetrics()
    },

    getConfig(): MetricsConfig {
      return { ...mergedConfig }
    },
  }
}

// =============================================================================
// Metrics Endpoint Handler
// =============================================================================

/**
 * Creates a handler for the /metrics endpoint.
 *
 * @param metricsMiddleware - The metrics middleware instance
 * @returns Response handler for metrics endpoint
 */
export function createMetricsHandler(
  metricsMiddleware: MetricsMiddleware
): () => Response {
  return () => {
    const metrics = metricsMiddleware.getMetrics()
    return new Response(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  }
}

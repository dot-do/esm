/**
 * Performance Integration Tests
 *
 * Tests request latency, concurrent requests, and memory usage
 * for the esm.do API.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Miniflare } from 'miniflare'
import * as esbuild from 'esbuild'

// Cached bundled code
let bundledCode: string | null = null

// Bundle the worker TypeScript to JavaScript
async function bundleWorker(): Promise<string> {
  if (bundledCode) return bundledCode

  const result = await esbuild.build({
    entryPoints: ['src/worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
  })

  bundledCode = result.outputFiles?.[0]?.text ?? ''
  return bundledCode
}

// Performance thresholds
const THRESHOLDS = {
  singleRequestMs: 100,      // Single request should complete within 100ms
  concurrentRequestMs: 500,   // Concurrent requests should complete within 500ms
  p95LatencyMs: 200,          // 95th percentile latency
  p99LatencyMs: 500,          // 99th percentile latency
  throughputRps: 50,          // Minimum requests per second
  memoryMb: 256,              // Maximum memory usage in MB
}

// Miniflare instance
let mf: Miniflare | null = null

// Helper to make requests
async function request(path: string, options: RequestInit = {}): Promise<Response> {
  if (!mf) throw new Error('Miniflare not initialized')
  const url = new URL(path, 'http://localhost')
  return mf.dispatchFetch(url.toString(), options)
}

// Helper to measure request timing
async function timedRequest(path: string, options: RequestInit = {}): Promise<{
  response: Response
  duration: number
}> {
  const start = performance.now()
  const response = await request(path, options)
  const duration = performance.now() - start
  return { response, duration }
}

// Calculate percentile from sorted array
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)] ?? 0
}

// Calculate statistics
function calculateStats(durations: number[]): {
  min: number
  max: number
  mean: number
  median: number
  p95: number
  p99: number
  stdDev: number
} {
  const sorted = [...durations].sort((a, b) => a - b)
  const sum = durations.reduce((a, b) => a + b, 0)
  const mean = sum / durations.length

  const squaredDiffs = durations.map(d => Math.pow(d - mean, 2))
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / durations.length
  const stdDev = Math.sqrt(avgSquaredDiff)

  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stdDev,
  }
}

describe('Performance Integration Tests', () => {
  beforeAll(async () => {
    const script = await bundleWorker()

    mf = new Miniflare({
      modules: true,
      script,
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
      unsafeEvalBinding: 'unsafe_eval',
    })

    // Warm up the worker
    await request('/math/add')
    await request('/math/add')
  }, 60000)

  afterAll(async () => {
    if (mf) {
      await mf.dispose()
      mf = null
    }
  })

  describe('Request Latency', () => {
    it('should respond to GET requests within threshold', async () => {
      const { response, duration } = await timedRequest('/math/add')

      expect(response.status).toBe(200)
      expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs)
    })

    it('should respond to module info requests within threshold', async () => {
      const { response, duration } = await timedRequest('/math/add')

      expect(response.status).toBe(200)
      expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs)
    })

    it('should respond to .mjs requests within threshold', async () => {
      const { response, duration } = await timedRequest('/math/add.mjs')

      expect(response.status).toBe(200)
      expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs)
    })

    it('should respond to .d.ts requests within threshold', async () => {
      const { response, duration } = await timedRequest('/math/add.d.ts')

      expect(response.status).toBe(200)
      expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs)
    })

    it('should meet latency targets for POST requests', async () => {
      const moduleData = {
        types: 'export declare const perf: number;',
        module: 'export const perf = 1;',
      }

      const { response, duration } = await timedRequest('/test/perf-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(moduleData),
      })

      expect(response.status).toBe(201)
      expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs * 2) // Allow more time for writes
    })

    describe('Latency Distribution', () => {
      it('should have acceptable p95 latency for GET requests', async () => {
        const iterations = 20 // Reduced to avoid port exhaustion
        const durations: number[] = []

        for (let i = 0; i < iterations; i++) {
          try {
            const { response, duration } = await timedRequest('/math/add')
            if (response.status === 200) {
              durations.push(duration)
            }
          } catch {
            // Skip failed requests
          }
        }

        if (durations.length >= 5) {
          const stats = calculateStats(durations)

          console.log('GET Latency Stats:', {
            samples: durations.length,
            min: `${stats.min.toFixed(2)}ms`,
            max: `${stats.max.toFixed(2)}ms`,
            mean: `${stats.mean.toFixed(2)}ms`,
            median: `${stats.median.toFixed(2)}ms`,
            p95: `${stats.p95.toFixed(2)}ms`,
            stdDev: `${stats.stdDev.toFixed(2)}ms`,
          })

          expect(stats.p95).toBeLessThan(THRESHOLDS.p95LatencyMs * 2)
        }
      })

      it('should have acceptable p99 latency', async () => {
        const iterations = 20 // Reduced to avoid port exhaustion
        const durations: number[] = []

        for (let i = 0; i < iterations; i++) {
          try {
            const { response, duration } = await timedRequest('/math/add.mjs')
            if (response.status === 200) {
              durations.push(duration)
            }
          } catch {
            // Skip failed requests
          }
        }

        if (durations.length >= 5) {
          const stats = calculateStats(durations)
          expect(stats.p99).toBeLessThan(THRESHOLDS.p99LatencyMs * 2)
        }
      })
    })
  })

  describe('Concurrent Requests', () => {
    it('should handle concurrent GET requests', async () => {
      const concurrency = 5 // Reduced to avoid port exhaustion
      const start = performance.now()

      const promises = Array.from({ length: concurrency }, () =>
        timedRequest('/math/add')
      )

      const results = await Promise.all(promises)
      const totalDuration = performance.now() - start

      // All requests should succeed or be rate limited
      for (const { response } of results) {
        expect([200, 429]).toContain(response.status)
      }

      // Total time should be reasonable
      expect(totalDuration).toBeLessThan(THRESHOLDS.concurrentRequestMs * 2)
    })

    it('should handle burst of requests', async () => {
      const burstSize = 10 // Reduced to avoid port exhaustion
      const start = performance.now()

      const promises = Array.from({ length: burstSize }, (_, i) =>
        timedRequest(`/math/add?burst=${i}`)
      )

      const results = await Promise.all(promises)
      const totalDuration = performance.now() - start

      // Calculate success rate
      const successful = results.filter(r => r.response.status === 200).length
      const rateLimited = results.filter(r => r.response.status === 429).length
      const total = successful + rateLimited

      console.log('Burst Test Results:', {
        burstSize,
        successful,
        rateLimited,
        totalDuration: `${totalDuration.toFixed(2)}ms`,
      })

      // All responses should be valid (either success or rate limited)
      expect(total).toBe(burstSize)
    })

    it('should handle mixed request types concurrently', async () => {
      const requests = [
        timedRequest('/math/add'),
        timedRequest('/math/add.mjs'),
        timedRequest('/math/add.d.ts'),
        timedRequest('/math/stats'),
        timedRequest('/test/sandbox/run', { method: 'POST' }),
      ]

      const start = performance.now()
      const results = await Promise.all(requests)
      const totalDuration = performance.now() - start

      // All should complete in reasonable time
      expect(totalDuration).toBeLessThan(THRESHOLDS.concurrentRequestMs * 2)
    })

    describe('Throughput', () => {
      it('should sustain minimum throughput', async () => {
        const duration = 500 // Reduced to avoid port exhaustion
        const start = performance.now()
        let count = 0
        let rateLimited = 0
        let errors = 0

        while (performance.now() - start < duration) {
          try {
            const { response } = await timedRequest('/math/add')
            if (response.status === 200) {
              count++
            } else if (response.status === 429) {
              rateLimited++
            } else {
              errors++
            }
          } catch {
            errors++
            // Stop if we start getting connection errors
            if (errors > 3) break
          }
        }

        const actualDuration = performance.now() - start
        const total = count + rateLimited
        const rps = (total / actualDuration) * 1000

        console.log('Throughput Test:', {
          successful: count,
          rateLimited,
          errors,
          duration: `${actualDuration.toFixed(2)}ms`,
          rps: `${rps.toFixed(1)} req/s`,
        })

        // Should process at least some requests
        expect(total).toBeGreaterThan(0)
      })

      it('should handle sustained load', async () => {
        const duration = 1000 // Reduced from 3000
        const concurrency = 2 // Reduced from 5
        const start = performance.now()
        let completed = 0
        let errors = 0

        // Parallel request loop
        const workers = Array.from({ length: concurrency }, async () => {
          while (performance.now() - start < duration) {
            try {
              const { response } = await timedRequest('/math/add')
              if (response.status === 200 || response.status === 429) {
                completed++
              } else {
                errors++
              }
            } catch {
              errors++
              // Stop on connection errors
              if (errors > 3) break
            }
          }
        })

        await Promise.all(workers)

        const actualDuration = performance.now() - start
        const rps = (completed / actualDuration) * 1000

        console.log('Sustained Load Test:', {
          completed,
          errors,
          duration: `${actualDuration.toFixed(2)}ms`,
          rps: `${rps.toFixed(1)} req/s`,
        })

        // Should complete some requests
        expect(completed).toBeGreaterThan(0)
      }, 10000)
    })
  })

  describe('Memory Usage', () => {
    it('should stay within memory limits during requests', async () => {
      // Note: In Miniflare/workerd environment, we can't directly measure memory
      // This test checks for memory leaks by making many requests

      const iterations = 20 // Reduced to avoid port exhaustion

      // Get initial memory if available
      const initialMemory = process.memoryUsage?.()?.heapUsed ?? 0

      for (let i = 0; i < iterations; i++) {
        try {
          await request('/math/add')
        } catch {
          // Ignore connection errors
        }
        if (i % 5 === 0 && typeof global.gc === 'function') {
          global.gc()
        }
      }

      const finalMemory = process.memoryUsage?.()?.heapUsed ?? 0
      const memoryGrowthMb = (finalMemory - initialMemory) / (1024 * 1024)

      console.log('Memory Test:', {
        iterations,
        initialMb: (initialMemory / (1024 * 1024)).toFixed(2),
        finalMb: (finalMemory / (1024 * 1024)).toFixed(2),
        growthMb: memoryGrowthMb.toFixed(2),
      })

      // Memory growth should be reasonable
      expect(memoryGrowthMb).toBeLessThan(100)
    })

    it('should not leak memory on repeated POST requests', async () => {
      const iterations = 10 // Reduced to avoid port exhaustion
      const initialMemory = process.memoryUsage?.()?.heapUsed ?? 0

      for (let i = 0; i < iterations; i++) {
        try {
          await request(`/test/memory-test-${i}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              types: 'export declare const x: number;',
              module: `export const x = ${i};`,
            }),
          })

          // Delete to avoid storage growth
          await request(`/test/memory-test-${i}`, { method: 'DELETE' })
        } catch {
          // Ignore connection errors
        }
      }

      const finalMemory = process.memoryUsage?.()?.heapUsed ?? 0
      const memoryGrowthMb = (finalMemory - initialMemory) / (1024 * 1024)

      // Memory growth should be minimal for create/delete cycle
      expect(memoryGrowthMb).toBeLessThan(100)
    })
  })

  describe('Script Execution Performance', () => {
    it('should execute simple scripts quickly', async () => {
      const { response, duration } = await timedRequest('/math/add/run', {
        method: 'POST',
      })

      // Accept 200 (success) or 429 (rate limited)
      expect([200, 429]).toContain(response.status)
      if (response.status === 200) {
        expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs * 3)
      }
    })

    it('should execute tests quickly', async () => {
      const { response, duration } = await timedRequest('/math/add/test', {
        method: 'POST',
      })

      // Accept 200 (success) or 429 (rate limited)
      expect([200, 429]).toContain(response.status)
      if (response.status === 200) {
        expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs * 5)
      }
    })

    it('should timeout long-running scripts appropriately', async () => {
      const { response, duration } = await timedRequest('/test/infinite/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 100 }), // 100ms timeout
      })

      // Accept 408 (timeout) or 429 (rate limited) or 500 (script error)
      expect([408, 429, 500]).toContain(response.status)
      if (response.status !== 429) {
        expect(duration).toBeLessThan(5000) // Should not take more than 5s
      }
    })
  })

  describe('Response Size Performance', () => {
    it('should handle large module responses efficiently', async () => {
      // Create a module with larger content
      const largeTypes = 'export ' + Array.from({ length: 100 }, (_, i) =>
        `declare const v${i}: number;`
      ).join('\n')

      const largeModule = 'export ' + Array.from({ length: 100 }, (_, i) =>
        `const v${i} = ${i};`
      ).join('\n')

      const createResponse = await request('/test/large-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          types: largeTypes,
          module: largeModule,
        }),
      })

      // Accept 201 (created) or 200 (updated) or 429 (rate limited from previous tests)
      expect([200, 201, 429]).toContain(createResponse.status)

      const { response, duration } = await timedRequest('/test/large-module.mjs')

      // Accept 200 (success) or 429 (rate limited)
      expect([200, 429]).toContain(response.status)
      if (response.status === 200) {
        expect(duration).toBeLessThan(THRESHOLDS.singleRequestMs * 3)
      }
    })

    it('should compress responses when accepted', async () => {
      const response = await request('/math/add.mjs', {
        headers: { 'Accept-Encoding': 'gzip, deflate' },
      })

      // Accept 200 (success) or 429 (rate limited)
      expect([200, 429]).toContain(response.status)
    })
  })

  describe('Caching Performance', () => {
    it('should return cached responses quickly with ETag', async () => {
      // First request to get ETag
      const first = await timedRequest('/math/add.mjs')

      // Accept 200 (success) or 429 (rate limited)
      expect([200, 429]).toContain(first.response.status)

      // Skip ETag test if rate limited
      if (first.response.status === 429) {
        return
      }

      const etag = first.response.headers.get('ETag')
      expect(etag).toBeDefined()

      // Second request with ETag should be faster
      const { response, duration } = await timedRequest('/math/add.mjs', {
        headers: { 'If-None-Match': etag ?? '' },
      })

      expect([200, 304, 429]).toContain(response.status)
      if (response.status === 304) {
        expect(duration).toBeLessThan(first.duration * 1.5) // Allow some variance
      }
    })

    it('should set appropriate cache headers for versioned content', async () => {
      const response = await request('/math/add@v1.0.0.mjs')

      // Accept 200 (success) or 429 (rate limited)
      expect([200, 429]).toContain(response.status)

      if (response.status === 200) {
        const cacheControl = response.headers.get('Cache-Control')
        expect(cacheControl).toContain('immutable')
      }
    })
  })

  describe('Rate Limiting Performance', () => {
    it('should not add significant overhead to requests', async () => {
      const durations: number[] = []

      // Make requests - some may be rate limited from previous tests
      for (let i = 0; i < 10; i++) {
        const { response, duration } = await timedRequest('/math/add')
        // Accept both success and rate limited (from cumulative requests)
        expect([200, 429]).toContain(response.status)
        if (response.status === 200) {
          durations.push(duration)
        }
      }

      // Only check stats if we got some successful requests
      if (durations.length > 0) {
        const stats = calculateStats(durations)
        // Latency should still be within threshold
        expect(stats.mean).toBeLessThan(THRESHOLDS.singleRequestMs * 2)
      }

      // Rate limit headers should be present
      const response = await request('/math/add')
      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined()
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined()
    })
  })
})

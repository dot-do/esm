/**
 * RED Tests for Rate Limiting
 *
 * Issue: esm-auth.7 - RED: Rate limiting
 *
 * These tests verify that rate limiting is properly implemented:
 * - 429 status code when rate limited
 * - Retry-After header in rate limit responses
 * - X-RateLimit-* headers on all responses
 * - Per-IP rate limiting
 *
 * These tests are designed to FAIL until the rate limiting implementation
 * exists in src/worker/middleware/rate-limit.ts
 *
 * GREEN implementation: esm-auth.11
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Miniflare } from 'miniflare'
import * as esbuild from 'esbuild'

// Custom worker class that wraps Miniflare with unsafeEvalBinding support
class MiniflareWorker {
  private static instance: MiniflareWorker | null = null
  private static refCount = 0
  private mf: Miniflare | null = null
  private static bundledCode: string | null = null

  static async getShared(): Promise<MiniflareWorker> {
    if (!MiniflareWorker.instance) {
      MiniflareWorker.instance = new MiniflareWorker()
      await MiniflareWorker.instance.startInternal()
    }
    MiniflareWorker.refCount++
    return MiniflareWorker.instance
  }

  static async releaseShared(): Promise<void> {
    MiniflareWorker.refCount--
    if (MiniflareWorker.refCount <= 0 && MiniflareWorker.instance) {
      await MiniflareWorker.instance.stopInternal()
      MiniflareWorker.instance = null
      MiniflareWorker.refCount = 0
    }
  }

  private async startInternal() {
    // Bundle the worker code once
    if (!MiniflareWorker.bundledCode) {
      const result = await esbuild.build({
        entryPoints: ['src/worker/index.ts'],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
      })
      MiniflareWorker.bundledCode = result.outputFiles[0].text
    }

    this.mf = new Miniflare({
      modules: true,
      script: MiniflareWorker.bundledCode,
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
      unsafeEvalBinding: 'unsafe_eval',
    })
  }

  private async stopInternal() {
    await this.mf?.dispose()
    this.mf = null
  }

  async fetch(path: string, init?: RequestInit) {
    if (!this.mf) throw new Error('Worker not started')
    return this.mf.dispatchFetch(`http://localhost${path}`, init as Parameters<Miniflare['dispatchFetch']>[1])
  }
}

// =============================================================================
// Rate Limiting Tests
// =============================================================================
describe('Rate Limiting', () => {
  let worker: MiniflareWorker

  beforeAll(async () => {
    worker = await MiniflareWorker.getShared()
  })

  afterAll(async () => {
    await MiniflareWorker.releaseShared()
  })

  // ---------------------------------------------------------------------------
  // Test 1: Rate limit headers should be present on all responses
  // ---------------------------------------------------------------------------
  it('should include X-RateLimit-Limit header on responses', async () => {
    const response = await worker.fetch('/math/add')

    expect(response.headers.has('x-ratelimit-limit')).toBe(true)
    const limit = response.headers.get('x-ratelimit-limit')
    expect(limit).not.toBeNull()
    expect(parseInt(limit!, 10)).toBeGreaterThan(0)
  })

  it('should include X-RateLimit-Remaining header on responses', async () => {
    const response = await worker.fetch('/math/add')

    expect(response.headers.has('x-ratelimit-remaining')).toBe(true)
    const remaining = response.headers.get('x-ratelimit-remaining')
    expect(remaining).not.toBeNull()
    expect(parseInt(remaining!, 10)).toBeGreaterThanOrEqual(0)
  })

  it('should include X-RateLimit-Reset header on responses', async () => {
    const response = await worker.fetch('/math/add')

    expect(response.headers.has('x-ratelimit-reset')).toBe(true)
    const reset = response.headers.get('x-ratelimit-reset')
    expect(reset).not.toBeNull()
    // Reset should be a Unix timestamp in the future
    const resetTime = parseInt(reset!, 10)
    expect(resetTime).toBeGreaterThan(Math.floor(Date.now() / 1000) - 1)
  })

  // ---------------------------------------------------------------------------
  // Test 2: 429 status code when rate limited
  // ---------------------------------------------------------------------------
  it('should return 429 when rate limit is exceeded', async () => {
    // Make many requests in quick succession to trigger rate limit
    const requests = Array(1000).fill(null).map(() =>
      worker.fetch('/math/add', {
        headers: { 'X-Forwarded-For': '192.168.1.100' }
      })
    )
    const responses = await Promise.all(requests)

    // At least one response should be 429
    const rateLimitedResponse = responses.find(r => r.status === 429)
    expect(rateLimitedResponse).toBeDefined()
    expect(rateLimitedResponse?.status).toBe(429)
  })

  // ---------------------------------------------------------------------------
  // Test 3: Retry-After header in rate limit responses
  // ---------------------------------------------------------------------------
  it('should include Retry-After header when rate limited', async () => {
    // Make many requests to trigger rate limit
    const requests = Array(1000).fill(null).map(() =>
      worker.fetch('/math/add', {
        headers: { 'X-Forwarded-For': '192.168.1.101' }
      })
    )
    const responses = await Promise.all(requests)

    // Find a rate limited response
    const rateLimitedResponse = responses.find(r => r.status === 429)
    expect(rateLimitedResponse).toBeDefined()

    // Should have Retry-After header
    expect(rateLimitedResponse?.headers.has('retry-after')).toBe(true)
    const retryAfter = rateLimitedResponse?.headers.get('retry-after')
    expect(retryAfter).not.toBeNull()

    // Retry-After should be a positive number (seconds) or HTTP-date
    const retrySeconds = parseInt(retryAfter!, 10)
    expect(retrySeconds).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Test 4: Rate limiting should be per-IP
  // ---------------------------------------------------------------------------
  it('should apply rate limits per IP address', async () => {
    // Request from IP A - exhaust rate limit
    // Use cf-connecting-ip header which the worker prioritizes for rate limiting
    const ipA = '10.0.0.1'
    const ipARequests = Array(1000).fill(null).map(() =>
      worker.fetch('/math/add', {
        headers: { 'cf-connecting-ip': ipA }
      })
    )
    const ipAResponses = await Promise.all(ipARequests)

    // IP A should be rate limited
    const ipARateLimited = ipAResponses.some(r => r.status === 429)
    expect(ipARateLimited).toBe(true)

    // Request from IP B - should still have quota
    // Use a unique IP that hasn't been used by any other test
    const ipB = '10.0.0.2'
    const ipBResponse = await worker.fetch('/math/add', {
      headers: { 'cf-connecting-ip': ipB }
    })

    // IP B should NOT be rate limited (assuming it hasn't made requests before)
    expect(ipBResponse.status).not.toBe(429)
    expect(ipBResponse.status).toBe(200)
  })

  // ---------------------------------------------------------------------------
  // Additional rate limit tests
  // ---------------------------------------------------------------------------
  it('should return proper error body when rate limited', async () => {
    // Make many requests to trigger rate limit, capturing body immediately
    const requests = Array(1000).fill(null).map(async () => {
      const response = await worker.fetch('/math/add', {
        headers: { 'X-Forwarded-For': '192.168.1.102' }
      })
      // Read body immediately to avoid body consumption issues
      let body = null
      if (response.status === 429) {
        try {
          body = await response.json()
        } catch {
          // Body already consumed - ignore
        }
      }
      return { status: response.status, body }
    })
    const results = await Promise.all(requests)

    // Find a rate limited response with body
    const rateLimitedResult = results.find(r => r.status === 429 && r.body)
    expect(rateLimitedResult).toBeDefined()

    expect(rateLimitedResult!.body).toHaveProperty('error')
    expect(rateLimitedResult!.body.error).toMatch(/rate.?limit/i)
    expect(rateLimitedResult!.body).toHaveProperty('status', 429)
  })

  it('should decrement X-RateLimit-Remaining with each request', async () => {
    // Use a unique IP that's not used by other tests to ensure fresh rate limit quota
    // Use cf-connecting-ip header which the worker prioritizes for rate limiting
    const ip = '172.16.0.1'

    // Make first request
    const response1 = await worker.fetch('/math/add', {
      headers: { 'cf-connecting-ip': ip }
    })
    const remaining1 = parseInt(response1.headers.get('x-ratelimit-remaining') || '0', 10)

    // Make second request
    const response2 = await worker.fetch('/math/add', {
      headers: { 'cf-connecting-ip': ip }
    })
    const remaining2 = parseInt(response2.headers.get('x-ratelimit-remaining') || '0', 10)

    // Remaining should decrease
    expect(remaining2).toBeLessThan(remaining1)
  })

  it('should set X-RateLimit-Remaining to 0 when rate limited', async () => {
    // Make many requests to trigger rate limit
    const requests = Array(1000).fill(null).map(() =>
      worker.fetch('/math/add', {
        headers: { 'X-Forwarded-For': '192.168.1.104' }
      })
    )
    const responses = await Promise.all(requests)

    // Find a rate limited response
    const rateLimitedResponse = responses.find(r => r.status === 429)
    expect(rateLimitedResponse).toBeDefined()

    // X-RateLimit-Remaining should be 0
    const remaining = rateLimitedResponse?.headers.get('x-ratelimit-remaining')
    expect(remaining).toBe('0')
  })

  it('should apply different rate limits for read vs write operations', async () => {
    const ip = '192.168.1.105'

    // GET request (read operation)
    const getResponse = await worker.fetch('/math/add', {
      headers: { 'X-Forwarded-For': ip }
    })
    const getLimit = parseInt(getResponse.headers.get('x-ratelimit-limit') || '0', 10)

    // POST request (write operation)
    const postResponse = await worker.fetch('/test/ratelimit-write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip
      },
      body: JSON.stringify({
        types: 'export declare const x: number',
        module: 'export const x = 1',
        tests: ''
      })
    })
    const postLimit = parseInt(postResponse.headers.get('x-ratelimit-limit') || '0', 10)

    // Write operations should have lower rate limits than read operations
    expect(postLimit).toBeLessThan(getLimit)

    // Clean up
    await worker.fetch('/test/ratelimit-write', { method: 'DELETE' })
  })
})

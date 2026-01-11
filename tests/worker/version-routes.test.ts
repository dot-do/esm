/**
 * RED Tests for Version Routes Extraction
 *
 * Issue: esm-arch.3 - Test /versions, /log, /diff handlers
 *
 * These tests verify that version route handlers can be extracted and tested
 * in isolation, separate from the main fetch handler. This enables:
 * - Unit testing individual route handlers without HTTP overhead
 * - Mocking dependencies for isolated testing
 * - Better separation of concerns
 * - Easier maintenance and refactoring
 *
 * These tests are designed to FAIL until the route handlers are extracted
 * from src/api/worker.ts into separate, testable modules.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// These imports should exist after route extraction
// They will fail to import until the routes are extracted
import {
  handleGetVersions,
  handleGetLog,
  handleGetDiff,
  handleRevert,
} from '../../src/worker/routes/version.js'

import type { ModuleStorage, StoredModule } from '../../src/storage/types.js'

// =============================================================================
// Mock Storage for Isolated Testing
// =============================================================================

interface MockCommit {
  hash: string
  tree: string
  parent?: string
  message: string
  timestamp: number
}

function createMockStorage(): ModuleStorage & {
  _commits: Map<string, MockCommit>
  _addCommit: (name: string, commit: MockCommit) => void
} {
  const modules = new Map<string, StoredModule>()
  const commits = new Map<string, MockCommit>()
  const moduleVersions = new Map<string, string[]>() // module name -> list of commit hashes
  const versionContent = new Map<string, StoredModule>() // version hash -> module content

  const storage = {
    _commits: commits,
    _addCommit(name: string, commit: MockCommit): void {
      commits.set(commit.hash, commit)
      const versions = moduleVersions.get(name) || []
      versions.unshift(commit.hash) // Add to front (newest first)
      moduleVersions.set(name, versions)
    },

    async read(name: string, version?: string): Promise<StoredModule | null> {
      if (version) {
        // Check if version exists in commits
        if (!commits.has(version)) {
          return null
        }
        // Return version-specific content if available
        const versionData = versionContent.get(version)
        if (versionData) {
          return versionData
        }
      }
      return modules.get(name) || null
    },

    async write(name: string, data: StoredModule): Promise<{ version: string; name: string }> {
      const hash = `sha-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const versions = moduleVersions.get(name) || []
      const parent = versions[0] // Previous version

      const commit: MockCommit = {
        hash,
        tree: `tree-${hash}`,
        parent,
        message: parent ? `Update ${name}` : `Create ${name}`,
        timestamp: Date.now(),
      }

      commits.set(hash, commit)
      versions.unshift(hash)
      moduleVersions.set(name, versions)

      const storedData = { ...data, version: hash }
      modules.set(name, storedData)
      versionContent.set(hash, storedData) // Store version-specific content
      return { version: hash, name }
    },

    async delete(name: string): Promise<void> {
      modules.delete(name)
      moduleVersions.delete(name)
    },

    async list(pattern?: string): Promise<string[]> {
      return Array.from(modules.keys())
    },

    async versions(name: string, limit?: number): Promise<Array<{
      version: string
      message: string
      timestamp: Date
      parent?: string
    }>> {
      const versionHashes = moduleVersions.get(name) || []
      const result = versionHashes.slice(0, limit || 100).map((hash) => {
        const commit = commits.get(hash)!
        return {
          version: hash,
          message: commit.message,
          timestamp: new Date(commit.timestamp),
          parent: commit.parent,
        }
      })
      return result
    },
  }

  return storage as ModuleStorage & {
    _commits: Map<string, MockCommit>
    _addCommit: (name: string, commit: MockCommit) => void
  }
}

// =============================================================================
// GET Versions Route Handler Tests
// =============================================================================
describe('GET Versions Route Handler', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetVersions).toBe('function')
  })

  it('should accept storage as a dependency', async () => {
    // Create a module with multiple versions
    await storage.write('@test/versioned', {
      name: '@test/versioned',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetVersions({
      fullName: '@test/versioned',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('versions')
    expect(Array.isArray(result.data.versions)).toBe(true)
  })

  it('should return version history in reverse chronological order', async () => {
    // Create module and update it multiple times
    await storage.write('@test/history', {
      name: '@test/history',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    await storage.write('@test/history', {
      name: '@test/history',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    await storage.write('@test/history', {
      name: '@test/history',
      types: 'export declare const x: number',
      module: 'export const x = 3',
      tests: '',
      script: '',
    })

    const result = await handleGetVersions({
      fullName: '@test/history',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data.versions).toHaveLength(3)

    // Verify reverse chronological order (newest first)
    const timestamps = result.data.versions.map((v: { timestamp: string | Date }) =>
      new Date(v.timestamp).getTime()
    )
    expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1])
    expect(timestamps[1]).toBeGreaterThanOrEqual(timestamps[2])
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleGetVersions({
      fullName: '@nonexistent/module',
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('not found')
  })

  it('should support limit parameter', async () => {
    // Create module with many versions
    for (let i = 0; i < 10; i++) {
      await storage.write('@test/manyversions', {
        name: '@test/manyversions',
        types: 'export declare const x: number',
        module: `export const x = ${i}`,
        tests: '',
        script: '',
      })
    }

    const result = await handleGetVersions({
      fullName: '@test/manyversions',
      storage,
      limit: 5,
    })

    expect(result.status).toBe(200)
    expect(result.data.versions).toHaveLength(5)
  })

  it('should include version metadata', async () => {
    await storage.write('@test/metadata', {
      name: '@test/metadata',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetVersions({
      fullName: '@test/metadata',
      storage,
    })

    expect(result.status).toBe(200)
    const version = result.data.versions[0]
    expect(version).toHaveProperty('sha')
    expect(version).toHaveProperty('message')
    expect(version).toHaveProperty('timestamp')
    expect(version).toHaveProperty('author')
  })

  it('should include parent commit references', async () => {
    await storage.write('@test/parents', {
      name: '@test/parents',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    await storage.write('@test/parents', {
      name: '@test/parents',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleGetVersions({
      fullName: '@test/parents',
      storage,
    })

    expect(result.status).toBe(200)
    // Second version should have parent pointing to first
    const latestVersion = result.data.versions[0]
    expect(latestVersion).toHaveProperty('parent')
    expect(latestVersion.parent).toBe(result.data.versions[1].sha)
  })
})

// =============================================================================
// GET Log Route Handler Tests
// =============================================================================
describe('GET Log Route Handler', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetLog).toBe('function')
  })

  it('should return commit log with detailed information', async () => {
    await storage.write('@test/log', {
      name: '@test/log',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetLog({
      fullName: '@test/log',
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('commits')
    expect(Array.isArray(result.data.commits)).toBe(true)
  })

  it('should include commit details', async () => {
    await storage.write('@test/logdetails', {
      name: '@test/logdetails',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetLog({
      fullName: '@test/logdetails',
      storage,
    })

    expect(result.status).toBe(200)
    const commit = result.data.commits[0]
    expect(commit).toHaveProperty('sha')
    expect(commit).toHaveProperty('message')
    expect(commit).toHaveProperty('author')
    expect(commit).toHaveProperty('timestamp')
    expect(commit).toHaveProperty('tree')
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleGetLog({
      fullName: '@nonexistent/module',
      storage,
    })

    expect(result.status).toBe(404)
  })

  it('should support pagination with offset and limit', async () => {
    // Create module with many versions
    for (let i = 0; i < 20; i++) {
      await storage.write('@test/paginated', {
        name: '@test/paginated',
        types: 'export declare const x: number',
        module: `export const x = ${i}`,
        tests: '',
        script: '',
      })
    }

    const result = await handleGetLog({
      fullName: '@test/paginated',
      storage,
      offset: 5,
      limit: 10,
    })

    expect(result.status).toBe(200)
    expect(result.data.commits).toHaveLength(10)
    expect(result.data).toHaveProperty('total')
    expect(result.data.total).toBe(20)
    expect(result.data).toHaveProperty('hasMore', true)
  })

  it('should support filtering by date range', async () => {
    const now = Date.now()

    // Create module
    await storage.write('@test/datefilter', {
      name: '@test/datefilter',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetLog({
      fullName: '@test/datefilter',
      storage,
      since: new Date(now - 3600000), // 1 hour ago
      until: new Date(now + 3600000), // 1 hour from now
    })

    expect(result.status).toBe(200)
    expect(result.data.commits.length).toBeGreaterThan(0)
  })

  it('should support filtering by author', async () => {
    await storage.write('@test/authorfilter', {
      name: '@test/authorfilter',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetLog({
      fullName: '@test/authorfilter',
      storage,
      author: 'esm.do',
    })

    expect(result.status).toBe(200)
    result.data.commits.forEach((commit: { author: string }) => {
      expect(commit.author).toContain('esm.do')
    })
  })
})

// =============================================================================
// GET Diff Route Handler Tests
// =============================================================================
describe('GET Diff Route Handler', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleGetDiff).toBe('function')
  })

  it('should accept storage as a dependency', async () => {
    // Create two versions
    const v1 = await storage.write('@test/diff', {
      name: '@test/diff',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const v2 = await storage.write('@test/diff', {
      name: '@test/diff',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/diff',
      from: v1.version,
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('diff')
  })

  it('should return unified diff format', async () => {
    const v1 = await storage.write('@test/unifieddiff', {
      name: '@test/unifieddiff',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const v2 = await storage.write('@test/unifieddiff', {
      name: '@test/unifieddiff',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/unifieddiff',
      from: v1.version,
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data.diff).toContain('-')
    expect(result.data.diff).toContain('+')
  })

  it('should show diff for all changed files', async () => {
    const v1 = await storage.write('@test/multifile', {
      name: '@test/multifile',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: 'describe("x", () => {})',
      script: 'return x',
    })

    const v2 = await storage.write('@test/multifile', {
      name: '@test/multifile',
      types: 'export declare const y: number',
      module: 'export const y = 2',
      tests: 'describe("y", () => {})',
      script: 'return y',
    })

    const result = await handleGetDiff({
      fullName: '@test/multifile',
      from: v1.version,
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('files')
    expect(result.data.files).toHaveProperty('index.d.ts')
    expect(result.data.files).toHaveProperty('index.mjs')
    expect(result.data.files).toHaveProperty('index.test.js')
    expect(result.data.files).toHaveProperty('index.script.js')
  })

  it('should return 400 for missing from parameter', async () => {
    await storage.write('@test/missingfrom', {
      name: '@test/missingfrom',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/missingfrom',
      to: 'some-sha',
      storage,
    } as any)

    expect(result.status).toBe(400)
    expect(result.error).toContain('from')
  })

  it('should return 400 for missing to parameter', async () => {
    await storage.write('@test/missingto', {
      name: '@test/missingto',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/missingto',
      from: 'some-sha',
      storage,
    } as any)

    expect(result.status).toBe(400)
    expect(result.error).toContain('to')
  })

  it('should return 404 for non-existent from version', async () => {
    const v2 = await storage.write('@test/badfrom', {
      name: '@test/badfrom',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/badfrom',
      from: 'nonexistent-sha',
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('nonexistent-sha')
  })

  it('should return 404 for non-existent to version', async () => {
    const v1 = await storage.write('@test/badto', {
      name: '@test/badto',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/badto',
      from: v1.version,
      to: 'nonexistent-sha',
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('nonexistent-sha')
  })

  it('should return empty diff for identical versions', async () => {
    const v1 = await storage.write('@test/identical', {
      name: '@test/identical',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/identical',
      from: v1.version,
      to: v1.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data.diff).toBe('')
  })

  it('should include stats about changes', async () => {
    const v1 = await storage.write('@test/stats', {
      name: '@test/stats',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const v2 = await storage.write('@test/stats', {
      name: '@test/stats',
      types: 'export declare const x: number',
      module: 'export const x = 2\nexport const y = 3',
      tests: '',
      script: '',
    })

    const result = await handleGetDiff({
      fullName: '@test/stats',
      from: v1.version,
      to: v2.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('stats')
    expect(result.data.stats).toHaveProperty('additions')
    expect(result.data.stats).toHaveProperty('deletions')
    expect(result.data.stats).toHaveProperty('filesChanged')
  })
})

// =============================================================================
// POST Revert Route Handler Tests
// =============================================================================
describe('POST Revert Route Handler', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should be exported as a standalone function', () => {
    expect(typeof handleRevert).toBe('function')
  })

  it('should revert module to a previous version', async () => {
    const v1 = await storage.write('@test/revert', {
      name: '@test/revert',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    await storage.write('@test/revert', {
      name: '@test/revert',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleRevert({
      fullName: '@test/revert',
      to: v1.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('reverted', true)
    expect(result.data).toHaveProperty('from')
    expect(result.data).toHaveProperty('to', v1.version)
    expect(result.data).toHaveProperty('newVersion')
  })

  it('should create a new version after revert', async () => {
    const v1 = await storage.write('@test/revertversion', {
      name: '@test/revertversion',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const v2 = await storage.write('@test/revertversion', {
      name: '@test/revertversion',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleRevert({
      fullName: '@test/revertversion',
      to: v1.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data.newVersion).not.toBe(v1.version)
    expect(result.data.newVersion).not.toBe(v2.version)

    // Verify the new version has the reverted content
    const versions = await storage.versions('@test/revertversion')
    expect(versions).toHaveLength(3) // v1, v2, and revert commit
  })

  it('should return 404 for non-existent module', async () => {
    const result = await handleRevert({
      fullName: '@nonexistent/module',
      to: 'some-sha',
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('not found')
  })

  it('should return 404 for non-existent target version', async () => {
    await storage.write('@test/badrevert', {
      name: '@test/badrevert',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleRevert({
      fullName: '@test/badrevert',
      to: 'nonexistent-sha',
      storage,
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain('nonexistent-sha')
  })

  it('should return 400 for missing to parameter', async () => {
    await storage.write('@test/missingto', {
      name: '@test/missingto',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleRevert({
      fullName: '@test/missingto',
      storage,
    } as any)

    expect(result.status).toBe(400)
    expect(result.error).toContain('to')
  })

  it('should include commit message indicating revert', async () => {
    const v1 = await storage.write('@test/revertmsg', {
      name: '@test/revertmsg',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    await storage.write('@test/revertmsg', {
      name: '@test/revertmsg',
      types: 'export declare const x: number',
      module: 'export const x = 2',
      tests: '',
      script: '',
    })

    const result = await handleRevert({
      fullName: '@test/revertmsg',
      to: v1.version,
      storage,
    })

    expect(result.status).toBe(200)
    expect(result.data).toHaveProperty('commit')
    expect(result.data.commit).toHaveProperty('message')
    expect(result.data.commit.message.toLowerCase()).toContain('revert')
  })

  it('should restore all files from target version', async () => {
    const v1 = await storage.write('@test/restoreall', {
      name: '@test/restoreall',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: 'describe("x", () => {})',
      script: 'return x',
    })

    await storage.write('@test/restoreall', {
      name: '@test/restoreall',
      types: 'export declare const y: number',
      module: 'export const y = 2',
      tests: 'describe("y", () => {})',
      script: 'return y',
    })

    const result = await handleRevert({
      fullName: '@test/restoreall',
      to: v1.version,
      storage,
    })

    expect(result.status).toBe(200)

    // Verify content was restored
    const restored = await storage.read('@test/restoreall')
    expect(restored).not.toBeNull()
    expect(restored!.module).toContain('x = 1')
    expect(restored!.types).toContain('x: number')
    expect(restored!.tests).toContain('describe("x"')
    expect(restored!.script).toBe('return x')
  })
})

// =============================================================================
// Route Handler Interface Tests
// =============================================================================
describe('Version Route Handler Interface', () => {
  it('should export all version route handlers from a single module', async () => {
    // This verifies that all handlers are exported from a single entry point
    const handlers = await import('../../src/worker/routes/version.js')

    expect(handlers).toHaveProperty('handleGetVersions')
    expect(handlers).toHaveProperty('handleGetLog')
    expect(handlers).toHaveProperty('handleGetDiff')
    expect(handlers).toHaveProperty('handleRevert')
  })

  it('should have consistent return type across handlers', async () => {
    const storage = createMockStorage()

    await storage.write('@test/consistent', {
      name: '@test/consistent',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    // All handlers should return objects with status and either data or error
    const result = await handleGetVersions({
      fullName: '@test/consistent',
      storage,
    })

    expect(result).toHaveProperty('status')
    expect(typeof result.status).toBe('number')

    // Should have either data or error, not both
    const hasData = 'data' in result
    const hasError = 'error' in result
    expect(hasData || hasError).toBe(true)
  })

  it('should accept request context for logging and tracing', async () => {
    const storage = createMockStorage()
    await storage.write('@test/traced', {
      name: '@test/traced',
      types: 'export declare const x: number',
      module: 'export const x = 1',
      tests: '',
      script: '',
    })

    const result = await handleGetVersions({
      fullName: '@test/traced',
      storage,
      requestId: 'req-123',
    })

    expect(result.status).toBe(200)
    // Request ID should be available for logging purposes
  })
})

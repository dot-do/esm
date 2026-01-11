/**
 * Version Routes - Handlers for module version management
 *
 * Issue: esm-arch.9 - Create version routes
 *
 * This module provides extracted route handlers for version-related operations:
 * - GET versions: List version history
 * - GET log: Detailed commit log
 * - GET diff: Compare two versions
 * - POST revert: Revert to a previous version
 */

import type { ModuleStorage } from '../../storage/types.js'

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
 * Version entry in the versions response
 */
export interface VersionEntry {
  readonly sha: string
  readonly message: string
  readonly timestamp: Date
  readonly author: string
  readonly parent?: string
}

/**
 * Commit entry in the log response
 */
export interface CommitEntry {
  readonly sha: string
  readonly message: string
  readonly author: string
  readonly timestamp: Date
  readonly tree: string
  readonly parent?: string
}

/**
 * Diff statistics
 */
export interface DiffStats {
  readonly additions: number
  readonly deletions: number
  readonly filesChanged: number
}

/**
 * Request parameters for handleGetVersions
 */
export interface GetVersionsParams {
  readonly fullName: string
  readonly storage: ModuleStorage
  readonly limit?: number
  readonly requestId?: string
}

/**
 * Request parameters for handleGetLog
 */
export interface GetLogParams {
  readonly fullName: string
  readonly storage: ModuleStorage
  readonly offset?: number
  readonly limit?: number
  readonly since?: Date
  readonly until?: Date
  readonly author?: string
  readonly requestId?: string
}

/**
 * Request parameters for handleGetDiff
 */
export interface GetDiffParams {
  readonly fullName: string
  readonly from: string
  readonly to: string
  readonly storage: ModuleStorage
  readonly requestId?: string
}

/**
 * Request parameters for handleRevert
 */
export interface RevertParams {
  readonly fullName: string
  readonly to: string
  readonly storage: ModuleStorage
  readonly requestId?: string
}

// =============================================================================
// GET Versions Handler
// =============================================================================

/**
 * Handle GET /versions - List version history for a module
 *
 * @param params - Request parameters including module name and storage
 * @returns Route result with version history
 */
export async function handleGetVersions(
  params: GetVersionsParams
): Promise<RouteResult<{ versions: VersionEntry[] }>> {
  const { fullName, storage, limit } = params

  // Check if module exists by looking for versions
  const versions = await storage.versions(fullName, limit)

  if (versions.length === 0) {
    // Check if module itself exists
    const module = await storage.read(fullName)
    if (!module) {
      return {
        status: 404,
        error: `Module ${fullName} not found`,
      }
    }
  }

  // Transform versions to VersionEntry format
  const versionEntries: VersionEntry[] = versions.map((v) => {
    const entry: VersionEntry = {
      sha: v.version,
      message: v.message,
      timestamp: v.timestamp,
      author: 'esm.do',
    }
    if (v.parent) {
      return { ...entry, parent: v.parent }
    }
    return entry
  })

  return {
    status: 200,
    data: { versions: versionEntries },
  }
}

// =============================================================================
// GET Log Handler
// =============================================================================

/**
 * Handle GET /log - Get detailed commit log for a module
 *
 * @param params - Request parameters including module name and filters
 * @returns Route result with commit log
 */
export async function handleGetLog(
  params: GetLogParams
): Promise<RouteResult<{ commits: CommitEntry[]; total: number; hasMore: boolean }>> {
  const { fullName, storage, offset = 0, limit = 100, since, until, author } = params

  // Check if module exists by looking for versions
  const allVersions = await storage.versions(fullName, 1000) // Get all for filtering

  if (allVersions.length === 0) {
    const module = await storage.read(fullName)
    if (!module) {
      return {
        status: 404,
        error: `Module ${fullName} not found`,
      }
    }
  }

  // Filter versions by date range and author
  let filteredVersions = allVersions

  if (since) {
    filteredVersions = filteredVersions.filter(
      (v) => v.timestamp.getTime() >= since.getTime()
    )
  }

  if (until) {
    filteredVersions = filteredVersions.filter(
      (v) => v.timestamp.getTime() <= until.getTime()
    )
  }

  if (author) {
    // In our simple mock, all commits are by 'esm.do'
    filteredVersions = filteredVersions.filter(() =>
      'esm.do'.includes(author)
    )
  }

  const total = filteredVersions.length

  // Apply pagination
  const paginatedVersions = filteredVersions.slice(offset, offset + limit)
  const hasMore = offset + limit < total

  // Transform to CommitEntry format
  const commits: CommitEntry[] = paginatedVersions.map((v) => {
    const entry: CommitEntry = {
      sha: v.version,
      message: v.message,
      author: 'esm.do',
      timestamp: v.timestamp,
      tree: `tree-${v.version}`,
    }
    if (v.parent) {
      return { ...entry, parent: v.parent }
    }
    return entry
  })

  return {
    status: 200,
    data: { commits, total, hasMore },
  }
}

// =============================================================================
// GET Diff Handler
// =============================================================================

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

/**
 * Handle GET /diff - Compare two versions of a module
 *
 * @param params - Request parameters including from and to versions
 * @returns Route result with diff information
 */
export async function handleGetDiff(
  params: GetDiffParams
): Promise<RouteResult<{ diff: string; files?: Record<string, string>; stats?: DiffStats }>> {
  const { fullName, from, to, storage } = params

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

  // Handle identical versions
  if (from === to) {
    return {
      status: 200,
      data: { diff: '' },
    }
  }

  // Compute diffs for each file
  const files: Record<string, string> = {}
  let totalAdditions = 0
  let totalDeletions = 0
  let filesChanged = 0

  // Types file (index.d.ts)
  const typesDiff = computeDiff(fromModule.types, toModule.types)
  if (typesDiff) {
    files['index.d.ts'] = typesDiff
    filesChanged++
    totalAdditions += typesDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += typesDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  // Module file (index.mjs)
  const moduleDiff = computeDiff(fromModule.module, toModule.module)
  if (moduleDiff) {
    files['index.mjs'] = moduleDiff
    filesChanged++
    totalAdditions += moduleDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += moduleDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  // Test file (index.test.js)
  const testsDiff = computeDiff(fromModule.tests, toModule.tests)
  if (testsDiff) {
    files['index.test.js'] = testsDiff
    filesChanged++
    totalAdditions += testsDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += testsDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  // Script file (index.script.js)
  const scriptDiff = computeDiff(fromModule.script, toModule.script)
  if (scriptDiff) {
    files['index.script.js'] = scriptDiff
    filesChanged++
    totalAdditions += scriptDiff.split('\n').filter((l) => l.startsWith('+')).length
    totalDeletions += scriptDiff.split('\n').filter((l) => l.startsWith('-')).length
  }

  // Combine all diffs into a unified diff
  const allDiffs = Object.entries(files)
    .map(([file, diff]) => `--- a/${file}\n+++ b/${file}\n${diff}`)
    .join('\n\n')

  return {
    status: 200,
    data: {
      diff: allDiffs,
      files,
      stats: {
        additions: totalAdditions,
        deletions: totalDeletions,
        filesChanged,
      },
    },
  }
}

// =============================================================================
// POST Revert Handler
// =============================================================================

/**
 * Handle POST /revert - Revert a module to a previous version
 *
 * @param params - Request parameters including target version
 * @returns Route result with revert information
 */
export async function handleRevert(
  params: RevertParams
): Promise<RouteResult<{
  reverted: boolean
  from: string
  to: string
  newVersion: string
  commit: { message: string; sha: string }
}>> {
  const { fullName, to, storage } = params

  // Validate required parameters
  if (!to) {
    return {
      status: 400,
      error: 'Missing required parameter: to',
    }
  }

  // Check if module exists
  const currentModule = await storage.read(fullName)
  if (!currentModule) {
    return {
      status: 404,
      error: `Module ${fullName} not found`,
    }
  }

  // Get current version
  const currentVersions = await storage.versions(fullName, 1)
  const currentVersion = currentVersions[0]?.version || 'unknown'

  // Check if target version exists
  const targetModule = await storage.read(fullName, to)
  if (!targetModule) {
    return {
      status: 404,
      error: `Version ${to} not found`,
    }
  }

  // Write the reverted content as a new version
  const result = await storage.write(fullName, {
    name: targetModule.name,
    types: targetModule.types,
    module: targetModule.module,
    tests: targetModule.tests,
    script: targetModule.script,
  })

  const commitMessage = `Revert ${fullName} to ${to}`

  return {
    status: 200,
    data: {
      reverted: true,
      from: currentVersion,
      to,
      newVersion: result.version,
      commit: {
        message: commitMessage,
        sha: result.version,
      },
    },
  }
}

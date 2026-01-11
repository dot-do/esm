/**
 * Worker storage implementation for esm.do
 *
 * This module provides in-memory GitxClient and GitxStorage implementations
 * for the Cloudflare Workers runtime.
 *
 * Related issues:
 * - esm-arch.13: Extract worker storage
 */

import type { StoredModule, ModuleVersion, GitxClient, WriteResult, ModuleStorage } from '../storage/types.js'

// =============================================================================
// In-Memory GitxClient Implementation for Cloudflare Workers
// =============================================================================
// This implements the GitxClient interface using in-memory storage for the
// Cloudflare Workers runtime. It provides git-like content-addressed storage
// with blobs, trees, commits, refs, and tags - all stored in Maps.
//
// Note: This is a stateless implementation - data persists only for the
// lifetime of the worker instance. For durable storage, connect to the
// actual gitx.do backend service.
// =============================================================================

function generateSha(content: string): string {
  // Generate a short SHA-like hash for content addressing
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  // Return 7-char hex string like git short SHA
  const hex = Math.abs(hash).toString(16).padStart(7, '0').slice(0, 7)
  return hex + Math.random().toString(16).slice(2, 9) // Add randomness for uniqueness
}

export class InMemoryGitxClient implements GitxClient {
  private blobs = new Map<string, string>()
  private trees = new Map<string, Record<string, string>>()
  private commits = new Map<string, { tree: string; parent?: string; message: string; timestamp: number }>()
  private refs = new Map<string, string>()
  // Tag storage: module name -> tag name -> commit SHA
  private tags = new Map<string, Map<string, string>>()

  async writeBlob(content: string): Promise<string> {
    const hash = generateSha(content + Date.now())
    this.blobs.set(hash, content)
    return hash
  }

  async readBlob(hash: string): Promise<string> {
    if (!this.blobs.has(hash)) {
      throw new Error(`Blob ${hash} not found`)
    }
    return this.blobs.get(hash)!
  }

  async writeTree(entries: Record<string, string>): Promise<string> {
    const hash = generateSha(JSON.stringify(entries) + Date.now())
    this.trees.set(hash, entries)
    return hash
  }

  async readTree(hash: string): Promise<Record<string, string>> {
    const tree = this.trees.get(hash)
    if (!tree) throw new Error(`Tree ${hash} not found`)
    return tree
  }

  async commit(treeHash: string, message: string, parent?: string): Promise<string> {
    const timestamp = Date.now()
    const hash = generateSha(treeHash + message + timestamp)
    const commitData: { tree: string; parent?: string; message: string; timestamp: number } = {
      tree: treeHash,
      message,
      timestamp
    }
    if (parent) {
      commitData.parent = parent
    }
    this.commits.set(hash, commitData)
    return hash
  }

  async getCommit(hash: string): Promise<{ tree: string; parent?: string; message: string; timestamp: number }> {
    const commit = this.commits.get(hash)
    if (!commit) throw new Error(`Commit ${hash} not found`)
    return commit
  }

  async updateRef(ref: string, commitHash: string): Promise<void> {
    this.refs.set(ref, commitHash)
  }

  async getRef(ref: string): Promise<string | null> {
    return this.refs.get(ref) || null
  }

  async listRefs(prefix?: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    for (const [ref, hash] of this.refs) {
      if (!prefix || ref.startsWith(prefix)) {
        result[ref] = hash
      }
    }
    return result
  }

  async deleteRef(ref: string): Promise<void> {
    this.refs.delete(ref)
  }

  async log(startCommit: string, limit?: number): Promise<Array<{
    hash: string
    tree: string
    parent?: string
    message: string
    timestamp: number
  }>> {
    const history: Array<{
      hash: string
      tree: string
      parent?: string
      message: string
      timestamp: number
    }> = []

    let currentHash: string | undefined = startCommit
    const maxItems = limit || 100

    while (currentHash && history.length < maxItems) {
      const commit = this.commits.get(currentHash)
      if (!commit) break
      const entry: {
        hash: string
        tree: string
        parent?: string
        message: string
        timestamp: number
      } = {
        hash: currentHash,
        tree: commit.tree,
        message: commit.message,
        timestamp: commit.timestamp,
      }
      if (commit.parent) {
        entry.parent = commit.parent
      }
      history.push(entry)
      currentHash = commit.parent
    }

    return history
  }

  // Tag operations
  createTag(moduleName: string, tagName: string, commitSha: string): void {
    if (!this.tags.has(moduleName)) {
      this.tags.set(moduleName, new Map())
    }
    this.tags.get(moduleName)!.set(tagName, commitSha)
  }

  getTaggedCommit(moduleName: string, tagName: string): string | null {
    return this.tags.get(moduleName)?.get(tagName) || null
  }
}

// =============================================================================
// GitxStorage Implementation for Worker
// =============================================================================

function moduleToRef(name: string): string {
  return `refs/modules/${name}`
}

function refToModule(ref: string): string {
  return ref.replace('refs/modules/', '')
}

export class WorkerGitxStorage implements ModuleStorage {
  private client: InMemoryGitxClient

  constructor(client: InMemoryGitxClient) {
    this.client = client
  }

  async read(name: string, version?: string): Promise<StoredModule | null> {
    let commitHash: string
    let displayVersion: string | undefined

    if (version) {
      // Check if version is a tag (starts with 'v')
      if (version.startsWith('v')) {
        const taggedCommit = this.client.getTaggedCommit(name, version)
        if (taggedCommit) {
          commitHash = taggedCommit
          displayVersion = version // Use tag name as display version
        } else {
          // Try as a SHA
          commitHash = version
        }
      } else {
        commitHash = version
      }
    } else {
      const ref = moduleToRef(name)
      const latestHash = await this.client.getRef(ref)
      if (!latestHash) return null
      commitHash = latestHash
    }

    try {
      const commit = await this.client.getCommit(commitHash)
      const tree = await this.client.readTree(commit.tree)

      const typesHash = tree['index.d.ts']
      const moduleHash = tree['index.mjs']
      const testsHash = tree['index.test.js']
      const scriptHash = tree['index.script.js']

      if (!typesHash || !moduleHash || !testsHash || !scriptHash) {
        return null
      }

      const [types, module, tests, script] = await Promise.all([
        this.client.readBlob(typesHash),
        this.client.readBlob(moduleHash),
        this.client.readBlob(testsHash),
        this.client.readBlob(scriptHash),
      ])

      return {
        name,
        types,
        module,
        tests,
        script,
        version: displayVersion || commitHash, // Use tag name if available
      }
    } catch {
      return null
    }
  }

  async write(name: string, data: StoredModule): Promise<WriteResult> {
    const [typesHash, moduleHash, testsHash, scriptHash] = await Promise.all([
      this.client.writeBlob(data.types),
      this.client.writeBlob(data.module),
      this.client.writeBlob(data.tests),
      this.client.writeBlob(data.script),
    ])

    const treeHash = await this.client.writeTree({
      'index.d.ts': typesHash,
      'index.mjs': moduleHash,
      'index.test.js': testsHash,
      'index.script.js': scriptHash,
    })

    const ref = moduleToRef(name)
    const parentHash = await this.client.getRef(ref)
    const message = parentHash ? `Update ${name}` : `Create ${name}`
    const commitHash = await this.client.commit(treeHash, message, parentHash ?? undefined)
    await this.client.updateRef(ref, commitHash)

    return { version: commitHash, name }
  }

  async delete(name: string): Promise<void> {
    const ref = moduleToRef(name)
    await this.client.deleteRef(ref)
  }

  async list(pattern?: string): Promise<string[]> {
    const refs = await this.client.listRefs('refs/modules/')
    const names = Object.keys(refs).map(refToModule)
    if (pattern) {
      return names.filter(n => n.includes(pattern.replace(/\*/g, '')))
    }
    return names.sort()
  }

  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    const ref = moduleToRef(name)
    const headHash = await this.client.getRef(ref)
    if (!headHash) return []

    const history = await this.client.log(headHash, limit)
    return history.map(commit => {
      const entry: ModuleVersion = {
        version: commit.hash,
        message: commit.message,
        timestamp: new Date(commit.timestamp),
      }
      if (commit.parent) {
        entry.parent = commit.parent
      }
      return entry
    })
  }

  // Extended method to get commit info
  async getCommit(hash: string): Promise<{ tree: string; parent?: string; message: string; timestamp: number } | null> {
    try {
      return await this.client.getCommit(hash)
    } catch {
      return null
    }
  }

  // Create a tag for a module version
  createTag(name: string, tag: string, commitSha: string): void {
    this.client.createTag(name, tag, commitSha)
  }
}

// Singleton storage instance
const gitxClient = new InMemoryGitxClient()
export const gitxStorage = new WorkerGitxStorage(gitxClient)

// Export the generateSha function for use in worker.ts (for delete commit info)
export { generateSha }

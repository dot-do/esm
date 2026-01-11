/**
 * InMemoryStorage - In-memory storage backend for ESM modules
 *
 * Fast, ephemeral storage ideal for testing and development.
 * Data is lost when the process exits.
 *
 * ZERO Cloudflare dependencies - platform agnostic.
 */

import type { ModuleStorage, StoredModule, WriteResult, ModuleVersion, ModuleInput } from './types.js'

/**
 * Generate a unique version identifier
 */
function generateVersion(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

/**
 * InMemoryStorage implements the ModuleStorage interface
 * with a simple Map-based storage backend.
 */
export class InMemoryStorage implements ModuleStorage {
  private modules = new Map<string, StoredModule>()
  private history = new Map<string, ModuleVersion[]>()

  /**
   * Read a module from storage
   */
  async read(name: string, _version?: string): Promise<StoredModule | null> {
    return this.modules.get(name) ?? null
  }

  /**
   * Write a module to storage
   */
  async write(name: string, module: ModuleInput): Promise<WriteResult> {
    const existing = this.modules.get(name)
    const version = generateVersion()
    const now = new Date()

    const stored: StoredModule = {
      ...module,
      name,
      version,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    this.modules.set(name, stored)

    // Track version history
    const versions = this.history.get(name) ?? []
    versions.push({ version, createdAt: now })
    this.history.set(name, versions)

    return { version, created: !existing }
  }

  /**
   * Delete a module from storage
   */
  async delete(name: string): Promise<void> {
    this.modules.delete(name)
  }

  /**
   * List modules matching a pattern
   */
  async list(pattern?: string): Promise<string[]> {
    const names = Array.from(this.modules.keys())
    if (!pattern) return names

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')  // Temporarily replace **
      .replace(/\*/g, '[^/]*')              // * matches anything except /
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*') // ** matches anything including /

    const regex = new RegExp(`^${regexPattern}$`)
    return names.filter(n => regex.test(n))
  }

  /**
   * Get version history for a module
   */
  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    const versions = this.history.get(name) ?? []
    return limit !== undefined ? versions.slice(0, limit) : versions
  }

  /**
   * Clear all stored modules (useful for testing)
   */
  clear(): void {
    this.modules.clear()
    this.history.clear()
  }

  /**
   * Get the number of stored modules
   */
  get size(): number {
    return this.modules.size
  }
}

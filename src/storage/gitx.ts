/**
 * GitxStorage - Content-addressed storage for ESM modules via gitx.do
 *
 * STUB: This is a placeholder implementation for RED tests.
 * The actual implementation will integrate with gitx.do.
 *
 * Related issues:
 * - esm-xv9: GitxStorage.read() implementation
 * - esm-55y: GitxStorage.write() implementation
 * - esm-n31: GitxStorage.list/delete/versions implementation
 */

import type {
  GitxClient,
  StoredModule,
  WriteResult,
  ModuleVersion,
  ModuleStorage,
} from './types.js'

export class GitxStorage implements ModuleStorage {
  constructor(_client: GitxClient) {
    // TODO: Store client reference
    throw new Error('GitxStorage not implemented')
  }

  async read(_name: string, _version?: string): Promise<StoredModule | null> {
    throw new Error('GitxStorage.read() not implemented')
  }

  async write(_name: string, _module: StoredModule): Promise<WriteResult> {
    throw new Error('GitxStorage.write() not implemented')
  }

  async delete(_name: string): Promise<void> {
    throw new Error('GitxStorage.delete() not implemented')
  }

  async list(_pattern?: string): Promise<string[]> {
    throw new Error('GitxStorage.list() not implemented')
  }

  async versions(_name: string, _limit?: number): Promise<ModuleVersion[]> {
    throw new Error('GitxStorage.versions() not implemented')
  }
}

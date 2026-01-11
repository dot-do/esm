/**
 * Core Storage Module
 *
 * Exports all storage types and implementations for esm.do.
 * ZERO Cloudflare dependencies - platform agnostic.
 */

// Export types
export type {
  StorageTier,
  ModuleVersion,
  WriteResult,
  StoredModule,
  ModuleInput,
  ModuleStorage,
} from './types.js'

// Export runtime value for runtime checks
export { ModuleStorage as ModuleStorageSymbol } from './types.js'

// Export implementations
export { InMemoryStorage } from './memory.js'

/**
 * Resolver Module
 *
 * Provides dependency resolution for ESM modules.
 * ZERO Cloudflare dependencies - platform agnostic.
 */

export {
  DependencyResolver,
  type ParsedImport,
  type DependencyNode,
  type DependencyGraph,
  type ResolvedModule,
  type ModuleFetcher,
} from './dependency.js'

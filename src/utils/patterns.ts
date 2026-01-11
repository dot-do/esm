/**
 * Centralized regex patterns for ESM module management
 *
 * These patterns are used throughout the codebase for:
 * - Module name validation
 * - Export statement detection
 * - Import statement detection
 *
 * Related issues:
 * - esm-4l4k.2: RED - Centralized regex patterns
 * - esm-4l4k.6: GREEN - Create patterns module
 */

/**
 * Pattern for valid ESM module names
 *
 * Format: @scope/name or @scope/nested/path/name
 * - Must start with @
 * - Scope can contain alphanumeric characters, hyphens, and underscores
 * - Path segments can contain alphanumeric characters, hyphens, and underscores
 * - Must have at least one path segment after scope
 * - Cannot have empty segments, path traversal (..), or trailing slashes
 */
export const MODULE_NAME_PATTERN = /^@[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/

/**
 * Pattern for detecting export statements in JavaScript/TypeScript code
 *
 * Matches:
 * - Named exports: export function, export const, export let, export class
 * - Default exports: export default
 * - Re-exports: export { ... } from, export * from, export * as ... from
 *
 * Does NOT match:
 * - Commented out exports (// export ...)
 */
export const EXPORT_PATTERN = /(?:^|[\n;])\s*export\s+(?:default\s+|async\s+)?(?:function|const|let|class|default|\{|\*)/

/**
 * Pattern for detecting import statements in JavaScript/TypeScript code
 *
 * Matches:
 * - Named imports: import { foo } from '...'
 * - Default imports: import foo from '...'
 * - Namespace imports: import * as foo from '...'
 * - Side-effect imports: import '...'
 * - Dynamic imports: import('...') or await import('...')
 *
 * Does NOT match:
 * - require() statements
 * - Commented out imports (// import ...)
 */
export const IMPORT_PATTERN = /(?:^|[\n;])\s*(?:import\s+(?:[\w$*{},\s]+\s+from\s+)?['"`]|(?:^|[^/]).*import\s*\()/

/**
 * Validates whether a string is a valid ESM module name
 *
 * @param name - The module name to validate
 * @returns true if the name is a valid scoped module name
 */
export function isValidModuleName(name: string): boolean {
  return MODULE_NAME_PATTERN.test(name)
}

/**
 * Extracts the scope from a module name (e.g., @scope from @scope/name)
 *
 * @param name - The full module name
 * @returns The scope including the @ symbol, or null if invalid
 */
export function extractModuleScope(name: string): string | null {
  if (!isValidModuleName(name)) {
    return null
  }
  const slashIndex = name.indexOf('/')
  return name.slice(0, slashIndex)
}

/**
 * Extracts the path from a module name (everything after the scope)
 *
 * @param name - The full module name
 * @returns The path portion (e.g., 'name' from @scope/name), or null if invalid
 */
export function extractModulePath(name: string): string | null {
  if (!isValidModuleName(name)) {
    return null
  }
  const slashIndex = name.indexOf('/')
  return name.slice(slashIndex + 1)
}

/**
 * Input sanitization utilities for module code
 *
 * Re-exports sanitization utilities from @dotdo/esm core package.
 * All sanitization logic is now centralized in the core package.
 */

// Re-export all sanitization utilities from core package
export {
  sanitizeModuleCode,
  sanitizeTestCode,
  sanitizeScriptCode,
  sanitizeTypeDefinitions,
  type SanitizationResult,
} from '@dotdo/esm'

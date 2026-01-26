/**
 * Input sanitization utilities for module code
 *
 * Re-exports sanitization utilities from local core package build.
 * All sanitization logic is now centralized in the core package.
 */

// Re-export all sanitization utilities from local core package build
export {
  sanitizeModuleCode,
  sanitizeTestCode,
  sanitizeScriptCode,
  sanitizeTypeDefinitions,
  type SanitizationResult,
} from '../../core/dist/executor/sanitize.js'

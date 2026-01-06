/**
 * Input sanitization utilities for module code
 *
 * Provides validation and sanitization of user-provided code before execution
 * to prevent injection attacks and malicious patterns.
 */

export interface SanitizationResult {
  valid: boolean
  sanitized: string
  warnings: string[]
  errors: string[]
}

/**
 * Dangerous patterns that should be flagged or rejected
 *
 * Note: We rely on ai-evaluate's sandbox for runtime protection against eval/Function.
 * These checks are for basic input hygiene and preventing obvious injection attempts.
 */
const DANGEROUS_PATTERNS = [
  // Script tag injection (HTML/XSS attempts)
  { pattern: /<script[^>]*>/gi, severity: 'error', message: 'Script tags are not allowed in module code' },

  // Null bytes (can cause parsing issues)
  { pattern: /\u0000/g, severity: 'error', message: 'Null bytes are not allowed' },

  // Dangerous Unicode characters that could be used for obfuscation (warnings only)
  { pattern: /[\u200B-\u200D\uFEFF]/g, severity: 'warning', message: 'Zero-width characters detected' },
]

/**
 * Characters that should be normalized or escaped
 */
const NORMALIZATION_RULES = [
  // Remove BOM (Byte Order Mark)
  { pattern: /^\uFEFF/, replacement: '' },

  // Normalize line endings to \n
  { pattern: /\r\n/g, replacement: '\n' },
  { pattern: /\r/g, replacement: '\n' },

  // Remove zero-width spaces
  { pattern: /[\u200B-\u200D\uFEFF]/g, replacement: '' },

  // Remove null bytes
  { pattern: /\u0000/g, replacement: '' },
]

/**
 * Sanitize module code before execution
 *
 * @param code - The module code to sanitize
 * @returns Sanitization result with validation status and sanitized code
 */
export function sanitizeModuleCode(code: string): SanitizationResult {
  const warnings: string[] = []
  const errors: string[] = []
  let sanitized = code

  // Check for dangerous patterns
  for (const { pattern, severity, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      if (severity === 'error') {
        errors.push(message)
      } else {
        warnings.push(message)
      }
    }
  }

  // Apply normalization rules
  for (const { pattern, replacement } of NORMALIZATION_RULES) {
    sanitized = sanitized.replace(pattern, replacement)
  }

  // Trim leading/trailing whitespace
  sanitized = sanitized.trim()

  // Check for empty code after sanitization
  if (!sanitized) {
    errors.push('Code is empty after sanitization')
  }

  // Check for extremely long code (potential DoS)
  const MAX_CODE_SIZE = 1024 * 1024 // 1MB
  if (sanitized.length > MAX_CODE_SIZE) {
    errors.push(`Code exceeds maximum size of ${MAX_CODE_SIZE} bytes`)
  }

  return {
    valid: errors.length === 0,
    sanitized,
    warnings,
    errors,
  }
}

/**
 * Sanitize test code before execution
 *
 * @param code - The test code to sanitize
 * @returns Sanitization result with validation status and sanitized code
 */
export function sanitizeTestCode(code: string): SanitizationResult {
  // Tests have the same sanitization requirements as module code
  return sanitizeModuleCode(code)
}

/**
 * Sanitize script code before execution
 *
 * @param code - The script code to sanitize
 * @returns Sanitization result with validation status and sanitized code
 */
export function sanitizeScriptCode(code: string): SanitizationResult {
  // Scripts have the same sanitization requirements as module code
  return sanitizeModuleCode(code)
}

/**
 * Sanitize type definitions
 *
 * @param types - The TypeScript type definitions to sanitize
 * @returns Sanitization result with validation status and sanitized types
 */
export function sanitizeTypeDefinitions(types: string): SanitizationResult {
  const warnings: string[] = []
  const errors: string[] = []
  let sanitized = types

  // Apply basic normalization
  for (const { pattern, replacement } of NORMALIZATION_RULES) {
    sanitized = sanitized.replace(pattern, replacement)
  }

  // Check for script tags (shouldn't be in type definitions)
  if (/<script[^>]*>/gi.test(sanitized)) {
    errors.push('Script tags are not allowed in type definitions')
  }

  // Check for null bytes
  if (/\u0000/g.test(sanitized)) {
    errors.push('Null bytes are not allowed')
  }

  // Trim whitespace
  sanitized = sanitized.trim()

  // Check for empty types
  if (!sanitized) {
    errors.push('Type definitions are empty after sanitization')
  }

  return {
    valid: errors.length === 0,
    sanitized,
    warnings,
    errors,
  }
}

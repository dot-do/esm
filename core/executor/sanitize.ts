/**
 * Input sanitization utilities for module code
 *
 * Provides validation and sanitization of user-provided code before execution
 * to prevent injection attacks and malicious patterns.
 *
 * ZERO Cloudflare dependencies - platform agnostic.
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

  // eval() calls - direct, window.eval, globalThis.eval, and indirect via assignment
  { pattern: /\beval\s*\(/g, severity: 'error', message: 'eval() is not allowed - dynamic code execution is blocked' },
  { pattern: /\bwindow\s*\.\s*eval\s*\(/g, severity: 'error', message: 'window.eval() is not allowed - dynamic code execution is blocked' },
  { pattern: /\bglobalThis\s*\.\s*eval\s*\(/g, severity: 'error', message: 'globalThis.eval() is not allowed - dynamic code execution is blocked' },
  { pattern: /=\s*eval\b/g, severity: 'error', message: 'Indirect eval assignment is not allowed - dynamic code execution is blocked' },

  // Function constructor - new Function() and Function() calls
  { pattern: /\bnew\s+Function\s*\(/g, severity: 'error', message: 'new Function() is not allowed - dynamic code execution is blocked' },
  { pattern: /\bFunction\s*\(/g, severity: 'error', message: 'Function() constructor is not allowed - dynamic code execution is blocked' },

  // Dynamic import() expressions
  { pattern: /\bimport\s*\(/g, severity: 'error', message: 'Dynamic import() is not allowed - use static imports only' },

  // Prototype pollution prevention - __proto__ access
  { pattern: /__proto__/g, severity: 'error', message: 'Prototype pollution: __proto__ access is not allowed' },

  // Prototype pollution prevention - Object.prototype modification
  { pattern: /Object\s*\.\s*prototype/g, severity: 'error', message: 'Prototype pollution: Object.prototype modification is not allowed' },

  // Prototype pollution prevention - Array.prototype modification
  { pattern: /Array\s*\.\s*prototype/g, severity: 'error', message: 'Prototype pollution: Array.prototype modification is not allowed' },

  // Prototype pollution prevention - Function.prototype modification
  { pattern: /Function\s*\.\s*prototype/g, severity: 'error', message: 'Prototype pollution: Function.prototype modification is not allowed' },

  // Prototype pollution prevention - constructor.prototype access
  { pattern: /\.constructor\s*\.\s*prototype/g, severity: 'error', message: 'Prototype pollution: constructor.prototype access is not allowed' },
]

/**
 * Node.js built-in modules that should be blocked
 */
const BLOCKED_NODE_BUILTINS = [
  'fs', 'fs/promises',
  'child_process',
  'path',
  'os',
  'http', 'https', 'http2',
  'net',
  'dgram',
  'dns',
  'tls',
  'cluster',
  'worker_threads',
  'vm',
  'process',
  'crypto',
  'buffer',
  'stream',
  'util',
  'events',
  'assert',
  'readline',
  'repl',
  'module',
  'url',
  'querystring',
  'string_decoder',
  'timers',
  'tty',
  'v8',
  'zlib',
]

/**
 * Extract import specifiers from code
 */
function extractImportSpecifiers(code: string): string[] {
  const specifiers: string[] = []

  // Match static import statements: import ... from 'specifier'
  const importFromRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g
  let match
  while ((match = importFromRegex.exec(code)) !== null) {
    const specifier = match[1]
    if (specifier !== undefined) specifiers.push(specifier)
  }

  // Match export ... from 'specifier'
  const exportFromRegex = /export\s+(?:[\w\s{},*]+\s+from\s+)['"]([^'"]+)['"]/g
  while ((match = exportFromRegex.exec(code)) !== null) {
    const specifier = match[1]
    if (specifier !== undefined) specifiers.push(specifier)
  }

  return specifiers
}

/**
 * Check if an import specifier is allowed
 */
function isAllowedImport(specifier: string): { allowed: boolean; reason?: string } {
  // Allow relative imports
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return { allowed: true }
  }

  // Allow esm.do imports
  if (specifier.startsWith('esm.do/')) {
    return { allowed: true }
  }

  // Block URL imports to external domains
  if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
    return { allowed: false, reason: `External URL import '${specifier}' is not allowed` }
  }

  // Block Node.js built-ins
  const baseModule = specifier.split('/')[0] ?? specifier
  if (BLOCKED_NODE_BUILTINS.includes(baseModule) || BLOCKED_NODE_BUILTINS.includes(specifier)) {
    return { allowed: false, reason: `Node.js built-in '${specifier}' is blocked` }
  }

  // Block node: protocol
  if (specifier.startsWith('node:')) {
    const moduleName = specifier.slice(5)
    return { allowed: false, reason: `Node.js built-in 'node:${moduleName}' is blocked` }
  }

  // Block all other external packages (npm packages)
  return { allowed: false, reason: `External package '${specifier}' is not allowed - only esm.do/ and relative imports are permitted` }
}

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
    // Reset lastIndex for global regexes to ensure consistent matching
    pattern.lastIndex = 0
    if (pattern.test(code)) {
      if (severity === 'error') {
        errors.push(message)
      } else {
        warnings.push(message)
      }
    }
  }

  // Validate imports
  const importSpecifiers = extractImportSpecifiers(code)
  for (const specifier of importSpecifiers) {
    const result = isAllowedImport(specifier)
    if (!result.allowed && result.reason) {
      errors.push(result.reason)
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

  // Check for empty types - allow with warning (empty types are valid but unusual)
  if (!sanitized) {
    warnings.push('Type definitions are empty')
  }

  return {
    valid: errors.length === 0,
    sanitized,
    warnings,
    errors,
  }
}

// src/utils/exports.ts
// Shared utility for extracting export names from ESM module code

/**
 * Remove comments and strings from code to avoid false matches
 */
function stripCommentsAndStrings(code: string): string {
  // Replace string contents (both single and double quoted) with placeholder
  // This handles template literals, single quotes, and double quotes
  let result = code

  // Remove single-line comments
  result = result.replace(/\/\/.*$/gm, '')

  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')

  // Replace string contents with empty placeholders (preserve quotes to maintain structure)
  // Double-quoted strings
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""')
  // Single-quoted strings
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''")
  // Template literals (simple case - doesn't handle nested)
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '``')

  return result
}

/**
 * Extract export names from module code
 * Handles: function, const, let, var, class, async function, default exports,
 * re-exports, renamed exports, namespace exports, and destructured exports
 */
export function extractExportNames(moduleCode: string): string[] {
  const names: string[] = []

  // Strip comments and strings to avoid false matches
  const cleanCode = stripCommentsAndStrings(moduleCode)

  // Match export function name (including async)
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g
  let match
  while ((match = funcRegex.exec(cleanCode)) !== null) {
    const name = match[1]
    if (name) names.push(name)
  }

  // Match export const name (simple assignment)
  const constRegex = /export\s+const\s+(\w+)\s*=/g
  while ((match = constRegex.exec(cleanCode)) !== null) {
    const name = match[1]
    if (name) names.push(name)
  }

  // Match export const { a, b } = ... (object destructuring)
  const constDestructObjRegex = /export\s+const\s+\{\s*([^}]+)\s*\}\s*=/g
  while ((match = constDestructObjRegex.exec(cleanCode)) !== null) {
    const matchContent = match[1]
    if (matchContent) {
      const destructured = matchContent.split(',').map(s => s.trim().split(':')[0]?.trim()).filter((n): n is string => !!n && n.length > 0)
      names.push(...destructured)
    }
  }

  // Match export const [a, b] = ... (array destructuring)
  const constDestructArrRegex = /export\s+const\s+\[\s*([^\]]+)\s*\]\s*=/g
  while ((match = constDestructArrRegex.exec(cleanCode)) !== null) {
    const matchContent = match[1]
    if (matchContent) {
      const destructured = matchContent.split(',').map(s => s.trim())
      names.push(...destructured.filter(n => n.length > 0 && /^\w+$/.test(n)))
    }
  }

  // Match export let name
  const letRegex = /export\s+let\s+(\w+)/g
  while ((match = letRegex.exec(cleanCode)) !== null) {
    const name = match[1]
    if (name) names.push(name)
  }

  // Match export var name
  const varRegex = /export\s+var\s+(\w+)/g
  while ((match = varRegex.exec(cleanCode)) !== null) {
    const name = match[1]
    if (name) names.push(name)
  }

  // Match export class name (including abstract class)
  const classRegex = /export\s+(?:abstract\s+)?class\s+(\w+)/g
  while ((match = classRegex.exec(cleanCode)) !== null) {
    const name = match[1]
    if (name) names.push(name)
  }

  // Match export default (any form)
  const defaultRegex = /export\s+default\s+/g
  if (defaultRegex.test(cleanCode)) {
    names.push('default')
  }

  // Match export { a, b } from './module' or export { a, b }
  // Also handles renamed exports: export { foo as bar }
  const namedExportRegex = /export\s+\{([^}]+)\}/g
  while ((match = namedExportRegex.exec(cleanCode)) !== null) {
    const matchContent = match[1]
    if (!matchContent) continue
    const exports = matchContent.split(',')
    for (const exp of exports) {
      const trimmed = exp.trim()
      // Handle "foo as bar" - we want "bar"
      const asMatch = trimmed.match(/\w+\s+as\s+(\w+)/)
      if (asMatch?.[1]) {
        names.push(asMatch[1])
      } else {
        // Just the identifier
        const simpleMatch = trimmed.match(/^(\w+)$/)
        if (simpleMatch?.[1]) {
          names.push(simpleMatch[1])
        }
      }
    }
  }

  // Match export * as name from './module' (namespace re-export)
  const namespaceExportRegex = /export\s+\*\s+as\s+(\w+)\s+from/g
  while ((match = namespaceExportRegex.exec(cleanCode)) !== null) {
    const name = match[1]
    if (name) names.push(name)
  }

  // Note: export * from './module' doesn't create named exports, just passes through
  // so we don't need to handle it

  return names
}

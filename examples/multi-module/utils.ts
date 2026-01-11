/**
 * Multi-Module Example - Utility Module
 *
 * Shared utilities used by other modules in this example.
 * Demonstrates creating reusable, dependency-free modules.
 */

import { ESM } from '@dotdo/esm'

// Type definitions
export const types = `
/**
 * Formats a number as currency
 * @param amount - The amount to format
 * @param currency - Currency code (default: USD)
 * @returns Formatted currency string
 */
export declare function formatCurrency(amount: number, currency?: string): string

/**
 * Formats a date in a human-readable format
 * @param date - The date to format
 * @param format - Format type: 'short', 'long', 'iso'
 * @returns Formatted date string
 */
export declare function formatDate(date: Date, format?: 'short' | 'long' | 'iso'): string

/**
 * Generates a unique ID
 * @param prefix - Optional prefix for the ID
 * @returns Unique identifier string
 */
export declare function generateId(prefix?: string): string

/**
 * Validates an email address
 * @param email - Email to validate
 * @returns True if valid
 */
export declare function isValidEmail(email: string): boolean

/**
 * Slugifies a string for use in URLs
 * @param text - Text to slugify
 * @returns URL-safe slug
 */
export declare function slugify(text: string): string

/**
 * Deep clones an object
 * @param obj - Object to clone
 * @returns Cloned object
 */
export declare function deepClone<T>(obj: T): T

/**
 * Debounces a function
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export declare function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T
`

// Module implementation
export const module = `
export function formatCurrency(amount, currency = 'USD') {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' }
  const symbol = symbols[currency] || currency + ' '
  return symbol + amount.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',')
}

export function formatDate(date, format = 'short') {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date')
  }

  if (format === 'iso') {
    return date.toISOString()
  }

  const options = format === 'long'
    ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' }

  return date.toLocaleDateString('en-US', options)
}

export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return prefix ? \`\${prefix}_\${timestamp}\${random}\` : \`\${timestamp}\${random}\`
}

export function isValidEmail(email) {
  if (typeof email !== 'string') return false
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\\w\\s-]/g, '')
    .replace(/[\\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj)
  if (Array.isArray(obj)) return obj.map(item => deepClone(item))

  const cloned = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key])
    }
  }
  return cloned
}

export function debounce(fn, delay) {
  let timeoutId
  return function(...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}
`

// Tests
export const tests = `
describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56')
  })

  it('formats EUR correctly', () => {
    expect(formatCurrency(1000, 'EUR')).toBe('€1,000.00')
  })

  it('handles small amounts', () => {
    expect(formatCurrency(0.99)).toBe('$0.99')
  })
})

describe('formatDate', () => {
  it('formats date in short format', () => {
    const date = new Date('2024-03-15')
    const result = formatDate(date, 'short')
    expect(result).toContain('2024')
  })

  it('formats date in ISO format', () => {
    const date = new Date('2024-03-15T12:00:00Z')
    const result = formatDate(date, 'iso')
    expect(result).toContain('2024-03-15')
  })

  it('throws on invalid date', () => {
    expect(() => formatDate(new Date('invalid'))).toThrow()
  })
})

describe('generateId', () => {
  it('generates unique IDs', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })

  it('includes prefix when provided', () => {
    const id = generateId('user')
    expect(id.startsWith('user_')).toBe(true)
  })
})

describe('isValidEmail', () => {
  it('validates correct emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
  })

  it('rejects invalid emails', () => {
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
  })
})

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('Hello! World?')).toBe('hello-world')
  })

  it('handles multiple spaces', () => {
    expect(slugify('Hello   World')).toBe('hello-world')
  })
})

describe('deepClone', () => {
  it('clones objects', () => {
    const obj = { a: 1, b: { c: 2 } }
    const clone = deepClone(obj)
    expect(clone).toEqual(obj)
    expect(clone).not.toBe(obj)
    expect(clone.b).not.toBe(obj.b)
  })

  it('clones arrays', () => {
    const arr = [1, [2, 3]]
    const clone = deepClone(arr)
    expect(clone).toEqual(arr)
    expect(clone).not.toBe(arr)
  })

  it('handles null and primitives', () => {
    expect(deepClone(null)).toBe(null)
    expect(deepClone(42)).toBe(42)
    expect(deepClone('string')).toBe('string')
  })
})
`

// Script
export const script = `
console.log('Utility Functions Demo')
console.log('======================\\n')

// Currency formatting
console.log('Currency Formatting:')
console.log(\`  $1234.56 -> \${formatCurrency(1234.56)}\`)
console.log(\`  €2500 -> \${formatCurrency(2500, 'EUR')}\`)

// Date formatting
console.log('\\nDate Formatting:')
const now = new Date()
console.log(\`  Short: \${formatDate(now, 'short')}\`)
console.log(\`  Long: \${formatDate(now, 'long')}\`)
console.log(\`  ISO: \${formatDate(now, 'iso')}\`)

// ID generation
console.log('\\nID Generation:')
console.log(\`  Plain: \${generateId()}\`)
console.log(\`  With prefix: \${generateId('user')}\`)

// Email validation
console.log('\\nEmail Validation:')
console.log(\`  test@example.com: \${isValidEmail('test@example.com')}\`)
console.log(\`  invalid: \${isValidEmail('invalid')}\`)

// Slugification
console.log('\\nSlugification:')
console.log(\`  "Hello World!" -> \${slugify('Hello World!')}\`)

return {
  functions: ['formatCurrency', 'formatDate', 'generateId', 'isValidEmail', 'slugify', 'deepClone', 'debounce']
}
`

// Create the module
async function main() {
  const esm = ESM.create()

  console.log('Writing utils module...')

  const result = await esm.write({
    name: '@examples/multi-module/utils',
    types,
    module,
    tests,
    script,
  })

  console.log(`Utils module written: ${result.version}`)
  return result
}

export { main }

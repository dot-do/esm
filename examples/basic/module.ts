/**
 * Basic Example - Simple ESM Module
 *
 * Demonstrates the fundamental structure of an esm.do module:
 * - Type definitions (types)
 * - Implementation (module)
 * - Tests
 * - Executable script
 */

import { ESM } from '@dotdo/esm'

// Type definitions for the module
const types = `
/**
 * Greets a person by name
 * @param name - The name of the person to greet
 * @returns A greeting message
 */
export declare function greet(name: string): string

/**
 * Adds two numbers together
 * @param a - First number
 * @param b - Second number
 * @returns The sum of a and b
 */
export declare function add(a: number, b: number): number

/**
 * Formats a date as a human-readable string
 * @param date - The date to format
 * @returns Formatted date string (YYYY-MM-DD)
 */
export declare function formatDate(date: Date): string
`

// Module implementation
const module = `
export function greet(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Name must be a non-empty string')
  }
  return \`Hello, \${name}!\`
}

export function add(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both arguments must be numbers')
  }
  return a + b
}

export function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date')
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return \`\${year}-\${month}-\${day}\`
}
`

// Test suite
const tests = `
describe('greet', () => {
  it('greets a person by name', () => {
    expect(greet('World')).toBe('Hello, World!')
  })

  it('greets with different names', () => {
    expect(greet('Alice')).toBe('Hello, Alice!')
    expect(greet('Bob')).toBe('Hello, Bob!')
  })

  it('throws on empty name', () => {
    expect(() => greet('')).toThrow('Name must be a non-empty string')
  })

  it('throws on non-string name', () => {
    expect(() => greet(123)).toThrow('Name must be a non-empty string')
  })
})

describe('add', () => {
  it('adds positive numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('adds negative numbers', () => {
    expect(add(-1, -2)).toBe(-3)
  })

  it('adds zero', () => {
    expect(add(0, 5)).toBe(5)
  })

  it('handles decimal numbers', () => {
    expect(add(1.5, 2.5)).toBe(4)
  })

  it('throws on non-number arguments', () => {
    expect(() => add('1', 2)).toThrow('Both arguments must be numbers')
  })
})

describe('formatDate', () => {
  it('formats a date correctly', () => {
    const date = new Date('2024-03-15')
    expect(formatDate(date)).toBe('2024-03-15')
  })

  it('pads single digit months and days', () => {
    const date = new Date('2024-01-05')
    expect(formatDate(date)).toBe('2024-01-05')
  })

  it('throws on invalid date', () => {
    expect(() => formatDate(new Date('invalid'))).toThrow('Invalid date')
  })
})
`

// Executable script
const script = `
// Demonstrate the module functionality
console.log('Basic Module Demo')
console.log('=================')

// Test greet function
const greeting = greet('ESM.do User')
console.log(greeting)

// Test add function
const sum = add(10, 20)
console.log(\`10 + 20 = \${sum}\`)

// Test formatDate function
const today = formatDate(new Date())
console.log(\`Today's date: \${today}\`)

// Return a summary object
return {
  greeting,
  sum,
  today
}
`

// Create and run the example
async function main() {
  const esm = ESM.create()

  console.log('Writing basic module...')

  const result = await esm.write({
    name: '@examples/basic',
    types,
    module,
    tests,
    script,
  })

  console.log('Module written successfully!')
  console.log(`Version: ${result.version}`)
  console.log(`Tests: ${result.testResults?.passed}/${result.testResults?.total} passed`)

  // Run the script
  console.log('\nRunning module script...')
  const runResult = await esm.run('@examples/basic')
  console.log('Script output:', runResult.value)
}

main().catch(console.error)

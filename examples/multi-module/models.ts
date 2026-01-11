/**
 * Multi-Module Example - Models Module
 *
 * Data models that depend on the utils module.
 * Demonstrates importing from other esm.do modules.
 */

import { ESM } from '@dotdo/esm'

// Type definitions
export const types = `
/**
 * Product model
 */
export interface Product {
  id: string
  name: string
  slug: string
  price: number
  description: string
  createdAt: Date
}

/**
 * Order model
 */
export interface Order {
  id: string
  customerId: string
  items: OrderItem[]
  total: number
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered'
  createdAt: Date
}

/**
 * Order item
 */
export interface OrderItem {
  productId: string
  quantity: number
  unitPrice: number
  subtotal: number
}

/**
 * Creates a new product
 */
export declare function createProduct(input: { name: string; price: number; description?: string }): Product

/**
 * Creates a new order
 */
export declare function createOrder(customerId: string, items: Array<{ productId: string; quantity: number; unitPrice: number }>): Order

/**
 * Calculates order total
 */
export declare function calculateTotal(items: OrderItem[]): number

/**
 * Formats a product for display
 */
export declare function formatProduct(product: Product): string

/**
 * Formats an order for display
 */
export declare function formatOrder(order: Order): string
`

// Module implementation - imports from utils
export const module = `
// Import utilities from the utils module
import { generateId, slugify, formatCurrency, formatDate } from 'esm.do/@examples/multi-module/utils'

export function createProduct(input) {
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('Product name is required')
  }
  if (typeof input.price !== 'number' || input.price < 0) {
    throw new Error('Valid price is required')
  }

  return {
    id: generateId('prod'),
    name: input.name,
    slug: slugify(input.name),
    price: input.price,
    description: input.description || '',
    createdAt: new Date()
  }
}

export function createOrder(customerId, items) {
  if (!customerId) {
    throw new Error('Customer ID is required')
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must have at least one item')
  }

  const orderItems = items.map(item => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.quantity * item.unitPrice
  }))

  return {
    id: generateId('order'),
    customerId,
    items: orderItems,
    total: calculateTotal(orderItems),
    status: 'pending',
    createdAt: new Date()
  }
}

export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.subtotal, 0)
}

export function formatProduct(product) {
  return \`\${product.name} - \${formatCurrency(product.price)}
  Slug: \${product.slug}
  Created: \${formatDate(product.createdAt, 'short')}\`
}

export function formatOrder(order) {
  const itemLines = order.items.map(item =>
    \`  - Product \${item.productId}: \${item.quantity} x \${formatCurrency(item.unitPrice)} = \${formatCurrency(item.subtotal)}\`
  ).join('\\n')

  return \`Order \${order.id}
Customer: \${order.customerId}
Status: \${order.status}
Items:
\${itemLines}
Total: \${formatCurrency(order.total)}
Created: \${formatDate(order.createdAt, 'short')}\`
}
`

// Tests
export const tests = `
describe('createProduct', () => {
  it('creates a product with required fields', () => {
    const product = createProduct({ name: 'Test Product', price: 29.99 })
    expect(product.name).toBe('Test Product')
    expect(product.price).toBe(29.99)
    expect(product.slug).toBe('test-product')
    expect(product.id).toMatch(/^prod_/)
  })

  it('throws on missing name', () => {
    expect(() => createProduct({ name: '', price: 10 })).toThrow()
  })

  it('throws on negative price', () => {
    expect(() => createProduct({ name: 'Test', price: -5 })).toThrow()
  })
})

describe('createOrder', () => {
  it('creates an order with items', () => {
    const order = createOrder('cust_123', [
      { productId: 'prod_1', quantity: 2, unitPrice: 10 },
      { productId: 'prod_2', quantity: 1, unitPrice: 25 }
    ])

    expect(order.customerId).toBe('cust_123')
    expect(order.items.length).toBe(2)
    expect(order.total).toBe(45)
    expect(order.status).toBe('pending')
  })

  it('throws on empty items', () => {
    expect(() => createOrder('cust_123', [])).toThrow()
  })
})

describe('calculateTotal', () => {
  it('sums item subtotals', () => {
    const items = [
      { productId: 'a', quantity: 2, unitPrice: 10, subtotal: 20 },
      { productId: 'b', quantity: 3, unitPrice: 5, subtotal: 15 }
    ]
    expect(calculateTotal(items)).toBe(35)
  })

  it('handles empty array', () => {
    expect(calculateTotal([])).toBe(0)
  })
})

describe('formatProduct', () => {
  it('formats product nicely', () => {
    const product = createProduct({ name: 'Test', price: 99.99 })
    const formatted = formatProduct(product)
    expect(formatted).toContain('Test')
    expect(formatted).toContain('$99.99')
  })
})

describe('formatOrder', () => {
  it('formats order nicely', () => {
    const order = createOrder('cust_1', [{ productId: 'p1', quantity: 1, unitPrice: 50 }])
    const formatted = formatOrder(order)
    expect(formatted).toContain('Order')
    expect(formatted).toContain('$50.00')
  })
})
`

// Script
export const script = `
console.log('Models Module Demo')
console.log('==================\\n')

// Create products
console.log('Creating products...')
const laptop = createProduct({
  name: 'Pro Laptop 15"',
  price: 1299.99,
  description: 'High-performance laptop'
})
const mouse = createProduct({
  name: 'Wireless Mouse',
  price: 49.99
})

console.log('\\nProducts created:')
console.log(formatProduct(laptop))
console.log()
console.log(formatProduct(mouse))

// Create order
console.log('\\n---\\n')
console.log('Creating order...')

const order = createOrder('cust_abc123', [
  { productId: laptop.id, quantity: 1, unitPrice: laptop.price },
  { productId: mouse.id, quantity: 2, unitPrice: mouse.price }
])

console.log('\\nOrder created:')
console.log(formatOrder(order))

return {
  products: [laptop.id, mouse.id],
  orderId: order.id,
  orderTotal: order.total
}
`

// Create the module
async function main() {
  const esm = ESM.create()

  console.log('Writing models module...')

  const result = await esm.write({
    name: '@examples/multi-module/models',
    types,
    module,
    tests,
    script,
  })

  console.log(`Models module written: ${result.version}`)
  return result
}

export { main }

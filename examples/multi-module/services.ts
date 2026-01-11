/**
 * Multi-Module Example - Services Module
 *
 * Business logic services that depend on both utils and models.
 * Demonstrates complex dependency chains.
 */

import { ESM } from '@dotdo/esm'

// Type definitions
export const types = `
/**
 * Shopping cart
 */
export interface Cart {
  id: string
  customerId: string
  items: CartItem[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Cart item
 */
export interface CartItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
}

/**
 * Checkout result
 */
export interface CheckoutResult {
  success: boolean
  orderId?: string
  error?: string
}

/**
 * Inventory status
 */
export interface InventoryStatus {
  productId: string
  available: number
  reserved: number
}

/**
 * Creates a new shopping cart
 */
export declare function createCart(customerId: string): Cart

/**
 * Adds an item to the cart
 */
export declare function addToCart(cart: Cart, productId: string, productName: string, quantity: number, unitPrice: number): Cart

/**
 * Removes an item from the cart
 */
export declare function removeFromCart(cart: Cart, productId: string): Cart

/**
 * Updates item quantity in cart
 */
export declare function updateQuantity(cart: Cart, productId: string, quantity: number): Cart

/**
 * Calculates cart total
 */
export declare function getCartTotal(cart: Cart): number

/**
 * Processes checkout
 */
export declare function checkout(cart: Cart): CheckoutResult

/**
 * Validates cart items
 */
export declare function validateCart(cart: Cart): { valid: boolean; errors: string[] }
`

// Module implementation - imports from both utils and models
export const module = `
// Import from utils
import { generateId, formatCurrency } from 'esm.do/@examples/multi-module/utils'
// Import from models
import { createOrder } from 'esm.do/@examples/multi-module/models'

export function createCart(customerId) {
  if (!customerId) {
    throw new Error('Customer ID is required')
  }

  const now = new Date()
  return {
    id: generateId('cart'),
    customerId,
    items: [],
    createdAt: now,
    updatedAt: now
  }
}

export function addToCart(cart, productId, productName, quantity, unitPrice) {
  if (quantity <= 0) {
    throw new Error('Quantity must be positive')
  }
  if (unitPrice < 0) {
    throw new Error('Price cannot be negative')
  }

  const existingIndex = cart.items.findIndex(item => item.productId === productId)

  let newItems
  if (existingIndex >= 0) {
    // Update existing item
    newItems = cart.items.map((item, index) =>
      index === existingIndex
        ? { ...item, quantity: item.quantity + quantity }
        : item
    )
  } else {
    // Add new item
    newItems = [...cart.items, { productId, productName, quantity, unitPrice }]
  }

  return {
    ...cart,
    items: newItems,
    updatedAt: new Date()
  }
}

export function removeFromCart(cart, productId) {
  return {
    ...cart,
    items: cart.items.filter(item => item.productId !== productId),
    updatedAt: new Date()
  }
}

export function updateQuantity(cart, productId, quantity) {
  if (quantity <= 0) {
    return removeFromCart(cart, productId)
  }

  return {
    ...cart,
    items: cart.items.map(item =>
      item.productId === productId
        ? { ...item, quantity }
        : item
    ),
    updatedAt: new Date()
  }
}

export function getCartTotal(cart) {
  return cart.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
}

export function validateCart(cart) {
  const errors = []

  if (!cart.customerId) {
    errors.push('Cart has no customer')
  }

  if (cart.items.length === 0) {
    errors.push('Cart is empty')
  }

  for (const item of cart.items) {
    if (item.quantity <= 0) {
      errors.push(\`Invalid quantity for \${item.productName}\`)
    }
    if (item.unitPrice < 0) {
      errors.push(\`Invalid price for \${item.productName}\`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function checkout(cart) {
  const validation = validateCart(cart)

  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join('; ')
    }
  }

  try {
    // Convert cart items to order items
    const orderItems = cart.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }))

    // Create the order using the models module
    const order = createOrder(cart.customerId, orderItems)

    return {
      success: true,
      orderId: order.id
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

// Format cart for display
export function formatCart(cart) {
  const itemLines = cart.items.map(item => {
    const subtotal = item.quantity * item.unitPrice
    return \`  \${item.productName}: \${item.quantity} x \${formatCurrency(item.unitPrice)} = \${formatCurrency(subtotal)}\`
  }).join('\\n')

  return \`Cart \${cart.id}
Customer: \${cart.customerId}
Items:
\${itemLines || '  (empty)'}
Total: \${formatCurrency(getCartTotal(cart))}\`
}
`

// Tests
export const tests = `
describe('createCart', () => {
  it('creates an empty cart', () => {
    const cart = createCart('cust_123')
    expect(cart.customerId).toBe('cust_123')
    expect(cart.items).toEqual([])
    expect(cart.id).toMatch(/^cart_/)
  })

  it('throws without customer ID', () => {
    expect(() => createCart('')).toThrow()
  })
})

describe('addToCart', () => {
  it('adds item to empty cart', () => {
    const cart = createCart('cust_1')
    const updated = addToCart(cart, 'prod_1', 'Test Product', 2, 10)
    expect(updated.items.length).toBe(1)
    expect(updated.items[0].quantity).toBe(2)
  })

  it('increases quantity for existing item', () => {
    let cart = createCart('cust_1')
    cart = addToCart(cart, 'prod_1', 'Test', 2, 10)
    cart = addToCart(cart, 'prod_1', 'Test', 3, 10)
    expect(cart.items.length).toBe(1)
    expect(cart.items[0].quantity).toBe(5)
  })

  it('throws on zero quantity', () => {
    const cart = createCart('cust_1')
    expect(() => addToCart(cart, 'prod_1', 'Test', 0, 10)).toThrow()
  })
})

describe('removeFromCart', () => {
  it('removes item from cart', () => {
    let cart = createCart('cust_1')
    cart = addToCart(cart, 'prod_1', 'Test', 1, 10)
    cart = removeFromCart(cart, 'prod_1')
    expect(cart.items.length).toBe(0)
  })
})

describe('updateQuantity', () => {
  it('updates item quantity', () => {
    let cart = createCart('cust_1')
    cart = addToCart(cart, 'prod_1', 'Test', 2, 10)
    cart = updateQuantity(cart, 'prod_1', 5)
    expect(cart.items[0].quantity).toBe(5)
  })

  it('removes item when quantity is zero', () => {
    let cart = createCart('cust_1')
    cart = addToCart(cart, 'prod_1', 'Test', 2, 10)
    cart = updateQuantity(cart, 'prod_1', 0)
    expect(cart.items.length).toBe(0)
  })
})

describe('getCartTotal', () => {
  it('calculates total correctly', () => {
    let cart = createCart('cust_1')
    cart = addToCart(cart, 'prod_1', 'A', 2, 10)
    cart = addToCart(cart, 'prod_2', 'B', 3, 5)
    expect(getCartTotal(cart)).toBe(35)
  })

  it('returns 0 for empty cart', () => {
    const cart = createCart('cust_1')
    expect(getCartTotal(cart)).toBe(0)
  })
})

describe('validateCart', () => {
  it('validates valid cart', () => {
    let cart = createCart('cust_1')
    cart = addToCart(cart, 'prod_1', 'Test', 1, 10)
    const result = validateCart(cart)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('invalidates empty cart', () => {
    const cart = createCart('cust_1')
    const result = validateCart(cart)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Cart is empty')
  })
})

describe('checkout', () => {
  it('succeeds for valid cart', () => {
    let cart = createCart('cust_1')
    cart = addToCart(cart, 'prod_1', 'Test', 1, 50)
    const result = checkout(cart)
    expect(result.success).toBe(true)
    expect(result.orderId).toMatch(/^order_/)
  })

  it('fails for empty cart', () => {
    const cart = createCart('cust_1')
    const result = checkout(cart)
    expect(result.success).toBe(false)
    expect(result.error).toContain('empty')
  })
})
`

// Script
export const script = `
console.log('Services Module Demo')
console.log('====================\\n')

// Create cart
console.log('Creating shopping cart...')
let cart = createCart('customer_12345')
console.log(\`Cart created: \${cart.id}\`)

// Add items
console.log('\\nAdding items...')
cart = addToCart(cart, 'prod_laptop', 'Pro Laptop 15"', 1, 1299.99)
cart = addToCart(cart, 'prod_mouse', 'Wireless Mouse', 2, 49.99)
cart = addToCart(cart, 'prod_keyboard', 'Mechanical Keyboard', 1, 149.99)

console.log('\\nCurrent cart:')
console.log(formatCart(cart))

// Modify cart
console.log('\\n---\\n')
console.log('Updating quantities...')
cart = updateQuantity(cart, 'prod_mouse', 1) // Reduce mouse quantity
console.log('Removed one mouse')

// Remove an item
cart = removeFromCart(cart, 'prod_keyboard')
console.log('Removed keyboard')

console.log('\\nUpdated cart:')
console.log(formatCart(cart))

// Validate and checkout
console.log('\\n---\\n')
console.log('Validating cart...')
const validation = validateCart(cart)
console.log(\`Valid: \${validation.valid}\`)

console.log('\\nProcessing checkout...')
const result = checkout(cart)

if (result.success) {
  console.log(\`Order created: \${result.orderId}\`)
} else {
  console.log(\`Checkout failed: \${result.error}\`)
}

return {
  cartId: cart.id,
  itemCount: cart.items.length,
  total: getCartTotal(cart),
  checkoutSuccess: result.success,
  orderId: result.orderId
}
`

// Create the module
async function main() {
  const esm = ESM.create()

  console.log('Writing services module...')

  const result = await esm.write({
    name: '@examples/multi-module/services',
    types,
    module,
    tests,
    script,
  })

  console.log(`Services module written: ${result.version}`)
  return result
}

export { main }

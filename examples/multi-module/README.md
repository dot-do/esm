# Multi-Module Example

This example demonstrates how to create interconnected esm.do modules with dependencies, showing the dependency resolution and import capabilities.

## Module Structure

```
@examples/multi-module/
├── utils.ts      # Shared utilities (no dependencies)
├── models.ts     # Data models (imports from utils)
├── services.ts   # Business logic (imports from utils and models)
├── index.ts      # Main entry point
└── README.md     # This file
```

## Dependency Graph

```
@examples/multi-module/utils     (foundation - no dependencies)
           |
           v
@examples/multi-module/models    (imports from utils)
           |
           v
@examples/multi-module/services  (imports from both utils and models)
```

## Running the Example

```bash
# Run the full multi-module demo
npx tsx examples/multi-module/index.ts

# Run individual modules
npx tsx examples/multi-module/utils.ts
npx tsx examples/multi-module/models.ts
npx tsx examples/multi-module/services.ts
```

## Module Details

### Utils Module (`@examples/multi-module/utils`)

Foundation module providing reusable utilities:

- `formatCurrency(amount, currency)` - Format numbers as currency
- `formatDate(date, format)` - Format dates
- `generateId(prefix)` - Generate unique IDs
- `isValidEmail(email)` - Validate email addresses
- `slugify(text)` - Create URL-safe slugs
- `deepClone(obj)` - Deep clone objects
- `debounce(fn, delay)` - Debounce function calls

### Models Module (`@examples/multi-module/models`)

Data models that import from utils:

```typescript
// Uses generateId and slugify from utils
import { generateId, slugify } from 'esm.do/@examples/multi-module/utils'

export function createProduct(input) {
  return {
    id: generateId('prod'),
    slug: slugify(input.name),
    // ...
  }
}
```

Exports:
- `createProduct(input)` - Create a product
- `createOrder(customerId, items)` - Create an order
- `calculateTotal(items)` - Calculate order total
- `formatProduct(product)` - Format product for display
- `formatOrder(order)` - Format order for display

### Services Module (`@examples/multi-module/services`)

Business logic that imports from both utils and models:

```typescript
// Multi-level imports
import { generateId, formatCurrency } from 'esm.do/@examples/multi-module/utils'
import { createOrder } from 'esm.do/@examples/multi-module/models'

export function checkout(cart) {
  const order = createOrder(cart.customerId, cart.items)
  // ...
}
```

Exports:
- `createCart(customerId)` - Create shopping cart
- `addToCart(cart, ...)` - Add item to cart
- `removeFromCart(cart, productId)` - Remove item
- `updateQuantity(cart, productId, quantity)` - Update quantity
- `getCartTotal(cart)` - Calculate cart total
- `validateCart(cart)` - Validate cart
- `checkout(cart)` - Process checkout
- `formatCart(cart)` - Format cart for display

## How Imports Work

### Import Syntax

esm.do modules use a special import syntax:

```typescript
import { functionName } from 'esm.do/@scope/module-name'
```

### Dependency Resolution

When a module is executed, esm.do:

1. Parses the module code for `esm.do/*` imports
2. Recursively resolves all dependencies
3. Bundles dependencies into the execution context
4. Executes the module with all dependencies available

### Circular Dependencies

esm.do handles circular dependencies by:

1. Detecting cycles during resolution
2. Breaking cycles with lazy evaluation
3. Reporting warnings for potential issues

## Best Practices

### 1. Keep Utils Dependency-Free

The utils module should have no dependencies to serve as a stable foundation:

```typescript
// Good - no esm.do imports
export function formatCurrency(amount) { ... }

// Avoid - creates dependency on other modules
import { something } from 'esm.do/@other/module'
```

### 2. Single Responsibility

Each module should have a clear, focused purpose:

- `utils` - Generic utilities
- `models` - Data structures and factories
- `services` - Business logic and workflows

### 3. Import Only What You Need

Use named imports rather than importing entire modules:

```typescript
// Good - specific imports
import { generateId, formatDate } from 'esm.do/@examples/utils'

// Avoid - importing everything
import * as utils from 'esm.do/@examples/utils'
```

### 4. Document Dependencies

Make dependencies explicit in your module's documentation:

```typescript
/**
 * @module @examples/services
 * @depends @examples/utils
 * @depends @examples/models
 */
```

## Version Management

When updating modules, consider the dependency chain:

1. **Backward Compatible Changes** - Safe to update
2. **Breaking Changes** - Update dependents first
3. **New Features** - Add without affecting dependents

```bash
# Check what depends on a module
esm deps @examples/multi-module/utils

# Update modules in order
esm write @examples/multi-module/utils --types="..." --module="..."
esm write @examples/multi-module/models --types="..." --module="..."
esm write @examples/multi-module/services --types="..." --module="..."
```

## Testing Across Modules

Each module has its own tests, but you can also test the integration:

```typescript
describe('Multi-module integration', () => {
  it('creates product and adds to cart', () => {
    const product = createProduct({ name: 'Test', price: 10 })
    let cart = createCart('customer')
    cart = addToCart(cart, product.id, product.name, 1, product.price)
    const result = checkout(cart)
    expect(result.success).toBe(true)
  })
})
```

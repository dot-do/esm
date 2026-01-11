# esm.do Examples

This directory contains example applications demonstrating various esm.do usage patterns. Each example is self-contained and can be run independently.

## Examples Overview

| Example | Description | Key Concepts |
|---------|-------------|--------------|
| [basic](./basic/) | Simple module with types, tests, and script | Module structure, testing, execution |
| [api-proxy](./api-proxy/) | External API integration | Fetch, error handling, response transformation |
| [ai-function](./ai-function/) | AI-powered text processing | Sentiment analysis, classification, generation |
| [crud-api](./crud-api/) | Complete CRUD operations | Validation, pagination, search |
| [scheduled-task](./scheduled-task/) | Cron-based task scheduling | Cron parsing, task history, scheduling |
| [multi-module](./multi-module/) | Interconnected modules | Dependencies, imports, module graphs |

## Quick Start

Each example can be run with:

```bash
npx tsx examples/<example-name>/module.ts
```

Or for the multi-module example:

```bash
npx tsx examples/multi-module/index.ts
```

## Example Details

### Basic Example

The foundational example showing how esm.do modules work:

```typescript
import { ESM } from '@dotdo/esm'

const esm = ESM.create()

await esm.write({
  name: '@examples/basic',
  types: `export declare function greet(name: string): string`,
  module: `export function greet(name) { return 'Hello, ' + name + '!' }`,
  tests: `it('greets', () => expect(greet('World')).toBe('Hello, World!'))`,
  script: `return greet('ESM.do')`
})

const result = await esm.run('@examples/basic')
console.log(result.value) // "Hello, ESM.do!"
```

[View Example](./basic/)

### API Proxy Example

Demonstrates wrapping external REST APIs with type safety:

```typescript
const weather = await getWeather('San Francisco')
if (weather.success) {
  console.log(`Temperature: ${weather.data.temperature}C`)
}

const repo = await getGitHubRepo('dot-do', 'esm')
if (repo.success) {
  console.log(`Stars: ${repo.data.stars}`)
}
```

Features:
- Configurable fetch client with timeout and retries
- Consistent response format with error handling
- Response data transformation

[View Example](./api-proxy/)

### AI Function Example

Shows AI capabilities for text processing:

```typescript
const sentiment = await analyzeSentiment('This product is amazing!')
// { sentiment: 'positive', confidence: 0.85 }

const summary = await summarize(longArticle, 50)
// { summary: '...', compressionRatio: 0.9 }

const category = await classify(text, ['tech', 'sports', 'business'])
// { category: 'tech', confidence: 0.75 }
```

Features:
- Sentiment analysis
- Entity extraction
- Text summarization
- Classification
- Text generation

[View Example](./ai-function/)

### CRUD API Example

Complete Create, Read, Update, Delete operations:

```typescript
// Create
const user = await createUser({ email: 'user@example.com', name: 'John' })

// Read
const found = await getUser(user.data.id)

// Update
await updateUser(user.data.id, { role: 'admin' })

// Delete
await deleteUser(user.data.id)

// List with pagination
const users = await listUsers({ limit: 10, offset: 0, filter: { role: 'admin' } })

// Search
const results = await searchUsers('john')
```

Features:
- Input validation
- Pagination and sorting
- Filtering and search
- Statistics

[View Example](./crud-api/)

### Scheduled Task Example

Cron-based task scheduling:

```typescript
// Parse cron expression
const cron = parseCron('0 9 * * 1-5')  // Weekdays at 9 AM

// Get next run time
const next = getNextRun('*/15 * * * *')  // Every 15 minutes

// Execute task
const result = await executeTask('cleanup', 'return await performCleanup()')

// View history
const history = getTaskHistory('cleanup')
console.log(`Success rate: ${history.successCount / history.runCount}`)
```

Features:
- Cron expression parsing and validation
- Next run calculation
- Task execution tracking
- History and statistics

[View Example](./scheduled-task/)

### Multi-Module Example

Interconnected modules with dependencies:

```
@examples/multi-module/utils     <- Foundation (no deps)
           |
           v
@examples/multi-module/models    <- Uses utils
           |
           v
@examples/multi-module/services  <- Uses utils + models
```

```typescript
// In models module
import { generateId, slugify } from 'esm.do/@examples/multi-module/utils'

export function createProduct(input) {
  return {
    id: generateId('prod'),
    slug: slugify(input.name),
    // ...
  }
}

// In services module
import { formatCurrency } from 'esm.do/@examples/multi-module/utils'
import { createOrder } from 'esm.do/@examples/multi-module/models'

export function checkout(cart) {
  const order = createOrder(cart.customerId, cart.items)
  // ...
}
```

Features:
- Module dependencies
- Import resolution
- Dependency graph
- Layered architecture

[View Example](./multi-module/)

## Module Structure

Every esm.do module consists of four parts:

```
@scope/module-name/
├── index.d.ts      # Type definitions
├── index.mjs       # Module implementation
├── index.test.js   # Test suite
└── index.script.js # Executable script
```

## Running Tests

Each example includes comprehensive tests:

```bash
# Run all example tests
npx vitest run examples/

# Run specific example tests
npx vitest run examples/crud-api/tests.ts
```

## Integration with esm.do

### Via SDK

```typescript
import { ESM } from '@dotdo/esm'

const esm = ESM.create()
await esm.write({ name: '@myorg/module', ... })
```

### Via CLI

```bash
esm write @myorg/module --types="..." --module="..."
esm test @myorg/module
esm run @myorg/module
```

### Via HTTP API

```bash
# Create module
curl -X POST https://esm.do/@myorg/module -d '...'

# Run module
curl -X POST https://esm.do/@myorg/module/run
```

### Via MCP (AI Agents)

```typescript
await esm_write({ name: '@myorg/module', ... })
await esm_test({ name: '@myorg/module' })
await esm_run({ name: '@myorg/module' })
```

## Contributing

When adding new examples:

1. Create a new directory under `examples/`
2. Include `module.ts` with the example code
3. Include `README.md` with documentation
4. Add the example to this index
5. Ensure all tests pass

## License

MIT - See the main project LICENSE file.

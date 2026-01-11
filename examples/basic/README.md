# Basic Example

This example demonstrates the fundamental structure of an esm.do module with types, implementation, tests, and an executable script.

## Module Structure

Every esm.do module consists of four parts:

1. **Types** (`index.d.ts`) - TypeScript declarations defining the module's API
2. **Module** (`index.mjs`) - The actual implementation
3. **Tests** (`index.test.js`) - Verification tests
4. **Script** (`index.script.js`) - An executable entry point

## Running the Example

```bash
# Using ts-node or tsx
npx tsx examples/basic/module.ts

# Or with the ESM SDK
import { ESM } from '@dotdo/esm'

const esm = ESM.create()
const result = await esm.write({
  name: '@examples/basic',
  types: '...',
  module: '...',
  tests: '...',
  script: '...'
})
```

## API Usage

### Via HTTP

```bash
# Create the module
curl -X POST https://esm.do/@examples/basic \
  -H "Content-Type: application/json" \
  -d '{
    "types": "export declare function greet(name: string): string",
    "module": "export function greet(name) { return `Hello, ${name}!` }",
    "tests": "it(\"greets\", () => expect(greet(\"World\")).toBe(\"Hello, World!\"))",
    "script": "return greet(\"ESM.do\")"
  }'

# Read the module
curl https://esm.do/@examples/basic

# Get just the types
curl https://esm.do/@examples/basic.d.ts

# Get just the implementation
curl https://esm.do/@examples/basic.mjs

# Run the script
curl -X POST https://esm.do/@examples/basic/run

# Run the tests
curl -X POST https://esm.do/@examples/basic/test
```

### Via CLI

```bash
# Write the module
esm write @examples/basic \
  --types="export declare function greet(name: string): string" \
  --module="export function greet(name) { return \`Hello, \${name}!\` }" \
  --tests="it('greets', () => expect(greet('World')).toBe('Hello, World!'))" \
  --script="return greet('ESM.do')"

# Read the module
esm read @examples/basic

# Run tests
esm test @examples/basic

# Run the script
esm run @examples/basic
```

### Via MCP Tools (AI Agents)

```typescript
// Using MCP tools
await esm_write({
  name: '@examples/basic',
  types: 'export declare function greet(name: string): string',
  module: 'export function greet(name) { return `Hello, ${name}!` }',
  tests: 'it("greets", () => expect(greet("World")).toBe("Hello, World!"))',
  script: 'return greet("ESM.do")'
})

// Read the module
const module = await esm_read({ name: '@examples/basic' })

// Run tests
const testResult = await esm_test({ name: '@examples/basic' })

// Execute script
const result = await esm_run({ name: '@examples/basic' })
```

## Expected Output

When running the example:

```
Writing basic module...
Module written successfully!
Version: abc123def456
Tests: 10/10 passed

Running module script...
Script output: {
  greeting: 'Hello, ESM.do User!',
  sum: 30,
  today: '2024-03-15'
}
```

## Key Concepts

1. **Atomic Writes**: All four files are committed together
2. **Test Validation**: Tests must pass before the module is saved
3. **Version History**: Every change creates a new version
4. **Type Safety**: Types are validated and sanitized
5. **Sandboxed Execution**: Scripts run in isolated environments

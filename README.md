# esm.do

> Living ESM modules for AI agents - types, code, tests, and scripts in one place.

## Vision

**esm.do** is a programmable module system where AI agents can create, evolve, test, and execute ESM modules through a unified interface. Every module is a living entity with four synchronized files:

```
@scope/module/
├── index.d.ts      # Types - the contract
├── index.mjs       # Module - the implementation
├── index.test.js   # Tests - the verification
└── index.script.js # Script - the execution
```

## Why esm.do?

Traditional module registries separate storage from execution. **esm.do unifies them:**

- **Write once, verify everywhere** - Types, code, and tests committed atomically
- **AI-native** - MCP tools let agents create modules programmatically
- **Version everything** - Full git history via gitx.do
- **Execute anywhere** - Sandboxed execution via ai-evaluate
- **Simple mental model** - Module = types + code + tests + script

## Quick Start

### SDK

```typescript
import { esm } from 'esm.do'

// Create a module
const result = await esm.write({
  name: '@math/add',
  types: `export declare function add(a: number, b: number): number`,
  module: `export function add(a, b) { return a + b }`,
  tests: `
    describe('add', () => {
      it('adds positive numbers', () => expect(add(2, 3)).toBe(5))
      it('adds negative numbers', () => expect(add(-1, -2)).toBe(-3))
      it('adds zero', () => expect(add(0, 5)).toBe(5))
    })
  `,
  script: `return add(10, 20)`
})

console.log(result.testResults) // { passed: 3, failed: 0 }
console.log(result.value)       // 30
console.log(result.version)     // 'a3f2dd1...'
```

### CLI

```bash
# Initialize a new module
esm init @math/add

# Write module files
esm write @math/add --types="..." --module="..." --tests="..." --script="..."

# Run tests
esm test @math/add
# ✓ adds positive numbers (2ms)
# ✓ adds negative numbers (1ms)
# ✓ adds zero (1ms)
# 3 passed, 0 failed

# Execute script
esm run @math/add
# 30

# View history
esm log @math/add
# a3f2dd1 Initial implementation
# b7c4ee2 Add edge case tests
```

### API

```bash
# Get module info
GET https://esm.do/@math/add

# Get specific file
GET https://esm.do/@math/add.d.ts
GET https://esm.do/@math/add.mjs
GET https://esm.do/@math/add.test.js
GET https://esm.do/@math/add.script.js

# Get specific version
GET https://esm.do/@math/add@a3f2dd1

# Create/update module
POST https://esm.do/@math/add
{
  "types": "...",
  "module": "...",
  "tests": "...",
  "script": "..."
}

# Run tests
POST https://esm.do/@math/add/test

# Execute script
POST https://esm.do/@math/add/run
```

### MCP Tools

```typescript
// Available tools for AI agents
esm_list     // List modules matching pattern
esm_read     // Read module contents
esm_write    // Create or update module
esm_test     // Run module tests
esm_run      // Execute module script
esm_versions // Get version history
esm_diff     // Compare versions
esm_delete   // Remove module
```

## The Four Files

### Types (`.d.ts`)

The module's contract. Declares what the module exports without implementation details.

```typescript
// @math/calculator.d.ts
export declare function add(a: number, b: number): number
export declare function subtract(a: number, b: number): number
export declare function multiply(a: number, b: number): number
export declare function divide(a: number, b: number): number
```

### Module (`.mjs`)

The implementation. ESM code that fulfills the type contract.

```javascript
// @math/calculator.mjs
export function add(a, b) { return a + b }
export function subtract(a, b) { return a - b }
export function multiply(a, b) { return a * b }
export function divide(a, b) {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
```

### Tests (`.test.js`)

Verification using vitest-compatible API. Module exports are automatically in scope.

```javascript
// @math/calculator.test.js
describe('calculator', () => {
  describe('add', () => {
    it('adds positive numbers', () => expect(add(2, 3)).toBe(5))
    it('adds negative numbers', () => expect(add(-1, -2)).toBe(-3))
  })

  describe('divide', () => {
    it('divides numbers', () => expect(divide(10, 2)).toBe(5))
    it('throws on division by zero', () => {
      expect(() => divide(1, 0)).toThrow('Division by zero')
    })
  })
})
```

### Script (`.script.js`)

An executable entry point. Module exports are in scope. Return value is captured.

```javascript
// @math/calculator.script.js
// All exports available: add, subtract, multiply, divide

const a = 100
const b = 25

console.log(`${a} + ${b} = ${add(a, b)}`)
console.log(`${a} - ${b} = ${subtract(a, b)}`)
console.log(`${a} * ${b} = ${multiply(a, b)}`)
console.log(`${a} / ${b} = ${divide(a, b)}`)

return { sum: add(a, b), product: multiply(a, b) }
```

## Dependencies

Modules can import other esm.do modules:

```javascript
// @math/stats.mjs
import { add, divide } from 'esm.do/@math/calculator'

export function mean(numbers) {
  const sum = numbers.reduce((acc, n) => add(acc, n), 0)
  return divide(sum, numbers.length)
}

export function sum(numbers) {
  return numbers.reduce((acc, n) => add(acc, n), 0)
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Access Layer                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   API    │ │   CLI    │ │   MCP    │ │     SDK      │   │
│  │ esm.do/* │ │ esm cmd  │ │ Tools    │ │ import esm   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                    Module Layer                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               ESM Module Manager                      │   │
│  │  - Module CRUD (create, read, update, delete)        │   │
│  │  - Version management (branch, tag, history)         │   │
│  │  - Dependency resolution                             │   │
│  │  - Import graph analysis                             │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                  Execution Layer                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ai-evaluate Sandbox                      │   │
│  │  - Isolated V8 contexts via worker_loaders           │   │
│  │  - Vitest-compatible test framework                  │   │
│  │  - SDK globals (db, ai, api)                         │   │
│  │  - Configurable network access                       │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                  Storage Layer                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 gitx.do                               │   │
│  │  - Content-addressed blobs (SHA-1)                   │   │
│  │  - Trees (module structure)                          │   │
│  │  - Commits (versions)                                │   │
│  │  - Refs (branches, tags)                             │   │
│  │  - Tiered storage (DO → R2 → Analytics)              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Built On

- **[gitx.do](https://gitx.do)** - Git reimplementation for Cloudflare Durable Objects
- **[ai-evaluate](https://github.com/primitives-org/ai-evaluate)** - Sandboxed code execution
- **[Cap'n Web](https://github.com/cloudflare/capnweb)** - JavaScript RPC system
- **[Cloudflare Workers](https://workers.cloudflare.com)** - Edge compute platform

## Installation

### Quick Install (Recommended)

```bash
# Universal installer - auto-detects your system
curl -fsSL https://esm.do/install | bash
```

### Via npm

```bash
# Global installation
npm install -g esm.do

# Or as a project dependency
npm install esm.do
```

### Via Homebrew (macOS/Linux)

```bash
# Add the tap and install
brew tap dot-do/esm https://github.com/dot-do/esm
brew install esm-do

# Or install directly
brew install dot-do/esm/esm-do
```

### Via pnpm

```bash
pnpm add -g esm.do
```

### Via yarn

```bash
yarn global add esm.do
```

### Verify Installation

```bash
esm --version
esm --help
```

### Uninstall

```bash
# Via installer script
curl -fsSL https://esm.do/uninstall | bash

# Or manually
npm uninstall -g esm.do    # if installed via npm
brew uninstall esm-do      # if installed via Homebrew
```

### Requirements

- Node.js 18 or later
- npm, pnpm, or yarn (for package manager installation)
- Homebrew (for macOS/Linux Homebrew installation)

## License

MIT

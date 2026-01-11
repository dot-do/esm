# ESM CLI

The esm.do command-line interface for managing ESM modules - create, read, write, test, and run modules from your terminal.

## Installation

### npm (global)

```bash
npm install -g esm.do
```

### npx (no installation)

```bash
npx esm.do <command>
```

### bunx (Bun users)

```bash
bunx esm.do <command>
```

### From source

```bash
git clone https://github.com/dot-do/esm
cd esm
npm install
npm run build
npm link
```

## Quick Start

### Initialize a new module

```bash
esm init @myorg/hello-world
```

This creates a new module with the default template containing:
- Type definitions (`index.d.ts`)
- Module code (`index.mjs`)
- Empty tests and script slots

### Write module content

```bash
# From a file
esm write @myorg/hello-world --file ./my-module.js

# Inline content
esm write @myorg/hello-world --module "export function greet(name) { return 'Hello, ' + name }"

# With types, tests, and script
esm write @myorg/calculator \
  --types "export declare function add(a: number, b: number): number" \
  --module "export function add(a, b) { return a + b }" \
  --tests "describe('add', () => { it('works', () => expect(add(2,3)).toBe(5)) })" \
  --script "return add(10, 20)"
```

### Read a module

```bash
# Read module code
esm read @myorg/hello-world

# Read as JSON (includes types, tests, script)
esm read @myorg/hello-world --json

# Read specific version
esm read @myorg/hello-world --version abc123
```

### Run tests

```bash
esm test @myorg/calculator
# Tests: 1 passed, 0 failed
#   PASS: add works
```

### Execute scripts

```bash
esm run @myorg/calculator
# 30
```

### View version history

```bash
esm versions @myorg/calculator
# a3f2dd1
# b7c4ee2
# c8d5ff3
```

## Command Overview

| Command | Description |
|---------|-------------|
| `esm init <name>` | Initialize a new module |
| `esm write <name>` | Write content to a module |
| `esm read <name>` | Read module content |
| `esm run <name>` | Execute module script |
| `esm test <name>` | Run module tests |
| `esm versions <name>` | List module versions |
| `esm log <name>` | Show commit history |
| `esm diff <name> <v1> [v2]` | Compare versions |
| `esm delete <name>` | Delete a module |
| `esm login` | Authenticate with esm.do |
| `esm logout` | Log out |
| `esm whoami` | Show current user |
| `esm config` | Manage configuration |
| `esm --help` | Show help |
| `esm --version` | Show version |

## Module Naming

All modules must use scoped names in the format `@scope/name`:

```bash
# Valid names
@myorg/utils
@personal/calculator
@company/api-client

# Invalid names (will error)
mymodule           # Missing scope
my-module          # Missing scope
@myorg             # Missing name
```

Nested paths are also supported:

```bash
@myorg/utils/string
@company/api/v2/client
```

## Getting Help

```bash
# General help
esm --help

# Command-specific help
esm init --help
esm write --help
esm run --help
```

## Next Steps

- [Commands Reference](./commands.md) - Detailed documentation for all commands
- [Configuration Guide](./configuration.md) - Environment variables and config files
- [Workflows](./workflows.md) - Common usage patterns and CI/CD integration

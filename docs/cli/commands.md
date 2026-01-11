# CLI Commands Reference

Complete reference for all esm.do CLI commands.

## esm init

Initialize a new ESM module with a template.

### Synopsis

```bash
esm init <name> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --template <template>` | Template to use | `default` |

### Templates

- `default` - Basic JavaScript module with type declarations
- `typescript` - TypeScript-focused template

### Examples

```bash
# Initialize with default template
esm init @myorg/my-module

# Initialize with TypeScript template
esm init @myorg/my-module --template typescript

# Initialize nested module
esm init @myorg/utils/strings
```

### Output

On success, displays the module name and initial version hash:

```
Initialized @myorg/my-module with default template
Version: a3f2dd1c8b9e
```

### Tips

- Module names must start with `@` and include a scope
- Use descriptive scope names (organization, username, project)
- Nested paths help organize related modules

---

## esm write

Write content to an ESM module. Creates the module if it doesn't exist, or updates it.

### Synopsis

```bash
esm write <name> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |

### Options

| Option | Description |
|--------|-------------|
| `-f, --file <file>` | Read module code from file |
| `-c, --content <content>` | Module code as string |
| `-m, --message <message>` | Commit message |
| `--stdin` | Read content from stdin |
| `--types <types>` | TypeScript type definitions |
| `--module <module>` | Module code (JavaScript) |
| `--tests <tests>` | Test code |
| `--script <script>` | Executable script |

### Content Sources

You can provide content via:

1. **File**: `--file path/to/module.js`
2. **Inline**: `--content "export function foo() {}"`
3. **Stdin**: `echo "export default 42" | esm write @scope/name --stdin`
4. **Individual flags**: `--types`, `--module`, `--tests`, `--script`

### Examples

```bash
# Write from file
esm write @myorg/utils --file ./utils.js

# Write inline content
esm write @myorg/hello --content "export const greeting = 'Hello'"

# Write with all components
esm write @myorg/math \
  --types "export declare function add(a: number, b: number): number" \
  --module "export function add(a, b) { return a + b }" \
  --tests "describe('add', () => { it('adds', () => expect(add(1,2)).toBe(3)) })" \
  --script "console.log(add(5, 10)); return add(5, 10)"

# Write from stdin
cat my-module.js | esm write @myorg/my-module --stdin

# Write with commit message
esm write @myorg/utils --file ./utils.js --message "Fix edge case in parser"
```

### Output

```
Written @myorg/math@b7c4ee2d
```

### Tips

- Tests are executed during write; if all tests fail, the write is rejected
- The script is executed during write to capture the initial return value
- Types are automatically generated as `export {};` if not provided
- Module code must be valid JavaScript (not TypeScript)

---

## esm read

Read the content of an ESM module.

### Synopsis

```bash
esm read <name> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |

### Options

| Option | Description |
|--------|-------------|
| `-v, --version <version>` | Read specific version by hash |
| `-o, --output <file>` | Write output to file |
| `-j, --json` | Output as JSON (includes all components) |

### Examples

```bash
# Read module code
esm read @myorg/utils

# Read as JSON (all components)
esm read @myorg/utils --json

# Read specific version
esm read @myorg/utils --version a3f2dd1

# Save to file
esm read @myorg/utils --output ./local-utils.js

# Save JSON to file
esm read @myorg/utils --json --output ./module.json
```

### Output

Without `--json`, outputs the module code:

```javascript
export function add(a, b) {
  return a + b
}
```

With `--json`, outputs all components:

```json
{
  "name": "@myorg/math",
  "version": "a3f2dd1c8b9e",
  "types": "export declare function add(a: number, b: number): number",
  "module": "export function add(a, b) { return a + b }",
  "tests": "describe('add', () => { ... })",
  "script": "return add(10, 20)"
}
```

### Tips

- Use `--json` to get the complete module including types, tests, and script
- Version hashes are the first 12 characters of the SHA-256 content hash
- Use `esm versions` to find available version hashes

---

## esm run

Execute a module's script in a sandboxed environment.

### Synopsis

```bash
esm run <name> [options] [-- args...]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |
| `args...` | Arguments passed to the script (after `--`) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --timeout <ms>` | Execution timeout in milliseconds | `30000` |
| `-e, --env <KEY=value>` | Environment variables (can be repeated) | |

### Examples

```bash
# Run a module script
esm run @myorg/calculator

# Run with timeout
esm run @myorg/slow-task --timeout 60000

# Run with environment variables
esm run @myorg/api-client --env API_KEY=abc123 --env DEBUG=true

# Run with arguments
esm run @myorg/cli-tool -- --input file.txt --verbose
```

### Output

The script's console output is displayed, followed by the return value:

```
Processing...
Done!
{ result: 42, status: "success" }
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Script executed successfully |
| 1 | Script threw an error or module not found |

### Tips

- Scripts run in a sandboxed V8 context with limited capabilities
- Module exports are available as globals in the script
- Use `console.log()` for output; the return value is captured
- Timeouts prevent runaway scripts

---

## esm test

Run a module's tests.

### Synopsis

```bash
esm test <name> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |

### Options

| Option | Description |
|--------|-------------|
| `-w, --watch` | Watch mode (re-run on changes) |
| `-c, --coverage` | Collect coverage information |
| `-f, --filter <pattern>` | Filter tests by name pattern |

### Examples

```bash
# Run all tests
esm test @myorg/calculator

# Filter tests by pattern
esm test @myorg/calculator --filter "add"

# Run with coverage
esm test @myorg/calculator --coverage
```

### Output

```
Tests: 3 passed, 0 failed
  PASS: add adds positive numbers
  PASS: add adds negative numbers
  PASS: add handles zero
```

On failure:

```
Tests: 2 passed, 1 failed
  PASS: add adds positive numbers
  PASS: add adds negative numbers
  FAIL: add handles undefined
    Error: Expected undefined to be 0
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | One or more tests failed, or module not found |

### Tips

- Tests use a vitest-compatible API (`describe`, `it`, `expect`)
- Module exports are available as globals in test code
- Tests run in a sandboxed environment

---

## esm versions

List version history for a module.

### Synopsis

```bash
esm versions <name> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --limit <n>` | Maximum versions to show | `10` |
| `-j, --json` | Output as JSON |  |
| `-V, --verbose` | Show detailed info (message, date) |  |

### Examples

```bash
# List recent versions
esm versions @myorg/calculator

# List more versions
esm versions @myorg/calculator --limit 50

# Show detailed info
esm versions @myorg/calculator --verbose

# Output as JSON
esm versions @myorg/calculator --json
```

### Output

Default:

```
a3f2dd1c8b9e
b7c4ee2d1a3f
c8d5ff3e2b4a
```

With `--verbose`:

```
a3f2dd1c8b9e - Module updated (2024-01-15T10:30:00.000Z)
b7c4ee2d1a3f - Module updated (2024-01-14T15:45:00.000Z)
c8d5ff3e2b4a - Module updated (2024-01-13T09:00:00.000Z)
```

### Tips

- Version hashes are content-addressed (SHA-256 based)
- Use these hashes with `esm read --version` or `esm diff`

---

## esm log

Show commit history for a module (alias for versions with git-like output).

### Synopsis

```bash
esm log <name> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --limit <n>` | Maximum entries to show | `10` |
| `-j, --json` | Output as JSON |  |
| `-V, --verbose` | Show full commit details |  |
| `-s, --since <date>` | Show commits since date |  |

### Examples

```bash
# Show recent history
esm log @myorg/calculator

# Show verbose log
esm log @myorg/calculator --verbose

# Filter by date
esm log @myorg/calculator --since 2024-01-01

# Output as JSON
esm log @myorg/calculator --json --limit 100
```

### Output

Default:

```
a3f2dd1 Module updated
b7c4ee2 Module updated
c8d5ff3 Module updated
```

With `--verbose`:

```
commit a3f2dd1c8b9e
Date: 2024-01-15T10:30:00.000Z

    Module updated

commit b7c4ee2d1a3f
Date: 2024-01-14T15:45:00.000Z

    Module updated
```

---

## esm diff

Compare two versions of a module.

### Synopsis

```bash
esm diff <name> <v1> [v2] [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |
| `v1` | First version hash (required) |
| `v2` | Second version hash (optional, defaults to HEAD) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-u, --unified <n>` | Context lines in unified diff | `3` |
| `-j, --json` | Output as JSON |  |

### Examples

```bash
# Compare two versions
esm diff @myorg/calculator a3f2dd1 b7c4ee2

# Compare version with current
esm diff @myorg/calculator a3f2dd1

# Output as JSON
esm diff @myorg/calculator a3f2dd1 b7c4ee2 --json
```

### Output

```diff
--- @myorg/calculator@a3f2dd1
+++ @myorg/calculator@b7c4ee2
@@ -1,3 +1,4 @@
 export function add(a, b) {
   return a + b
 }
+export function subtract(a, b) { return a - b }
```

---

## esm delete

Delete a module from storage.

### Synopsis

```bash
esm delete <name> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Module name in `@scope/name` format (required) |

### Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |
| `-d, --dry-run` | Show what would be deleted |

### Examples

```bash
# Delete with confirmation
esm delete @myorg/old-module
# error: Use --force to confirm deletion

# Delete without confirmation
esm delete @myorg/old-module --force

# Preview deletion
esm delete @myorg/old-module --dry-run
```

### Output

```
Deleted @myorg/old-module
```

### Tips

- Deletion is permanent and cannot be undone
- Use `--dry-run` to verify before deleting
- The `--force` flag is required to prevent accidental deletion

---

## esm login

Authenticate with esm.do to access private modules and higher rate limits.

### Synopsis

```bash
esm login [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-t, --token <token>` | API token for authentication |

### Examples

```bash
# Login with token
esm login --token your-api-token-here

# Interactive login (not yet implemented)
esm login
```

### Tips

- Get your API token from https://esm.do/settings/tokens
- Token is stored in `~/.esm/config.json`

---

## esm logout

Log out from esm.do and remove stored credentials.

### Synopsis

```bash
esm logout
```

### Examples

```bash
esm logout
# Logged out successfully
```

---

## esm whoami

Display the currently authenticated user.

### Synopsis

```bash
esm whoami
```

### Examples

```bash
esm whoami
# Authenticated user (token set)

# or if not logged in:
# Not logged in
```

---

## esm config

Manage CLI configuration settings.

### Synopsis

```bash
esm config <subcommand> [options]
```

### Subcommands

#### esm config get

Get a configuration value.

```bash
esm config get <key>
```

#### esm config set

Set a configuration value.

```bash
esm config set <key> <value>
```

#### esm config list

List all configuration values.

```bash
esm config list
```

### Examples

```bash
# Get API endpoint
esm config get api.endpoint

# Set API endpoint
esm config set api.endpoint https://api.esm.do

# List all config
esm config list
# api.endpoint=https://api.esm.do
# auth.token=***
```

### Configuration Keys

| Key | Description |
|-----|-------------|
| `api.endpoint` | API base URL |
| `auth.token` | Authentication token |

---

## esm deploy

Deploy a module to production (planned feature).

### Synopsis

```bash
esm deploy <name> [options]
```

### Status

This command is planned for a future release.

---

## esm server

Start a local development server (planned feature).

### Synopsis

```bash
esm server [options]
```

### Status

This command is planned for a future release.

---

## esm publish

Publish a module to the public registry (planned feature).

### Synopsis

```bash
esm publish <name> [options]
```

### Status

This command is planned for a future release.

---

## Global Options

These options are available for all commands:

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help for command |
| `-V, --version` | Show CLI version |

### Examples

```bash
# Show version
esm --version
# 0.0.1

# Show help
esm --help

# Show command help
esm write --help
```

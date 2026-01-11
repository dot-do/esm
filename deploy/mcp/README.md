# esm.do MCP Server

Model Context Protocol (MCP) server for esm.do, enabling AI assistants like Claude to interact with ESM modules directly.

## Overview

The esm.do MCP server exposes module management capabilities as MCP tools, allowing AI assistants to:

- Read and write ESM modules
- Execute module scripts
- Run tests
- View version history

## Installation

### From npm

```bash
npm install -g esm.do
```

### From source

```bash
git clone https://github.com/dot-do/esm.git
cd esm
npm install
npm run build
```

## Usage

### Start the MCP Server

```bash
# If installed globally
esm-mcp

# Or run directly
npx esm-mcp

# Or from built source
node dist/mcp/server.js
```

### Configure with Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "esm": {
      "command": "npx",
      "args": ["esm-mcp"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "esm": {
      "command": "esm-mcp"
    }
  }
}
```

### Configure with Other MCP Clients

The server communicates via JSON-RPC 2.0 over stdio. Any MCP-compatible client can connect by:

1. Spawning the `esm-mcp` process
2. Sending JSON-RPC requests to stdin
3. Reading JSON-RPC responses from stdout

## Available Tools

### esm_read

Read a module's content by name.

**Parameters:**
- `name` (required): Module name (e.g., "@math/add")
- `version` (optional): Specific version hash
- `file` (optional): Specific file to read ("types", "module", "tests", "script")

**Example:**
```json
{
  "name": "esm_read",
  "arguments": {
    "name": "@math/add"
  }
}
```

### esm_write

Create or update an ESM module.

**Parameters:**
- `name` (required): Module name (e.g., "@math/add")
- `types` (optional): TypeScript declarations (.d.ts content)
- `module` (optional): ESM module implementation (.mjs content)
- `tests` (optional): Test file content
- `script` (optional): Executable script

**Example:**
```json
{
  "name": "esm_write",
  "arguments": {
    "name": "@math/multiply",
    "types": "export declare function multiply(a: number, b: number): number;",
    "module": "export function multiply(a, b) { return a * b; }",
    "tests": "import { expect } from 'esm.do/test';\nimport { multiply } from './index.mjs';\nit('multiplies numbers', () => expect(multiply(2, 3)).toBe(6));",
    "script": "return multiply(5, 10);"
  }
}
```

### esm_run

Execute a module's script and return the result.

**Parameters:**
- `name` (required): Module name
- `args` (optional): Arguments to pass to the script

**Example:**
```json
{
  "name": "esm_run",
  "arguments": {
    "name": "@math/add",
    "args": { "a": 10, "b": 20 }
  }
}
```

### esm_test

Run tests for a module.

**Parameters:**
- `name` (required): Module name
- `filter` (optional): Pattern to filter tests by name

**Example:**
```json
{
  "name": "esm_test",
  "arguments": {
    "name": "@math/add"
  }
}
```

### esm_versions

Get version history for a module.

**Parameters:**
- `name` (required): Module name
- `limit` (optional): Maximum number of versions to return

**Example:**
```json
{
  "name": "esm_versions",
  "arguments": {
    "name": "@math/add",
    "limit": 5
  }
}
```

### esm_list

List modules matching a pattern.

**Parameters:**
- `pattern` (optional): Filter by name pattern
- `scope` (optional): Filter by scope (e.g., "@math")

**Example:**
```json
{
  "name": "esm_list",
  "arguments": {
    "scope": "@math"
  }
}
```

### esm_diff

Compare two versions of a module.

**Parameters:**
- `name` (required): Module name
- `from` (required): Starting version hash
- `to` (optional): Ending version hash (defaults to HEAD)

**Example:**
```json
{
  "name": "esm_diff",
  "arguments": {
    "name": "@math/add",
    "from": "abc123",
    "to": "def456"
  }
}
```

### esm_delete

Delete a module.

**Parameters:**
- `name` (required): Module name
- `force` (optional): Force delete even if module has dependents

**Example:**
```json
{
  "name": "esm_delete",
  "arguments": {
    "name": "@deprecated/module",
    "force": true
  }
}
```

## Protocol Details

The MCP server implements the Model Context Protocol (version 2024-11-05) over JSON-RPC 2.0.

### Initialization

The client sends an `initialize` request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  }
}
```

Server responds with capabilities:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "esm-mcp",
      "version": "0.0.1"
    }
  }
}
```

### Listing Tools

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

### Calling Tools

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "esm_read",
    "arguments": {
      "name": "@math/add"
    }
  }
}
```

## Debugging

The server logs to stderr for debugging purposes. To see logs:

```bash
esm-mcp 2>&1 | tee server.log
```

## Development

### Running Tests

```bash
npm test -- tests/mcp/server.test.ts
```

### Building

```bash
npm run build
```

## License

MIT

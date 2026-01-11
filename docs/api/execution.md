# Execution API

The Execution API allows you to run module scripts and tests in a secure sandboxed environment.

## Overview

esm.do executes code in an isolated sandbox powered by Cloudflare Workers. This provides:

- Secure isolation between modules
- Consistent execution environment
- Captured console output
- Configurable timeouts

## Run Module Script

Execute a module's script file with optional arguments.

### POST /run/:name

**Request:**

```http
POST /run/@math/add HTTP/1.1
Host: esm.do
Content-Type: application/json
Authorization: Bearer <token>

{
  "input": {
    "x": 5,
    "y": 10
  },
  "timeout": 5000,
  "version": "a3f2dd1"
}
```

**cURL:**

```bash
curl -X POST https://esm.do/@math/add/run \
  -H "Content-Type: application/json" \
  -d '{"input": {"x": 5, "y": 10}}'
```

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `input` | `object` | No | `{}` | Arguments available as `args` in the script |
| `timeout` | `number` | No | `30000` | Maximum execution time in milliseconds |
| `version` | `string` | No | `latest` | Specific version to run |

### Response (Success)

```json
{
  "result": 30,
  "logs": [
    { "level": "log", "args": ["Starting calculation..."] },
    { "level": "log", "args": ["Result:", 30] }
  ],
  "duration": 15
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `result` | `unknown` | The return value of the script |
| `logs` | `LogEntry[]` | Captured console output |
| `duration` | `number` | Execution time in milliseconds |

### Log Entry

| Field | Type | Description |
|-------|------|-------------|
| `level` | `string` | Log level: `log`, `warn`, `error`, `info`, `debug` |
| `args` | `unknown[]` | Arguments passed to console method |

### Response (Error)

```json
{
  "error": "Script execution failed",
  "status": 500
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Script executed successfully |
| 404 | Module not found |
| 400 | Module has no script |
| 500 | Script execution error |
| 504 | Execution timeout |

### Script Environment

Within the script, you have access to:

```javascript
// All module exports are available
import { add, subtract } from './index.mjs';

// Input arguments are available as `args`
const { x, y } = args;

// Console methods are captured
console.log('Processing...', x, y);

// Return value becomes the response `result`
return add(x, y);
```

### Example Script

**Module (`index.mjs`):**

```javascript
export function add(a, b) {
  return a + b;
}

export function multiply(a, b) {
  return a * b;
}
```

**Script (`index.script.js`):**

```javascript
import { add, multiply } from './index.mjs';

const { operation, x, y } = args;

console.log(`Performing ${operation} on ${x} and ${y}`);

let result;
switch (operation) {
  case 'add':
    result = add(x, y);
    break;
  case 'multiply':
    result = multiply(x, y);
    break;
  default:
    throw new Error(`Unknown operation: ${operation}`);
}

console.log('Result:', result);
return result;
```

**Request:**

```bash
curl -X POST https://esm.do/@math/calculator/run \
  -H "Content-Type: application/json" \
  -d '{"input": {"operation": "multiply", "x": 6, "y": 7}}'
```

**Response:**

```json
{
  "result": 42,
  "logs": [
    { "level": "log", "args": ["Performing multiply on 6 and 7"] },
    { "level": "log", "args": ["Result:", 42] }
  ],
  "duration": 8
}
```

---

## Run Module Tests

Execute a module's test suite.

### POST /test/:name

**Request:**

```http
POST /test/@math/add HTTP/1.1
Host: esm.do
Content-Type: application/json
Authorization: Bearer <token>

{
  "timeout": 30000,
  "filter": "edge cases"
}
```

**cURL:**

```bash
curl -X POST https://esm.do/@math/add/test \
  -H "Content-Type: application/json"
```

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `timeout` | `number` | No | `30000` | Maximum test execution time in milliseconds |
| `filter` | `string` | No | - | Run only tests matching this pattern |

### Response (All Pass)

```json
{
  "passed": 5,
  "failed": 0,
  "total": 5,
  "duration": 45,
  "results": [
    {
      "name": "adds positive numbers",
      "status": "passed",
      "duration": 2
    },
    {
      "name": "adds negative numbers",
      "status": "passed",
      "duration": 1
    },
    {
      "name": "adds zero",
      "status": "passed",
      "duration": 1
    },
    {
      "name": "handles floating point",
      "status": "passed",
      "duration": 2
    },
    {
      "name": "throws on non-numbers",
      "status": "passed",
      "duration": 3
    }
  ]
}
```

### Response (With Failures)

```json
{
  "passed": 3,
  "failed": 2,
  "total": 5,
  "duration": 52,
  "results": [
    {
      "name": "adds positive numbers",
      "status": "passed",
      "duration": 2
    },
    {
      "name": "adds negative numbers",
      "status": "passed",
      "duration": 1
    },
    {
      "name": "adds zero",
      "status": "passed",
      "duration": 1
    },
    {
      "name": "handles floating point",
      "status": "failed",
      "duration": 3,
      "error": "Expected: 0.3\nReceived: 0.30000000000000004"
    },
    {
      "name": "throws on non-numbers",
      "status": "failed",
      "duration": 2,
      "error": "Expected function to throw, but it did not"
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `passed` | `number` | Number of passing tests |
| `failed` | `number` | Number of failing tests |
| `total` | `number` | Total number of tests |
| `duration` | `number` | Total execution time in milliseconds |
| `results` | `TestResult[]` | Individual test results |

### Test Result

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Test case name |
| `status` | `string` | `passed` or `failed` |
| `duration` | `number` | Test execution time in milliseconds |
| `error` | `string?` | Error message if failed |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Tests executed (check `failed` count for results) |
| 404 | Module not found |
| 400 | Module has no tests |
| 504 | Test execution timeout |

### Test Environment

Tests use Vitest-compatible syntax:

```javascript
import { add, subtract } from './index.mjs';
import { describe, it, expect } from 'vitest';

describe('add', () => {
  it('adds positive numbers', () => {
    expect(add(1, 2)).toBe(3);
    expect(add(10, 20)).toBe(30);
  });

  it('adds negative numbers', () => {
    expect(add(-1, -2)).toBe(-3);
    expect(add(-10, 5)).toBe(-5);
  });

  it('adds zero', () => {
    expect(add(0, 0)).toBe(0);
    expect(add(5, 0)).toBe(5);
  });

  it('handles floating point', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
  });

  it('throws on non-numbers', () => {
    expect(() => add('a', 'b')).toThrow(TypeError);
  });
});
```

---

## Execution Limits

| Limit | Value |
|-------|-------|
| Max execution time | 30 seconds |
| Max memory | 128 MB |
| Max code size | 1 MB |
| Max output size | 1 MB |
| Max log entries | 1000 |

---

## Error Handling

### Script Errors

When a script throws an error:

```json
{
  "error": "TypeError: Cannot read property 'x' of undefined",
  "status": 500
}
```

### Timeout Errors

When execution exceeds the timeout:

```json
{
  "error": "Script execution timed out after 30000ms",
  "status": 504
}
```

### Module Not Found

```json
{
  "error": "Module \"@math/nonexistent\" not found",
  "status": 404
}
```

### No Script/Tests

```json
{
  "error": "Module \"@math/add\" has no script",
  "status": 400
}
```

---

## Examples

### Simple Calculator

**Request:**

```bash
curl -X POST https://esm.do/@examples/calculator/run \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "expression": "2 + 3 * 4"
    }
  }'
```

**Response:**

```json
{
  "result": 14,
  "logs": [
    { "level": "log", "args": ["Evaluating: 2 + 3 * 4"] },
    { "level": "log", "args": ["Result: 14"] }
  ],
  "duration": 12
}
```

### Data Transformation

**Request:**

```bash
curl -X POST https://esm.do/@utils/transform/run \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "data": [1, 2, 3, 4, 5],
      "operation": "double"
    }
  }'
```

**Response:**

```json
{
  "result": [2, 4, 6, 8, 10],
  "logs": [
    { "level": "info", "args": ["Transforming 5 items with 'double' operation"] }
  ],
  "duration": 5
}
```

### Async Operations

Scripts can use async/await:

```javascript
// index.script.js
import { fetchUser, processData } from './index.mjs';

const { userId } = args;

console.log('Fetching user:', userId);
const user = await fetchUser(userId);

console.log('Processing data...');
const result = await processData(user);

return result;
```

**Response:**

```json
{
  "result": {
    "userId": 123,
    "name": "John Doe",
    "processed": true
  },
  "logs": [
    { "level": "log", "args": ["Fetching user:", 123] },
    { "level": "log", "args": ["Processing data..."] }
  ],
  "duration": 150
}
```

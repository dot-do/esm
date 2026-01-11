# Modules API

The Modules API provides CRUD operations for ESM modules stored in esm.do.

## Module Structure

Each module in esm.do consists of four files:

| File | Description | Required |
|------|-------------|----------|
| `index.d.ts` | TypeScript type declarations | Yes |
| `index.mjs` | ESM module implementation | Yes |
| `index.test.js` | Vitest-compatible test code | No |
| `index.script.js` | Executable script | No |

## Read Module

Retrieve a module's metadata and contents.

### GET /modules/:name

**Request:**

```http
GET /modules/@math/add HTTP/1.1
Host: esm.do
Accept: application/json
```

**cURL:**

```bash
curl https://esm.do/@math/add
```

**Response:**

```json
{
  "name": "@math/add",
  "version": "a3f2dd1b7c4ee2",
  "files": ["index.d.ts", "index.mjs", "index.test.js", "index.script.js"]
}
```

### Read Specific File

```http
GET /modules/@math/add.d.ts HTTP/1.1
Host: esm.do
```

Returns raw TypeScript content:

```typescript
export declare function add(a: number, b: number): number;
```

**cURL Examples:**

```bash
# Get type declarations
curl https://esm.do/@math/add.d.ts

# Get module implementation
curl https://esm.do/@math/add.mjs

# Get tests
curl https://esm.do/@math/add.test.js

# Get script
curl https://esm.do/@math/add.script.js
```

### Read Specific Version

```http
GET /modules/@math/add@a3f2dd1 HTTP/1.1
Host: esm.do
```

**cURL:**

```bash
curl https://esm.do/@math/add@a3f2dd1
```

**Response Headers for Versioned Requests:**

```http
HTTP/1.1 200 OK
Content-Type: application/javascript
Cache-Control: public, max-age=31536000, immutable
ETag: "a3f2dd1b7c4ee2"
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Module name (e.g., `@math/add`) |
| `version` | `string` | Current version hash |
| `files` | `string[]` | Available files |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Module found |
| 404 | Module not found |

---

## Write Module

Create or update a module. Tests are automatically run before committing.

### PUT /modules/:name

**Request:**

```http
PUT /modules/@math/add HTTP/1.1
Host: esm.do
Content-Type: application/json
Authorization: Bearer <token>

{
  "types": "export declare function add(a: number, b: number): number;",
  "module": "export function add(a, b) { return a + b; }",
  "tests": "import { add } from './index.mjs';\nimport { describe, it, expect } from 'vitest';\n\ndescribe('add', () => {\n  it('adds two numbers', () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});",
  "script": "import { add } from './index.mjs';\nreturn add(10, 20);",
  "options": {
    "force": false,
    "tag": "v1.0.0",
    "commitMessage": "Initial implementation"
  }
}
```

**cURL:**

```bash
curl -X PUT https://esm.do/@math/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "types": "export declare function add(a: number, b: number): number;",
    "module": "export function add(a, b) { return a + b; }",
    "tests": "describe(\"add\", () => { it(\"works\", () => expect(add(1,2)).toBe(3)) })"
  }'
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `types` | `string` | Yes | TypeScript type declarations |
| `module` | `string` | Yes | ESM module implementation |
| `tests` | `string` | No | Vitest-compatible test code |
| `script` | `string` | No | Executable script |
| `options.force` | `boolean` | No | Save even if tests fail |
| `options.tag` | `string` | No | Create a version tag |
| `options.commitMessage` | `string` | No | Custom commit message |

### Response (Success)

```json
{
  "name": "@math/add",
  "version": "a3f2dd1b7c4ee2",
  "created": true,
  "testResults": {
    "passed": 1,
    "failed": 0,
    "total": 1,
    "duration": 15,
    "results": [
      {
        "name": "adds two numbers",
        "status": "passed",
        "duration": 2
      }
    ]
  }
}
```

### Response (Update)

```json
{
  "name": "@math/add",
  "version": "b7c4ee2d8f3aa1",
  "updated": true,
  "testResults": {
    "passed": 2,
    "failed": 0,
    "total": 2,
    "duration": 23
  }
}
```

### Response (Test Failure)

When tests fail and `force` is not set:

```json
{
  "error": "Tests failed",
  "status": 400
}
```

When tests fail but `force: true`:

```json
{
  "name": "@math/add",
  "version": "c8d5ff3e9g4bb2",
  "updated": true,
  "warning": "Module saved with failing tests",
  "testResults": {
    "passed": 1,
    "failed": 1,
    "total": 2,
    "duration": 18
  }
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Module created successfully |
| 200 | Module updated successfully |
| 400 | Validation error or tests failed |
| 401 | Authentication required |
| 403 | Insufficient permissions |

---

## Delete Module

Remove a module from the registry.

### DELETE /modules/:name

**Request:**

```http
DELETE /modules/@math/add HTTP/1.1
Host: esm.do
Authorization: Bearer <token>
```

**cURL:**

```bash
curl -X DELETE https://esm.do/@math/add \
  -H "Authorization: Bearer $TOKEN"
```

### Response

```json
{
  "deleted": true,
  "name": "@math/add",
  "commit": {
    "sha": "d9e6gg4f0h5cc3",
    "message": "Delete @math/add"
  }
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Module deleted successfully |
| 404 | Module not found |
| 401 | Authentication required |
| 403 | Insufficient permissions |

---

## List Versions

Get the version history for a module.

### GET /modules/:name/versions

**Request:**

```http
GET /modules/@math/add/versions HTTP/1.1
Host: esm.do
```

**cURL:**

```bash
curl https://esm.do/@math/add/versions
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` | 100 | Maximum versions to return |

### Response

```json
{
  "versions": [
    {
      "sha": "b7c4ee2d8f3aa1",
      "message": "Add edge case handling",
      "timestamp": "2024-01-15T11:00:00Z",
      "author": "esm.do"
    },
    {
      "sha": "a3f2dd1b7c4ee2",
      "message": "Initial implementation",
      "timestamp": "2024-01-15T10:30:00Z",
      "author": "esm.do",
      "parent": null
    }
  ]
}
```

### Version Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `sha` | `string` | Version hash (commit SHA) |
| `message` | `string` | Commit message |
| `timestamp` | `string` | ISO 8601 timestamp |
| `author` | `string` | Author identifier |
| `parent` | `string?` | Parent version hash |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Versions retrieved |
| 404 | Module not found |

---

## List Modules

List all modules or filter by pattern.

### GET /list

**Request:**

```http
GET /list?pattern=@math/* HTTP/1.1
Host: esm.do
```

**cURL:**

```bash
# List all modules
curl https://esm.do/list

# Filter by pattern
curl "https://esm.do/list?pattern=@math/*"
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string` | Glob pattern to filter modules |

### Response

```json
{
  "modules": [
    "@math/add",
    "@math/subtract",
    "@math/multiply",
    "@math/divide"
  ],
  "count": 4
}
```

---

## Compare Versions

Get a diff between two versions of a module.

### GET /modules/:name/diff

**Request:**

```http
GET /modules/@math/add/diff?from=a3f2dd1&to=b7c4ee2 HTTP/1.1
Host: esm.do
```

**cURL:**

```bash
curl "https://esm.do/@math/add/diff?from=a3f2dd1&to=b7c4ee2"
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | `string` | Yes | Source version hash |
| `to` | `string` | Yes | Target version hash |

### Response

```json
{
  "diff": "--- a/index.mjs\n+++ b/index.mjs\n-export function add(a, b) { return a + b }\n+export function add(a, b) {\n+  if (typeof a !== 'number' || typeof b !== 'number') {\n+    throw new TypeError('Arguments must be numbers');\n+  }\n+  return a + b;\n+}",
  "files": {
    "index.mjs": "..."
  },
  "stats": {
    "additions": 5,
    "deletions": 1,
    "filesChanged": 1
  }
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Diff generated |
| 400 | Missing from/to parameters |
| 404 | Module or version not found |

---

## Revert Version

Revert a module to a previous version.

### POST /modules/:name/revert

**Request:**

```http
POST /modules/@math/add/revert HTTP/1.1
Host: esm.do
Content-Type: application/json
Authorization: Bearer <token>

{
  "to": "a3f2dd1b7c4ee2"
}
```

**cURL:**

```bash
curl -X POST https://esm.do/@math/add/revert \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"to": "a3f2dd1b7c4ee2"}'
```

### Response

```json
{
  "reverted": true,
  "from": "b7c4ee2d8f3aa1",
  "to": "a3f2dd1b7c4ee2",
  "newVersion": "e0f7hh5g1i6dd4",
  "commit": {
    "message": "Revert @math/add to a3f2dd1b7c4ee2",
    "sha": "e0f7hh5g1i6dd4"
  }
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Module reverted successfully |
| 400 | Missing target version |
| 404 | Module or version not found |
| 401 | Authentication required |

# Error Codes and Handling

This document describes all error codes returned by the esm.do API and how to handle them.

## Error Response Format

All errors follow a consistent JSON format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "status": 400,
  "details": {}
}
```

| Field | Type | Description |
|-------|------|-------------|
| `error` | `string` | Human-readable error message |
| `code` | `string` | Machine-readable error code |
| `status` | `number` | HTTP status code |
| `details` | `object?` | Additional error details (optional) |

---

## Error Classes

### ESMError

Base class for all esm.do errors.

```json
{
  "error": "An error occurred",
  "code": "ESM_ERROR",
  "status": 500
}
```

### ModuleNotFoundError

The requested module does not exist.

```json
{
  "error": "Module not found: @math/nonexistent",
  "code": "MODULE_NOT_FOUND",
  "status": 404,
  "details": {
    "moduleId": "@math/nonexistent"
  }
}
```

**Common Causes:**
- Typo in module name
- Module was deleted
- Module was never created

**Resolution:**
- Verify the module name is correct
- Check if the module exists with `GET /list`
- Create the module with `PUT /:name`

### ValidationError

Request validation failed.

```json
{
  "error": "Validation failed: types field is required",
  "code": "VALIDATION_ERROR",
  "status": 400,
  "details": {
    "types": "Required field is missing",
    "module": "Required field is missing"
  }
}
```

**Common Causes:**
- Missing required fields (`types`, `module`)
- Invalid field types
- Malformed JSON body

**Resolution:**
- Include all required fields
- Verify field types match the schema
- Check JSON syntax

### ExecutionError

Script or test execution failed.

```json
{
  "error": "Script execution failed: ReferenceError: undefined variable 'x'",
  "code": "EXECUTION_ERROR",
  "status": 500,
  "details": {
    "originalError": "ReferenceError: x is not defined"
  }
}
```

**Common Causes:**
- Runtime error in script
- Undefined variable access
- Type errors
- Timeout exceeded

**Resolution:**
- Check script for syntax errors
- Verify all variables are defined
- Handle potential error cases
- Increase timeout if needed

### StorageError

Storage operation failed.

```json
{
  "error": "Failed to write module: storage unavailable",
  "code": "STORAGE_ERROR",
  "status": 503,
  "details": {
    "operation": "write"
  }
}
```

**Common Causes:**
- Storage backend unavailable
- Network issues
- Quota exceeded

**Resolution:**
- Retry the operation
- Check service status
- Contact support if persistent

### CircularDependencyError

Circular dependency detected between modules.

```json
{
  "error": "Circular dependency detected: @a -> @b -> @c -> @a",
  "code": "CIRCULAR_DEPENDENCY",
  "status": 400,
  "details": {
    "cycle": ["@a", "@b", "@c", "@a"]
  }
}
```

**Common Causes:**
- Module A imports B, B imports C, C imports A

**Resolution:**
- Refactor to break the dependency cycle
- Extract shared code to a common module

---

## HTTP Status Codes

### 2xx Success

| Code | Name | Description |
|------|------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created |
| 204 | No Content | Request succeeded, no response body |

### 4xx Client Errors

| Code | Name | Description |
|------|------|-------------|
| 400 | Bad Request | Invalid request format or validation error |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 405 | Method Not Allowed | HTTP method not supported |
| 409 | Conflict | Resource conflict (e.g., version mismatch) |
| 413 | Payload Too Large | Request body exceeds size limit |
| 422 | Unprocessable Entity | Valid syntax but semantic error |
| 429 | Too Many Requests | Rate limit exceeded |

### 5xx Server Errors

| Code | Name | Description |
|------|------|-------------|
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | Upstream service error |
| 503 | Service Unavailable | Service temporarily unavailable |
| 504 | Gateway Timeout | Execution timeout |

---

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MODULE_NOT_FOUND` | 404 | Module does not exist |
| `VERSION_NOT_FOUND` | 404 | Specified version does not exist |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `TYPE_ERROR` | 400 | Type declaration validation failed |
| `TEST_FAILURE` | 422 | Tests failed during write operation |
| `SCRIPT_ERROR` | 500 | Script execution error |
| `EXECUTION_ERROR` | 500 | General execution error |
| `STORAGE_ERROR` | 503 | Storage operation failed |
| `CIRCULAR_DEPENDENCY` | 400 | Circular dependency detected |
| `TIMEOUT_ERROR` | 504 | Execution timed out |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Error Handling Best Practices

### Check Response Status

```javascript
const response = await fetch('https://esm.do/@math/add');

if (!response.ok) {
  const error = await response.json();
  console.error(`Error ${error.code}: ${error.error}`);
  // Handle specific error codes
  switch (error.code) {
    case 'MODULE_NOT_FOUND':
      // Module doesn't exist
      break;
    case 'VALIDATION_ERROR':
      // Invalid request
      break;
    default:
      // Unknown error
  }
}
```

### Retry Transient Errors

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) {
      return response;
    }

    const error = await response.json();

    // Only retry transient errors
    if (['STORAGE_ERROR', 'INTERNAL_ERROR'].includes(error.code)) {
      if (attempt < maxRetries) {
        await sleep(1000 * attempt); // Exponential backoff
        continue;
      }
    }

    throw new Error(`${error.code}: ${error.error}`);
  }
}
```

### Handle Rate Limiting

```javascript
async function fetchWithRateLimit(url, options = {}) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || 60;
    console.log(`Rate limited. Retrying in ${retryAfter} seconds...`);
    await sleep(retryAfter * 1000);
    return fetchWithRateLimit(url, options);
  }

  return response;
}
```

### Validate Before Submitting

```javascript
function validateWriteRequest(data) {
  const errors = [];

  if (!data.types) {
    errors.push('types field is required');
  }

  if (!data.module) {
    errors.push('module field is required');
  }

  if (data.types && data.types.length > 1024 * 1024) {
    errors.push('types exceeds maximum size of 1MB');
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join(', '));
  }
}
```

---

## Debugging Tips

### Enable Verbose Logging

Add query parameter for debug info:

```bash
curl "https://esm.do/@math/add?debug=true"
```

### Check Request Headers

Ensure proper headers are set:

```bash
curl -v https://esm.do/@math/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN"
```

### Validate JSON Syntax

Use a JSON validator before sending:

```bash
echo '{"types": "...", "module": "..."}' | jq .
```

### Test with Minimal Payload

Start with minimal required fields:

```bash
curl -X PUT https://esm.do/@test/minimal \
  -H "Content-Type: application/json" \
  -d '{
    "types": "export declare const x: number;",
    "module": "export const x = 1;"
  }'
```

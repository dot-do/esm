# esm.do API Reference

This document provides a comprehensive overview of the esm.do HTTP API for managing ESM modules.

## Base URL

```
https://esm.do
```

All API endpoints are accessed relative to this base URL.

## Authentication

The esm.do API supports two authentication methods:

### Bearer Token (JWT)

Include a JWT token in the `Authorization` header:

```http
Authorization: Bearer <your-jwt-token>
```

JWT tokens must:
- Have a valid algorithm (algorithm "none" is rejected)
- Not be expired (if `exp` claim is present)
- Include a `sub` claim for user identification

### API Key

Include your API key in the `X-API-Key` header:

```http
X-API-Key: <your-api-key>
```

### Public Paths

Certain endpoints may be publicly accessible without authentication:
- `GET /:name` - Read module metadata
- `GET /:name.:ext` - Read module files
- `GET /list` - List modules
- `GET /:name/versions` - Version history

### Anonymous Access

When enabled, requests without credentials are allowed with limited permissions.

## Rate Limits

| Tier | Requests/minute | Burst |
|------|-----------------|-------|
| Anonymous | 60 | 10 |
| Authenticated | 600 | 100 |
| Premium | 6000 | 1000 |

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 599
X-RateLimit-Reset: 1704067200
```

When rate limited, the API returns `429 Too Many Requests`.

## Response Format

All API responses are JSON with consistent structure:

### Success Response

```json
{
  "data": {
    "name": "@math/add",
    "version": "a3f2dd1b7c4ee2"
  }
}
```

### Error Response

```json
{
  "error": "Module not found",
  "code": "MODULE_NOT_FOUND",
  "status": 404
}
```

### Content Response

For file endpoints (`.d.ts`, `.mjs`, etc.), raw content is returned with appropriate headers:

```http
Content-Type: application/javascript
Cache-Control: public, max-age=300
ETag: "abc123"
```

## Content Types

| Extension | Content-Type |
|-----------|--------------|
| `.d.ts` | `application/typescript` |
| `.mjs` | `application/javascript` |
| `.test.js` | `application/javascript` |
| `.script.js` | `application/javascript` |
| JSON responses | `application/json` |

## Caching

The API uses HTTP caching headers:

| Resource | Cache-Control |
|----------|---------------|
| Versioned modules (`@name@version`) | `public, max-age=31536000, immutable` |
| Latest modules | `public, max-age=300` |
| Module metadata | `public, max-age=60` |

ETags are provided for conditional requests:

```http
If-None-Match: "abc123"
```

## CORS

All endpoints support Cross-Origin Resource Sharing:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key
```

## API Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:name` | Read module metadata |
| GET | `/:name.:ext` | Read module file |
| GET | `/:name@:version` | Read specific version |
| PUT | `/:name` | Create/update module |
| DELETE | `/:name` | Delete module |
| GET | `/:name/versions` | List version history |
| POST | `/:name/run` | Execute module script |
| POST | `/:name/test` | Run module tests |
| GET | `/list` | List modules |

## Documentation

- [Modules API](./modules.md) - CRUD operations for modules
- [Execution API](./execution.md) - Running scripts and tests
- [Error Codes](./errors.md) - Error handling reference
- [Type Reference](./types.md) - TypeScript type definitions
- [OpenAPI Spec](./openapi.yaml) - Full API specification

## SDK

For TypeScript/JavaScript applications, use the official SDK:

```typescript
import { esm } from 'esm.do'

const module = await esm.read('@math/add')
```

See the [SDK documentation](./sdk.mdx) for full details.

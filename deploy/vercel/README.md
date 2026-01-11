# esm.do Vercel Edge Functions Deployment

This directory contains the Vercel Edge Functions deployment for the esm.do module system.

## Overview

The esm.do service runs on Vercel's Edge Runtime, providing low-latency access to ESM modules from edge locations worldwide. This deployment adapts the Cloudflare Workers-based architecture to work with Vercel's Edge Functions.

## Prerequisites

- Node.js >= 18
- Vercel CLI: `npm install -g vercel`
- Vercel account (sign up at https://vercel.com)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   ./deploy.sh           # Production deployment
   ./deploy.sh preview   # Preview deployment
   ./deploy.sh dev       # Local development
   ```

## File Structure

```
deploy/vercel/
├── api/
│   └── [[...path]].ts    # Catch-all Edge Function handler
├── middleware.ts          # Edge middleware (CORS, auth, preprocessing)
├── vercel.json           # Vercel configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript configuration
├── deploy.sh             # Deployment script
└── README.md             # This file
```

## Configuration

### Environment Variables

Set these in the Vercel dashboard or `.env.local`:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `ESM_DO_STORAGE` | Storage backend | In-memory |
| `ESM_DO_RATE_LIMIT_READ` | Read rate limit (req/min) | `500` |
| `ESM_DO_RATE_LIMIT_WRITE` | Write rate limit (req/min) | `100` |
| `ESM_DO_API_KEY` | API key for protected namespaces | - |
| `ESM_DO_ADMIN_KEY` | Admin API key | - |

### vercel.json

The configuration includes:
- Edge runtime settings for all API routes
- URL rewrites to route all paths to the catch-all handler
- CORS headers for cross-origin requests
- Cache headers for versioned assets (immutable)
- Regional deployment settings

## API Endpoints

All endpoints from the main esm.do API are available:

### GET Routes
- `GET /:scope/:name` - Module info
- `GET /:scope/:name.d.ts` - TypeScript declarations
- `GET /:scope/:name.mjs` - ESM module
- `GET /:scope/:name.test.js` - Test file
- `GET /:scope/:name.script.js` - Script file
- `GET /:scope/:name.bundle.mjs` - Bundled module
- `GET /:scope/:name@:version` - Specific version
- `GET /:scope/:name/deps` - Dependencies
- `GET /:scope/:name/diff` - Version diff

### POST Routes
- `POST /:scope/:name` - Create/update module
- `POST /:scope/:name/test` - Run tests
- `POST /:scope/:name/run` - Execute script
- `POST /:scope/:name/revert` - Revert version

### DELETE Routes
- `DELETE /:scope/:name` - Delete module

## Architecture Differences

### Cloudflare Workers vs Vercel Edge

| Feature | Cloudflare Workers | Vercel Edge |
|---------|-------------------|-------------|
| Runtime | workerd | Edge Runtime |
| Dynamic eval | `unsafe_eval` binding | Native `Function` |
| Storage | Cloudflare KV | Vercel KV (or external) |
| Environment | `env` parameter | `process.env` |
| IP Header | `cf-connecting-ip` | `x-forwarded-for` |

### Key Adaptations

1. **No `unsafe_eval` binding**: Vercel Edge allows native `eval()` and `new Function()`, so we use those directly instead of the Cloudflare binding.

2. **In-memory storage**: This deployment uses in-memory storage by default. For production, integrate with:
   - Vercel KV
   - Upstash Redis
   - External database

3. **Request IP**: Uses `x-forwarded-for` or `x-real-ip` instead of Cloudflare's `cf-connecting-ip`.

4. **Middleware**: Uses Next.js middleware for request preprocessing instead of Workers' fetch handler.

## Local Development

```bash
# Start development server
./deploy.sh dev

# Or directly with Vercel CLI
vercel dev
```

The development server runs on http://localhost:3000 by default.

## Deployment

### Production

```bash
./deploy.sh
```

Or manually:
```bash
vercel --prod
```

### Preview

```bash
./deploy.sh preview
```

### CI/CD

For automated deployments, set these environment variables:
- `VERCEL_TOKEN` - API token
- `VERCEL_ORG_ID` - Organization ID
- `VERCEL_PROJECT_ID` - Project ID

Example GitHub Actions:
```yaml
- name: Deploy to Vercel
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  run: |
    cd deploy/vercel
    ./deploy.sh
```

## Security

### Protected Namespaces

Namespaces starting with `@protected`, `@admin`, or `@system` require authentication for write operations.

### Rate Limiting

- Read operations: 500 requests/minute per IP
- Write operations: 100 requests/minute per IP

### Headers

The middleware adds security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Monitoring

View logs and metrics in the Vercel dashboard:
- https://vercel.com/dashboard

## Troubleshooting

### Function timeout
Edge Functions have a 30-second timeout. Ensure scripts complete within this limit.

### Cold starts
Edge Functions may have cold starts. The runtime is optimized for quick startups.

### Storage persistence
In-memory storage is cleared on function restart. Use external storage for production.

## Related

- [Main esm.do documentation](../../README.md)
- [Cloudflare Workers deployment](../cloudflare/)
- [Vercel Edge Functions docs](https://vercel.com/docs/functions/edge-functions)

# Cloudflare Workers Deployment

> Deploy esm.do to Cloudflare Workers for the best performance with global edge distribution and native Workers API support.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js 18+](https://nodejs.org/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

```bash
# Install Wrangler globally
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

## Quick Start

```bash
# Clone the repository
git clone https://github.com/dot-do/esm.git
cd esm

# Install dependencies
npm install

# Deploy to Cloudflare Workers
npx wrangler deploy
```

Your service will be available at `https://esm-do.<your-subdomain>.workers.dev`.

## Configuration

### wrangler.jsonc

The project includes a pre-configured `wrangler.jsonc`:

```jsonc
{
  "name": "esm-do",
  "main": "src/worker/index.ts",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],

  // Required for dynamic code execution
  "unsafe": {
    "bindings": [
      {
        "name": "unsafe_eval",
        "type": "eval"
      }
    ]
  },

  "dev": {
    "port": 8787
  }
}
```

### Production Configuration

Create `wrangler.production.jsonc` for production settings:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/cloudflare/wrangler/main/packages/wrangler/schemas/config/wrangler.json",
  "name": "esm-do",
  "main": "src/worker/index.ts",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],

  "unsafe": {
    "bindings": [
      {
        "name": "unsafe_eval",
        "type": "eval"
      }
    ]
  },

  // Production routes
  "routes": [
    {
      "pattern": "esm.do/*",
      "zone_name": "esm.do"
    },
    {
      "pattern": "*.esm.do/*",
      "zone_name": "esm.do"
    }
  ],

  // KV namespace for caching
  "kv_namespaces": [
    {
      "binding": "MODULE_CACHE",
      "id": "your-kv-namespace-id"
    }
  ],

  // R2 bucket for module storage
  "r2_buckets": [
    {
      "binding": "MODULE_STORAGE",
      "bucket_name": "esm-modules"
    }
  ],

  // D1 database for metadata
  "d1_databases": [
    {
      "binding": "MODULE_DB",
      "database_name": "esm-modules",
      "database_id": "your-d1-database-id"
    }
  ],

  // Analytics Engine for metrics
  "analytics_engine_datasets": [
    {
      "binding": "ANALYTICS",
      "dataset": "esm_metrics"
    }
  ],

  // Environment variables
  "vars": {
    "ENVIRONMENT": "production",
    "LOG_LEVEL": "info"
  }
}
```

## Setting Up Bindings

### KV Namespace (Caching)

```bash
# Create KV namespace
wrangler kv:namespace create MODULE_CACHE

# Create preview namespace for development
wrangler kv:namespace create MODULE_CACHE --preview

# Add IDs to wrangler.jsonc
```

### R2 Bucket (Module Storage)

```bash
# Create R2 bucket
wrangler r2 bucket create esm-modules

# Configure CORS for R2 (optional for direct access)
wrangler r2 bucket cors put esm-modules --rules '[
  {
    "allowedOrigins": ["https://esm.do"],
    "allowedMethods": ["GET"],
    "allowedHeaders": ["*"],
    "maxAgeSeconds": 86400
  }
]'
```

### D1 Database (Metadata)

```bash
# Create D1 database
wrangler d1 create esm-modules

# Initialize schema
wrangler d1 execute esm-modules --file=./migrations/001_initial.sql

# Add database ID to wrangler.jsonc
```

### Durable Objects (Optional)

For stateful operations, add Durable Objects:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "MODULE_STATE",
        "class_name": "ModuleState"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["ModuleState"]
    }
  ]
}
```

## Deployment Commands

```bash
# Development (local)
npx wrangler dev

# Development with remote resources
npx wrangler dev --remote

# Deploy to production
npx wrangler deploy

# Deploy to staging environment
npx wrangler deploy --env staging

# Deploy specific configuration
npx wrangler deploy --config wrangler.production.jsonc

# View deployment logs
npx wrangler tail

# View deployment logs with filtering
npx wrangler tail --format pretty --status error
```

## Custom Domain Setup

### Using Cloudflare DNS

1. Add your domain to Cloudflare
2. Configure routes in `wrangler.jsonc`:

```jsonc
{
  "routes": [
    {
      "pattern": "esm.do/*",
      "zone_name": "esm.do"
    }
  ]
}
```

3. Deploy:

```bash
npx wrangler deploy
```

### Using Custom Domains Feature

```bash
# Add custom domain
wrangler publish
wrangler domains add esm.do

# List custom domains
wrangler domains list
```

## Environment-Specific Deployments

### Multi-Environment Configuration

```jsonc
{
  "name": "esm-do",
  "main": "src/worker/index.ts",

  "env": {
    "staging": {
      "name": "esm-do-staging",
      "vars": {
        "ENVIRONMENT": "staging",
        "LOG_LEVEL": "debug"
      },
      "routes": [
        {
          "pattern": "staging.esm.do/*",
          "zone_name": "esm.do"
        }
      ]
    },
    "production": {
      "name": "esm-do-production",
      "vars": {
        "ENVIRONMENT": "production",
        "LOG_LEVEL": "info"
      },
      "routes": [
        {
          "pattern": "esm.do/*",
          "zone_name": "esm.do"
        }
      ]
    }
  }
}
```

### Deploy to Specific Environment

```bash
# Deploy to staging
npx wrangler deploy --env staging

# Deploy to production
npx wrangler deploy --env production
```

## Secrets Management

```bash
# Set a secret
wrangler secret put API_KEY
# Enter your secret value when prompted

# Set secret for specific environment
wrangler secret put API_KEY --env production

# List secrets
wrangler secret list

# Delete a secret
wrangler secret delete API_KEY
```

## CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          # Deploy to staging for PRs, production for main
          environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
```

### Required Secrets

Add these to your GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`: API token with Workers permissions
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

## Monitoring

### Wrangler Tail

```bash
# Stream logs in real-time
npx wrangler tail

# Filter by status
npx wrangler tail --status error

# Filter by sampling rate
npx wrangler tail --sampling-rate 0.1

# JSON format for processing
npx wrangler tail --format json | jq '.logs[]'
```

### Analytics Engine

Query analytics using the GraphQL API:

```graphql
query {
  viewer {
    accounts(filter: { accountTag: "your-account-id" }) {
      esmMetrics: analyticsEngineDatasets(
        filter: { datasetName: "esm_metrics" }
        limit: 100
      ) {
        count
        dimensions {
          method
          path
          status
        }
        avg {
          sampleInterval
        }
      }
    }
  }
}
```

## Troubleshooting

### Common Issues

#### 1. "unsafe_eval" Binding Error

**Problem**: Module execution fails with eval-related errors.

**Solution**: Ensure the unsafe binding is configured:

```jsonc
{
  "unsafe": {
    "bindings": [
      {
        "name": "unsafe_eval",
        "type": "eval"
      }
    ]
  }
}
```

Note: This binding is only available with Workers Paid plan for production.

#### 2. KV/R2/D1 Not Found

**Problem**: Bindings return undefined.

**Solution**: Verify binding names match between code and configuration:

```typescript
// Code expects:
env.MODULE_CACHE

// wrangler.jsonc must have:
{
  "kv_namespaces": [{
    "binding": "MODULE_CACHE",  // This name must match
    "id": "..."
  }]
}
```

#### 3. Route Not Matching

**Problem**: Custom domain returns 404.

**Solution**: Check route configuration:

```bash
# List current routes
wrangler route list

# Verify zone is added to Cloudflare
wrangler zones list
```

#### 4. Memory Limit Exceeded

**Problem**: Worker fails with memory errors on large modules.

**Solution**: Optimize module loading or use streaming:

```typescript
// Stream large responses instead of buffering
return new Response(readableStream, {
  headers: { 'Content-Type': 'application/javascript' }
});
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug log level
wrangler secret put LOG_LEVEL
# Enter: debug

# View detailed logs
npx wrangler tail --format pretty
```

## Performance Optimization

### 1. Cache-Control Headers

```typescript
// Cache immutable module versions
return new Response(moduleCode, {
  headers: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'application/javascript'
  }
});
```

### 2. KV Caching Strategy

```typescript
// Check cache first
const cached = await env.MODULE_CACHE.get(key);
if (cached) {
  return new Response(cached, { headers: cacheHeaders });
}

// Store in cache with metadata
await env.MODULE_CACHE.put(key, value, {
  expirationTtl: 86400,
  metadata: { version, timestamp }
});
```

### 3. Smart Routing

Use Cloudflare Smart Placement for optimal performance:

```jsonc
{
  "placement": {
    "mode": "smart"
  }
}
```

## Limits and Quotas

| Resource | Free Plan | Paid Plan |
|----------|-----------|-----------|
| Requests/day | 100,000 | Unlimited |
| CPU time | 10ms | 30s (50ms default) |
| Memory | 128MB | 128MB |
| Script size | 1MB | 10MB |
| KV reads/day | 100,000 | Unlimited |
| KV writes/day | 1,000 | Unlimited |
| R2 storage | - | Pay per use |
| D1 storage | 5GB (beta) | Pay per use |

## Next Steps

1. Set up [Monitoring](./monitoring.md) for production observability
2. Configure [CI/CD](#cicd-with-github-actions) for automated deployments
3. Review [security best practices](./README.md#security-considerations)
4. Explore [Durable Objects](#durable-objects-optional) for stateful workloads

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [D1 Documentation](https://developers.cloudflare.com/d1/)

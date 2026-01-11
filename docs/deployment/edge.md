# Edge Platform Deployment

> Deploy esm.do on edge platforms for global distribution, low latency, and simplified operations.

## Fly.io

### Prerequisites

- [Fly.io account](https://fly.io/app/sign-up)
- [flyctl CLI](https://fly.io/docs/hands-on/install-flyctl/)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

### Quick Start

```bash
# Navigate to Fly deployment directory
cd deploy/fly

# Launch new app (first time)
fly launch --name esm-do --region iad

# Deploy
fly deploy
```

### fly.toml Configuration

```toml
# deploy/fly/fly.toml
app = "esm-do"
primary_region = "iad"

[build]
dockerfile = "Dockerfile"

[env]
NODE_ENV = "production"
PORT = "8787"

[http_service]
internal_port = 8787
force_https = true
auto_stop_machines = "stop"
auto_start_machines = true
min_machines_running = 1
processes = ["app"]

[[http_service.checks]]
grace_period = "10s"
interval = "30s"
method = "GET"
path = "/health"
port = 8787
timeout = "5s"

[[vm]]
memory = "512mb"
cpu_kind = "shared"
cpus = 1

[deploy]
strategy = "rolling"

[[services]]
protocol = "tcp"
internal_port = 8787

[[services.ports]]
port = 80
handlers = ["http"]

[[services.ports]]
port = 443
handlers = ["tls", "http"]

[services.concurrency]
type = "requests"
soft_limit = 200
hard_limit = 250

[metrics]
port = 9091
path = "/metrics"
```

### Multi-Region Deployment

```bash
# Add regions
fly regions add lhr sin syd fra

# Scale to multiple regions
fly scale count 2 --region iad
fly scale count 2 --region lhr
fly scale count 1 --region sin

# View status
fly status
```

### Fly.io Secrets

```bash
# Set secrets
fly secrets set API_KEY=your-api-key
fly secrets set DATABASE_URL=postgres://...

# List secrets
fly secrets list

# Unset secret
fly secrets unset API_KEY
```

### Persistent Storage with Volumes

```bash
# Create volume
fly volumes create esm_data --region iad --size 10

# Mount in fly.toml
# [mounts]
# source = "esm_data"
# destination = "/data"
```

### Fly.io PostgreSQL

```bash
# Create Postgres cluster
fly postgres create --name esm-db

# Attach to app
fly postgres attach esm-db

# Connect
fly postgres connect -a esm-db
```

---

## Vercel

### Prerequisites

- [Vercel account](https://vercel.com/signup)
- [Vercel CLI](https://vercel.com/docs/cli)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login
```

### Quick Start

```bash
# Deploy from project root
vercel

# Deploy to production
vercel --prod
```

### vercel.json Configuration

```json
{
  "name": "esm-do",
  "version": 2,
  "builds": [
    {
      "src": "src/vercel/api/index.ts",
      "use": "@vercel/node",
      "config": {
        "maxLambdaSize": "50mb"
      }
    }
  ],
  "routes": [
    {
      "src": "/health",
      "dest": "/api/health"
    },
    {
      "src": "/(.*)",
      "dest": "/api/index"
    }
  ],
  "regions": ["iad1", "sfo1", "lhr1", "sin1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Vercel Edge Functions

```typescript
// src/vercel/api/index.ts
import { createApp } from '../../../src/app';

const app = createApp();

export const config = {
  runtime: 'edge',
  regions: ['iad1', 'sfo1', 'lhr1', 'sin1', 'hnd1'],
};

export default async function handler(request: Request) {
  return app.fetch(request);
}
```

### Environment Variables

```bash
# Set environment variables
vercel env add NODE_ENV production
vercel env add API_KEY

# List environment variables
vercel env ls

# Pull environment variables to .env.local
vercel env pull
```

### Preview Deployments

```bash
# Every PR gets a preview URL automatically
# Or deploy a preview manually
vercel

# Promote preview to production
vercel --prod
```

---

## Netlify

### Prerequisites

- [Netlify account](https://app.netlify.com/signup)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login
```

### Quick Start

```bash
# Initialize site
netlify init

# Deploy
netlify deploy

# Deploy to production
netlify deploy --prod
```

### netlify.toml Configuration

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
  directory = "netlify/functions"

[[edge_functions]]
  path = "/*"
  function = "esm-handler"

[dev]
  command = "npm run dev"
  port = 8787
  targetPort = 3000

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[context.production]
  environment = { NODE_ENV = "production" }

[context.deploy-preview]
  environment = { NODE_ENV = "preview" }

[context.branch-deploy]
  environment = { NODE_ENV = "staging" }
```

### Netlify Edge Functions

```typescript
// netlify/edge-functions/esm-handler.ts
import type { Context } from '@netlify/edge-functions';
import { createApp } from '../../src/app';

const app = createApp();

export default async (request: Request, context: Context) => {
  return app.fetch(request);
};

export const config = {
  path: '/*',
  excludedPath: ['/.netlify/*', '/favicon.ico'],
};
```

### Netlify Functions (Serverless)

```typescript
// netlify/functions/api.ts
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createApp } from '../../src/app';

const app = createApp();

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  const { httpMethod, path, headers, body, queryStringParameters } = event;

  const url = new URL(path, `https://${headers.host}`);
  if (queryStringParameters) {
    Object.entries(queryStringParameters).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }

  const request = new Request(url.toString(), {
    method: httpMethod,
    headers: new Headers(headers as Record<string, string>),
    body: body && httpMethod !== 'GET' ? body : undefined,
  });

  const response = await app.fetch(request);

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: await response.text(),
  };
};
```

### Environment Variables

```bash
# Set environment variables
netlify env:set NODE_ENV production
netlify env:set API_KEY your-api-key

# Import from .env file
netlify env:import .env

# List environment variables
netlify env:list
```

---

## Render

### Prerequisites

- [Render account](https://render.com/)

### Quick Start

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Select the repository and branch
4. Configure build settings

### render.yaml Blueprint

```yaml
# deploy/render/render.yaml
services:
  - type: web
    name: esm-do
    runtime: docker
    region: oregon
    dockerfilePath: ./deploy/render/Dockerfile
    dockerContext: .
    plan: starter
    numInstances: 1
    autoDeploy: true
    branch: main
    healthCheckPath: /health

    scaling:
      minInstances: 1
      maxInstances: 3
      targetMemoryPercent: 80
      targetCPUPercent: 80

    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "8787"
      - key: LOG_LEVEL
        value: info

    headers:
      - path: /*
        name: X-Content-Type-Options
        value: nosniff
      - path: /*
        name: X-Frame-Options
        value: DENY
```

### Render Dockerfile

```dockerfile
# deploy/render/Dockerfile
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/dist ./core/dist

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs
USER nodejs

EXPOSE 8787
CMD ["node", "dist/index.js"]
```

### Deploy with Render CLI

```bash
# Install Render CLI (unofficial)
# Or use the dashboard for deployments

# Deploy using Blueprint
render blueprint sync

# View logs
render logs esm-do
```

---

## Railway

### Prerequisites

- [Railway account](https://railway.app/)
- [Railway CLI](https://docs.railway.app/develop/cli)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login
```

### Quick Start

```bash
# Initialize project
railway init

# Link to existing project
railway link

# Deploy
railway up
```

### railway.toml Configuration

```toml
# deploy/railway/railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "deploy/railway/Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### railway.json Configuration

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "dockerfile",
    "dockerfilePath": "deploy/railway/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "startCommand": "node dist/index.js"
  }
}
```

### Environment Variables

```bash
# Set variables
railway variables set NODE_ENV=production
railway variables set API_KEY=your-key

# View variables
railway variables
```

### Railway PostgreSQL

```bash
# Add PostgreSQL plugin
railway add -p postgresql

# View connection string
railway variables | grep DATABASE_URL
```

---

## Fastly Compute

### Prerequisites

- [Fastly account](https://www.fastly.com/signup/)
- [Fastly CLI](https://developer.fastly.com/learning/compute/)

```bash
# Install Fastly CLI
brew install fastly/tap/fastly

# Login
fastly profile create
```

### Quick Start

```bash
# Initialize Compute project
fastly compute init

# Build and deploy
fastly compute build
fastly compute deploy
```

### fastly.toml Configuration

```toml
# fastly.toml
authors = ["esm.do team"]
description = "Living ESM module system for AI agents"
language = "javascript"
manifest_version = 2
name = "esm-do"
service_id = ""

[scripts]
build = "npm run build:fastly"

[local_server]
[local_server.backends]
[local_server.backends.origin]
url = "https://api.esm.do"
```

### Fastly Compute Handler

```typescript
// src/fastly/index.ts
/// <reference types="@fastly/js-compute" />
import { createApp } from '../app';

const app = createApp();

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request: Request): Promise<Response> {
  return app.fetch(request);
}
```

---

## Comparison Table

| Feature | Fly.io | Vercel | Netlify | Render | Railway |
|---------|--------|--------|---------|--------|---------|
| **Edge Locations** | 30+ | 15+ | 15+ | 4 | 4 |
| **Cold Start** | ~100ms | ~50ms (Edge) | ~100ms (Edge) | ~500ms | ~500ms |
| **Free Tier** | $5 credit | 100GB BW | 100GB BW | 750 hrs | $5 credit |
| **Container Support** | Native | No | No | Docker | Docker |
| **Managed DB** | PostgreSQL, Redis | Postgres, KV | Blobs | PostgreSQL | PostgreSQL, Redis |
| **Git Deploy** | Yes | Yes | Yes | Yes | Yes |
| **Preview Deploys** | Yes | Yes | Yes | Yes | Yes |
| **CLI** | flyctl | vercel | netlify | Dashboard | railway |
| **Best For** | Full control, Docker | Frontend, Edge Functions | JAMstack | Simple Docker | Quick prototypes |

## Multi-Platform Deployment Strategy

### DNS-Based Load Balancing

```
                    ┌─────────────────┐
                    │    Cloudflare   │
                    │   DNS / CDN     │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │ Fly.io  │         │ Vercel  │         │ Render  │
    │  (US)   │         │ (Edge)  │         │  (EU)   │
    └─────────┘         └─────────┘         └─────────┘
```

### Geo-Routing Example

```javascript
// Cloudflare Worker for geo-routing
export default {
  async fetch(request) {
    const country = request.cf?.country;

    const backends = {
      US: 'https://us.esm.do',
      EU: 'https://eu.esm.do',
      ASIA: 'https://asia.esm.do',
    };

    const region = ['US', 'CA', 'MX'].includes(country) ? 'US'
                 : ['GB', 'DE', 'FR', 'NL'].includes(country) ? 'EU'
                 : 'ASIA';

    const backend = backends[region];
    const url = new URL(request.url);
    url.host = new URL(backend).host;

    return fetch(new Request(url, request));
  }
};
```

## Troubleshooting

### Common Issues

#### 1. Build Failures

```bash
# Check build logs
fly logs --app esm-do
vercel logs
netlify logs:deploy
railway logs
```

#### 2. Cold Start Optimization

- Use smaller bundle sizes
- Lazy load dependencies
- Enable warm-up pings
- Use Edge Functions where available

#### 3. Memory Issues

- Increase memory limits
- Optimize code
- Use streaming for large responses

### Debug Mode

```bash
# Fly.io
fly ssh console -a esm-do

# Vercel
vercel dev

# Netlify
netlify dev

# Railway
railway run sh
```

## Next Steps

1. Set up [Monitoring](./monitoring.md) for observability
2. Configure CI/CD for automated deployments
3. Implement health checks and alerting
4. Review performance optimization

## Resources

- [Fly.io Documentation](https://fly.io/docs/)
- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com/)
- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [Fastly Compute Documentation](https://developer.fastly.com/learning/compute/)

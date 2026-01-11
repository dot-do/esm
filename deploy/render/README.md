# Render Deployment for esm.do

This directory contains configuration for deploying esm.do to [Render](https://render.com).

## Overview

esm.do is a Cloudflare Workers-based ESM module system. This deployment uses [miniflare](https://miniflare.dev/) to run the worker in a Docker container on Render.

## Files

| File | Description |
|------|-------------|
| `render.yaml` | Render Blueprint specification |
| `Dockerfile` | Multi-stage Docker build for production |
| `start.sh` | Startup script with environment validation |
| `deploy.sh` | Manual deployment script |

## Quick Start

### Option 1: Render Blueprint (Recommended)

1. Fork/push this repository to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** > **Blueprint**
4. Connect your repository
5. Render will automatically detect `deploy/render/render.yaml`
6. Click **Apply** to deploy

### Option 2: Manual Docker Deploy

```bash
# Build the Docker image
docker build -f deploy/render/Dockerfile -t esm-do .

# Test locally
docker run -p 8787:8787 esm-do

# Verify it works
curl http://localhost:8787/health
```

### Option 3: Deployment Script

```bash
# Build and test only
./deploy/render/deploy.sh --build-only

# Full deployment (requires API key)
export RENDER_API_KEY="your-api-key"
export RENDER_SERVICE_ID="srv-xxxxx"
./deploy/render/deploy.sh
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Server port |
| `NODE_ENV` | `production` | Environment mode |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `STORAGE_BACKEND` | `memory` | Storage backend type |
| `CACHE_TTL` | `3600` | Cache TTL in seconds |
| `API_KEY` | - | Optional API key for authentication |

### Scaling

The `render.yaml` includes scaling configuration:

```yaml
scaling:
  minInstances: 1
  maxInstances: 3
  targetMemoryPercent: 80
  targetCPUPercent: 80
```

Adjust these values based on your traffic patterns.

### Health Checks

The service exposes two health endpoints:

- **`GET /health`** - Liveness probe (lightweight)
- **`GET /status`** - Readiness probe (detailed)

Render is configured to use `/health` for health checks.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Render                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Docker Container                     │    │
│  │  ┌───────────────────────────────────────────────┐  │    │
│  │  │              dumb-init (PID 1)                │  │    │
│  │  │  ┌─────────────────────────────────────────┐  │  │    │
│  │  │  │            start.sh                     │  │  │    │
│  │  │  │  ┌───────────────────────────────────┐  │  │  │    │
│  │  │  │  │           miniflare               │  │  │  │    │
│  │  │  │  │  ┌─────────────────────────────┐  │  │  │  │    │
│  │  │  │  │  │    esm.do Worker            │  │  │  │  │    │
│  │  │  │  │  │    (src/worker/index.ts)    │  │  │  │  │    │
│  │  │  │  │  └─────────────────────────────┘  │  │  │  │    │
│  │  │  │  └───────────────────────────────────┘  │  │  │    │
│  │  │  └─────────────────────────────────────────┘  │  │    │
│  │  └───────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                           :8787                              │
└─────────────────────────────────────────────────────────────┘
```

## Comparison with Cloudflare Workers

| Feature | Cloudflare Workers | Render |
|---------|-------------------|--------|
| Cold start | ~0ms | ~1-2s |
| Edge locations | 300+ | 6 regions |
| Free tier | 100K req/day | 750 hours/mo |
| Custom domains | Yes | Yes |
| WebSockets | Yes | Yes |
| Durable Objects | Yes | No (use external) |

## Troubleshooting

### Container won't start

Check the logs:
```bash
# Local testing
docker run -it esm-do sh

# On Render
# Go to Dashboard > Service > Logs
```

### Health check failing

1. Verify the port is correctly exposed
2. Check if miniflare is starting properly
3. Ensure `wrangler.jsonc` is valid

### Build failures

1. Check that all dependencies are in `package.json`
2. Verify TypeScript compilation passes locally
3. Check Docker build logs for errors

## Development

### Local Testing

```bash
# Run with Docker
docker build -f deploy/render/Dockerfile -t esm-do .
docker run -p 8787:8787 -e LOG_LEVEL=debug esm-do

# Or run directly with miniflare
npx miniflare --config wrangler.jsonc
```

### Updating Configuration

1. Modify `render.yaml` as needed
2. Push to your repository
3. Render will automatically sync the blueprint

## Resources

- [Render Documentation](https://render.com/docs)
- [Render Blueprints](https://render.com/docs/blueprint-spec)
- [miniflare Documentation](https://miniflare.dev/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)

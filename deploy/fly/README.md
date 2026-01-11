# Fly.io Deployment for esm.do

This directory contains the configuration and scripts for deploying esm.do to Fly.io.

## Overview

esm.do is a Cloudflare Workers-based ESM module system. This deployment uses [Miniflare](https://miniflare.dev/) to run the Workers runtime on Fly.io, enabling multi-region deployment with Fly's edge infrastructure.

## Prerequisites

1. **Fly.io CLI**: Install the Fly CLI
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Authentication**: Log in to Fly.io
   ```bash
   fly auth login
   ```

3. **Node.js**: Ensure Node.js 18+ is installed locally for building

## Quick Start

### Deploy

Run the full deployment:

```bash
./deploy/fly/fly-deploy.sh deploy
```

This will:
1. Create the app if it doesn't exist
2. Set any configured secrets
3. Build and deploy the Docker image
4. Scale to multiple regions
5. Verify the deployment

### Check Status

```bash
./deploy/fly/fly-deploy.sh status
```

## Configuration

### fly.toml

The main Fly.io configuration file. Key settings:

| Setting | Value | Description |
|---------|-------|-------------|
| `app` | esm-do | Application name |
| `primary_region` | iad | Primary region (US East) |
| `internal_port` | 8787 | Worker port (matches wrangler config) |
| `min_machines_running` | 1 | Minimum always-on machines |

### Environment Variables

Set in `fly.toml` or as secrets:

| Variable | Description | Secret? |
|----------|-------------|---------|
| `NODE_ENV` | Environment (production) | No |
| `PORT` | Service port | No |
| `ESM_API_KEY` | API authentication key | Yes |
| `ESM_STORAGE_KEY` | Storage encryption key | Yes |
| `ESM_AUTH_TOKEN` | Auth token | Yes |

### Setting Secrets

```bash
# Set individual secrets
fly secrets set ESM_API_KEY=your-api-key --app esm-do

# Set multiple secrets
fly secrets set ESM_API_KEY=key1 ESM_STORAGE_KEY=key2 --app esm-do

# Or use the deployment script
ESM_API_KEY=your-key ./deploy/fly/fly-deploy.sh secrets
```

## Multi-Region Deployment

The deployment is configured for multi-region scaling:

| Region | Code | Location |
|--------|------|----------|
| Primary | iad | Ashburn, Virginia (US East) |
| Secondary | lhr | London, UK |
| Secondary | sin | Singapore |
| Secondary | syd | Sydney, Australia |

### Manual Scaling

```bash
# Add a machine in a specific region
fly machine clone --app esm-do --region lhr

# List all machines
fly machines list --app esm-do

# Scale machine count
fly scale count 3 --app esm-do
```

## Health Checks

The deployment includes health checks:

- **Endpoint**: `/health`
- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Grace Period**: 10 seconds

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Fly.io Edge                          │
├─────────────┬─────────────┬─────────────┬──────────────┤
│   US East   │   London    │  Singapore  │   Sydney     │
│   (iad)     │   (lhr)     │   (sin)     │   (syd)      │
├─────────────┴─────────────┴─────────────┴──────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Docker Container                    │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │           Miniflare Runtime             │    │   │
│  │  │  ┌─────────────────────────────────┐    │    │   │
│  │  │  │      esm.do Worker              │    │    │   │
│  │  │  │  - Module storage               │    │    │   │
│  │  │  │  - Test execution               │    │    │   │
│  │  │  │  - Script runner                │    │    │   │
│  │  │  └─────────────────────────────────┘    │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

### View Logs

```bash
# Stream logs
fly logs --app esm-do

# View recent logs
fly logs --app esm-do --last 100
```

### SSH into Machine

```bash
fly ssh console --app esm-do
```

### Restart Application

```bash
fly apps restart esm-do
```

### Check Machine Status

```bash
fly machines list --app esm-do
```

### Common Issues

1. **Health check failing**
   - Ensure `/health` endpoint is implemented in the worker
   - Check logs for startup errors
   - Verify port 8787 is correctly exposed

2. **Build failing**
   - Check that all dependencies are in package.json
   - Verify TypeScript compilation succeeds locally
   - Check Docker build logs: `fly deploy --verbose`

3. **Secrets not working**
   - List secrets: `fly secrets list --app esm-do`
   - Re-set secrets if needed
   - Restart after setting: `fly apps restart esm-do`

## Comparison with Cloudflare Workers

| Feature | Cloudflare Workers | Fly.io |
|---------|-------------------|--------|
| Runtime | workerd | Miniflare (workerd-compatible) |
| Edge locations | 300+ cities | 35+ regions |
| Cold starts | ~0ms | ~50-100ms |
| Pricing | Request-based | Machine-based |
| Durable Objects | Native | Not supported |
| KV Storage | Native | External (e.g., Redis) |

## Development

### Local Testing

```bash
# Run locally with wrangler
cd /Users/nathanclevenger/projects/esm
pnpm wrangler dev

# Or with miniflare directly
npx miniflare src/worker/index.ts
```

### Build Docker Image Locally

```bash
cd /Users/nathanclevenger/projects/esm
docker build -f deploy/fly/Dockerfile -t esm-do .
docker run -p 8787:8787 esm-do
```

## Resources

- [Fly.io Documentation](https://fly.io/docs/)
- [Miniflare Documentation](https://miniflare.dev/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [esm.do Repository](https://github.com/dot-do/esm)

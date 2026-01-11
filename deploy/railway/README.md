# Railway Deployment for esm.do

This directory contains configuration files for deploying esm.do to [Railway](https://railway.app).

## Overview

esm.do is a Cloudflare Workers-based ESM module system. Since Railway doesn't natively support Cloudflare Workers, we use [Miniflare](https://miniflare.dev/) to run the worker in a Node.js environment.

## Files

| File | Description |
|------|-------------|
| `railway.toml` | Railway configuration (TOML format) |
| `railway.json` | Railway configuration (JSON format) |
| `Dockerfile` | Multi-stage Docker build for production |
| `nixpacks.toml` | Nixpacks configuration (alternative to Docker) |
| `Procfile` | Process type definitions |
| `deploy.sh` | Automated deployment script |

## Quick Start

### Prerequisites

1. Install the Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Authenticate with Railway:
   ```bash
   railway login
   ```

3. Link to your project (or create a new one):
   ```bash
   railway link
   # or
   railway init
   ```

### Deploy

#### Option 1: Using the deployment script (recommended)

```bash
./deploy/railway/deploy.sh
```

#### Option 2: Manual deployment

```bash
# From project root
railway up --dockerfile deploy/railway/Dockerfile
```

#### Option 3: Using Nixpacks

```bash
# Railway will auto-detect nixpacks.toml if Dockerfile is not specified
railway up
```

## Configuration

### Environment Variables

The following environment variables are configured:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `PORT` | `8787` | Port for the HTTP server |
| `MINIFLARE_LOG_LEVEL` | `info` | Miniflare logging level |

To set additional variables:

```bash
railway variables set KEY=value
```

### Custom Domain

1. Add a custom domain in Railway dashboard
2. Configure DNS to point to Railway's servers
3. Railway handles SSL automatically

```bash
# List domains
railway domain

# Open Railway dashboard
railway open
```

### Health Checks

The deployment includes health checks:

- **Path**: `/`
- **Timeout**: 30 seconds
- **Interval**: 30 seconds
- **Retries**: 3

## Architecture

```
Railway Container
+------------------------------------------+
|  Node.js Runtime                         |
|  +------------------------------------+  |
|  |  Miniflare                         |  |
|  |  +------------------------------+  |  |
|  |  |  Cloudflare Worker Runtime   |  |  |
|  |  |  - esm.do Worker             |  |  |
|  |  |  - unsafe_eval binding       |  |  |
|  |  +------------------------------+  |  |
|  +------------------------------------+  |
+------------------------------------------+
```

## Differences from Cloudflare Workers

When running on Railway via Miniflare:

1. **No Edge Network**: Requests are served from Railway's infrastructure
2. **No Durable Objects**: Not supported in Miniflare standalone mode
3. **No KV/R2/D1**: Would need mock implementations or external services
4. **Memory Limits**: Container-based, not isolate-based limits

## Monitoring

### Logs

```bash
# Stream logs
railway logs

# Follow logs
railway logs -f
```

### Metrics

Railway provides built-in metrics in the dashboard:
- CPU usage
- Memory usage
- Request count
- Response times

## Scaling

Railway supports horizontal scaling:

```bash
# Edit railway.toml or railway.json to set numReplicas
# Then redeploy
railway up
```

## Troubleshooting

### Common Issues

1. **Port binding issues**
   - Ensure PORT environment variable matches internalPort
   - Default: 8787

2. **Build failures**
   - Check that all dependencies are in package.json
   - Verify pnpm-lock.yaml is committed

3. **Miniflare crashes**
   - Check logs for JavaScript errors
   - Verify worker syntax is correct

### Debug Mode

Set environment variables for debugging:

```bash
railway variables set MINIFLARE_LOG_LEVEL=debug
railway variables set DEBUG=miniflare:*
```

## Cost Considerations

Railway pricing is usage-based:
- Compute: Per-hour pricing for CPU/memory
- Bandwidth: Per-GB pricing for egress
- Storage: Per-GB pricing for persistent storage

For high-traffic applications, consider deploying to Cloudflare Workers directly for better cost efficiency at scale.

## Related Resources

- [Railway Documentation](https://docs.railway.app/)
- [Miniflare Documentation](https://miniflare.dev/)
- [esm.do Documentation](https://esm.do/docs)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

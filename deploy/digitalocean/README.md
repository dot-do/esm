# DigitalOcean App Platform Deployment for esm.do

This directory contains the configuration and scripts for deploying esm.do to DigitalOcean App Platform.

## Overview

esm.do is a Cloudflare Workers-based ESM module system. This deployment uses [Miniflare](https://miniflare.dev/) to run the Workers runtime on DigitalOcean App Platform, providing a managed container-based deployment with automatic scaling and health checks.

## Prerequisites

1. **DigitalOcean Account**: Sign up at [digitalocean.com](https://www.digitalocean.com/)

2. **doctl CLI**: Install the DigitalOcean CLI

   ```bash
   # macOS
   brew install doctl

   # Linux (snap)
   snap install doctl

   # Manual installation
   # https://docs.digitalocean.com/reference/doctl/how-to/install/
   ```

3. **Authentication**: Log in to DigitalOcean

   ```bash
   doctl auth init
   ```

4. **Node.js**: Ensure Node.js 18+ is installed locally for building

## Quick Start

### Deploy

Run the deployment script:

```bash
./deploy/digitalocean/deploy.sh deploy
```

This will:
1. Check if the app exists
2. Create a new app or update the existing one
3. Build and deploy the Docker image
4. Display the live URL and status

### Check Status

```bash
./deploy/digitalocean/deploy.sh status
```

### Stream Logs

```bash
./deploy/digitalocean/deploy.sh logs
```

## Configuration

### App Spec (.do/app.yaml)

The main DigitalOcean App Platform configuration file. Key settings:

| Setting | Value | Description |
|---------|-------|-------------|
| `name` | esm-do | Application name |
| `region` | nyc | Deployment region |
| `instance_size_slug` | basic-xxs | Instance size |
| `http_port` | 8787 | Worker port |

### Instance Sizes

| Slug | vCPU | Memory | Monthly Cost |
|------|------|--------|--------------|
| `basic-xxs` | 1 | 512 MB | ~$5 |
| `basic-xs` | 1 | 1 GB | ~$10 |
| `basic-s` | 1 | 2 GB | ~$20 |
| `basic-m` | 2 | 4 GB | ~$40 |
| `professional-xs` | 1 | 1 GB | ~$12 |
| `professional-s` | 1 | 2 GB | ~$25 |

### Environment Variables

Set in `app.yaml` or via the dashboard:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | production |
| `PORT` | Service port | 8787 |
| `HOST` | Bind address | 0.0.0.0 |
| `LOG_LEVEL` | Log verbosity | info |
| `STORAGE_BACKEND` | Storage type | memory |

### Setting Secrets

Secrets should be set via the DigitalOcean dashboard or doctl:

```bash
# Using doctl (after app is created)
doctl apps update <app-id> --spec <(cat .do/app.yaml | yq '.services[0].envs += [{"key": "ESM_API_KEY", "value": "your-secret", "scope": "RUN_TIME", "type": "SECRET"}]')
```

Or via the dashboard:
1. Go to App Platform > Your App > Settings > App-Level Environment Variables
2. Add variables with the "Encrypt" option enabled

## Manual Deployment

### Using doctl

```bash
# Create new app
doctl apps create --spec deploy/digitalocean/.do/app.yaml

# Update existing app
doctl apps update <app-id> --spec deploy/digitalocean/.do/app.yaml

# List apps
doctl apps list

# Get app details
doctl apps get <app-id>
```

### Using Dashboard

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Connect your GitHub repository
4. Upload the app spec or configure manually
5. Deploy

## Regions

Available DigitalOcean App Platform regions:

| Region | Code | Location |
|--------|------|----------|
| New York | nyc | New York City, USA |
| San Francisco | sfo | San Francisco, USA |
| Amsterdam | ams | Amsterdam, Netherlands |
| Singapore | sgp | Singapore |
| London | lon | London, UK |
| Frankfurt | fra | Frankfurt, Germany |
| Toronto | tor | Toronto, Canada |
| Bangalore | blr | Bangalore, India |
| Sydney | syd | Sydney, Australia |

## Health Checks

The deployment includes HTTP health checks:

- **Endpoint**: `/health`
- **Initial Delay**: 10 seconds
- **Period**: 30 seconds
- **Timeout**: 5 seconds
- **Failure Threshold**: 3

## Scaling

### Manual Scaling

Update `instance_count` in app.yaml:

```yaml
services:
  - name: esm-do
    instance_count: 3
```

Then redeploy:

```bash
./deploy/digitalocean/deploy.sh update
```

### Auto-scaling (Pro Plans)

Enable auto-scaling in app.yaml:

```yaml
services:
  - name: esm-do
    autoscaling:
      min_instance_count: 1
      max_instance_count: 5
      metrics:
        cpu:
          percent: 80
```

## Architecture

```
+-----------------------------------------------------------+
|                 DigitalOcean App Platform                  |
+-----------------------------------------------------------+
|                                                           |
|  +-----------------------------------------------------+  |
|  |                  Load Balancer                       |  |
|  |              (Automatic TLS/SSL)                     |  |
|  +-----------------------------------------------------+  |
|                           |                               |
|           +---------------+---------------+               |
|           |               |               |               |
|  +--------v------+  +-----v-------+  +----v--------+     |
|  |   Instance 1  |  |  Instance 2 |  |  Instance 3 |     |
|  |               |  |             |  |             |     |
|  | +-----------+ |  | +---------+ |  | +---------+ |     |
|  | |  Docker   | |  | | Docker  | |  | | Docker  | |     |
|  | | Container | |  | |Container| |  | |Container| |     |
|  | +-----------+ |  | +---------+ |  | +---------+ |     |
|  |       |       |  |      |      |  |      |      |     |
|  | +-----v-----+ |  | +----v----+ |  | +----v----+ |     |
|  | | Miniflare | |  | |Miniflare| |  | |Miniflare| |     |
|  | +-----------+ |  | +---------+ |  | +---------+ |     |
|  |       |       |  |      |      |  |      |      |     |
|  | +-----v-----+ |  | +----v----+ |  | +----v----+ |     |
|  | |esm.do     | |  | |esm.do   | |  | |esm.do   | |     |
|  | |Worker     | |  | |Worker   | |  | |Worker   | |     |
|  | +-----------+ |  | +---------+ |  | +---------+ |     |
|  +---------------+  +-------------+  +-------------+     |
|                                                           |
+-----------------------------------------------------------+
```

## Troubleshooting

### View Logs

```bash
# Stream logs
./deploy/digitalocean/deploy.sh logs

# Or using doctl
doctl apps logs <app-id> --follow

# View recent logs
doctl apps logs <app-id>
```

### Check Deployments

```bash
# List deployments
doctl apps list-deployments <app-id>

# Get deployment details
doctl apps get-deployment <app-id> <deployment-id>
```

### Common Issues

1. **Build failing**
   - Check build logs in the dashboard
   - Ensure all dependencies are in package.json
   - Verify TypeScript compilation succeeds locally

2. **Health check failing**
   - Ensure `/health` endpoint is implemented
   - Check that port 8787 is correctly exposed
   - Increase `initial_delay_seconds` if startup is slow

3. **Container crashes**
   - Check logs for errors
   - Verify environment variables are set correctly
   - Ensure memory limit is sufficient

4. **Slow cold starts**
   - Consider upgrading instance size
   - Enable auto-scaling to maintain warm instances
   - Optimize the Docker image

### SSH into Container

DigitalOcean App Platform doesn't provide direct SSH access. Use the console in the dashboard:

1. Go to App Platform > Your App
2. Click on the service
3. Use the "Console" tab

## Comparison with Other Platforms

| Feature | DO App Platform | Cloudflare Workers | Fly.io |
|---------|-----------------|-------------------|--------|
| Runtime | Docker/Miniflare | workerd | Docker/Miniflare |
| Regions | 9 regions | 300+ cities | 35+ regions |
| Cold starts | ~500-1000ms | ~0ms | ~50-100ms |
| Pricing | Container-based | Request-based | Machine-based |
| Auto-scaling | Yes (Pro) | Automatic | Yes |
| Custom domains | Yes | Yes | Yes |
| SSL/TLS | Automatic | Automatic | Automatic |

## Costs

Estimated monthly costs:

| Configuration | Cost |
|--------------|------|
| 1x basic-xxs (dev) | ~$5 |
| 1x basic-s (staging) | ~$20 |
| 2x professional-s (production) | ~$50 |
| 3x professional-s + auto-scaling | ~$75-150 |

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
docker build -f deploy/digitalocean/Dockerfile -t esm-do .
docker run -p 8787:8787 esm-do
```

## Resources

- [DigitalOcean App Platform Documentation](https://docs.digitalocean.com/products/app-platform/)
- [App Spec Reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
- [doctl CLI Reference](https://docs.digitalocean.com/reference/doctl/)
- [Miniflare Documentation](https://miniflare.dev/)
- [esm.do Repository](https://github.com/dot-do/esm)

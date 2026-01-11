# Fastly Compute@Edge Deployment for esm.do

This directory contains the configuration and scripts for deploying esm.do to Fastly's Compute@Edge platform.

## Overview

esm.do is an ESM module system for AI agents. This deployment uses [Fastly Compute@Edge](https://www.fastly.com/products/edge-compute) to run the worker at the edge, leveraging Fastly's global network of POPs (Points of Presence).

## Prerequisites

1. **Fastly CLI**: Install the Fastly CLI
   ```bash
   brew install fastly/tap/fastly
   # or
   npm install -g @fastly/cli
   ```

2. **Authentication**: Log in to Fastly
   ```bash
   fastly profile create
   ```

3. **Node.js**: Ensure Node.js 18+ is installed locally for building

## Quick Start

### Local Development

Run the local development server:

```bash
./deploy/fastly/deploy.sh serve
```

This will:
1. Build the Compute@Edge package
2. Start a local server at `http://localhost:7676`
3. Simulate the Fastly Compute environment locally

### Deploy to Staging

```bash
./deploy/fastly/deploy.sh deploy
```

This will:
1. Build the package
2. Deploy a new version (not activated)
3. Allow you to test before activation

### Deploy to Production

```bash
./deploy/fastly/deploy.sh production
```

This will:
1. Build the package
2. Deploy and activate immediately
3. Make the new version live

## Configuration

### fastly.toml

The main Fastly configuration file. Key settings:

| Setting | Description |
|---------|-------------|
| `name` | Service name (esm-do) |
| `service_id` | Fastly service ID (set via env or flag) |
| `language` | JavaScript |

### Environment Configuration

Configure via Fastly's Config Store (Dictionary):

| Key | Description | Default |
|-----|-------------|---------|
| `environment` | Runtime environment | production |
| `enable_unsafe_eval` | Enable dynamic code execution | true |
| `rate_limit_per_minute` | Rate limit per IP | 100 |

### Secrets

Store sensitive values in Fastly's Secret Store:

| Key | Description |
|-----|-------------|
| `ESM_API_KEY` | API authentication key |
| `ESM_AUTH_TOKEN` | Auth token for protected namespaces |

### Setting Up Stores

```bash
# Create config store
fastly config-store create --name config

# Add config values
fastly config-store-entry create --store-id <store-id> --key environment --value production
fastly config-store-entry create --store-id <store-id> --key enable_unsafe_eval --value true

# Create secret store
fastly secret-store create --name secrets

# Add secrets (interactive)
fastly secret-store-entry create --store-id <store-id> --name ESM_API_KEY
```

## Architecture

```
+------------------------------------------------------------+
|                    Fastly Edge Network                      |
|                                                             |
|  +----------+  +----------+  +----------+  +----------+    |
|  | Chicago  |  | London   |  | Tokyo    |  | Sydney   |    |
|  | (ORD)    |  | (LHR)    |  | (TYO)    |  | (SYD)    |    |
|  +----+-----+  +----+-----+  +----+-----+  +----+-----+    |
|       |             |             |             |          |
+-------|-------------|-------------|-------------|----------+
        |             |             |             |
        v             v             v             v
   +--------------------------------------------------+
   |           Compute@Edge Runtime (WASM)             |
   |  +--------------------------------------------+  |
   |  |             esm.do Worker                   |  |
   |  |  - Module storage                          |  |
   |  |  - Test execution                          |  |
   |  |  - Script runner                           |  |
   |  +--------------------------------------------+  |
   |                      |                           |
   |  +------------------+|+------------------+       |
   |  | KV Store (Cache) ||| Config Store     |       |
   |  +------------------+|+------------------+       |
   +--------------------------------------------------+
```

## Caching Strategy

The deployment uses Fastly's KV Store for caching:

| Content Type | Cache Strategy | TTL |
|-------------|----------------|-----|
| `.mjs` files | Cache with version | Immutable when versioned |
| `.d.ts` files | Cache with version | Immutable when versioned |
| `.bundle.mjs` | Cache with version | Immutable when versioned |
| JSON responses | No cache | - |
| POST responses | No cache | - |

## Rate Limiting

Rate limiting is implemented at the edge:

- **Read operations (GET)**: 500 requests/minute per IP
- **Write operations (POST/DELETE)**: 100 requests/minute per IP

## Comparison with Other Platforms

| Feature | Fastly Compute | Cloudflare Workers | Fly.io |
|---------|---------------|-------------------|--------|
| Runtime | WASM (js-compute) | workerd | Miniflare |
| Edge locations | 80+ POPs | 300+ cities | 35+ regions |
| Cold starts | <1ms | ~0ms | ~50-100ms |
| Max execution time | 120s | 30s (default) | Unlimited |
| Dynamic eval | Limited | Via binding | Full |
| KV Storage | KV Store | KV | External |
| Object Storage | Object Store | R2 | External |

## Troubleshooting

### View Logs

```bash
# Tail live logs
./deploy/fastly/deploy.sh logs

# Or directly
fastly log-tail
```

### Check Service Status

```bash
./deploy/fastly/deploy.sh status
```

### Rollback

```bash
./deploy/fastly/deploy.sh rollback
```

### Common Issues

1. **Build failing**
   - Check that all dependencies are in package.json
   - Verify TypeScript compilation: `npm run typecheck`
   - Check webpack output: `npm run build:dev`

2. **Dynamic code execution not working**
   - Enable `enable_unsafe_eval` in config store
   - Note: Full eval() support is limited in Compute@Edge

3. **KV Store not found**
   - Create the store: `fastly kv-store create --name module_cache`
   - Link to service in Fastly UI

4. **Authentication errors**
   - Re-authenticate: `fastly profile create`
   - Check token permissions

### Debug Mode

Build with source maps for debugging:

```bash
NODE_ENV=development npm run build
fastly compute serve
```

## Development

### Local Testing

```bash
# Run with hot reload
npm run serve

# Build only
npm run build

# Type check
npm run typecheck
```

### Project Structure

```
deploy/fastly/
├── fastly.toml         # Fastly service configuration
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── webpack.config.js   # Webpack bundler configuration
├── deploy.sh           # Deployment script
├── README.md           # This file
├── src/
│   └── main.ts         # Compute@Edge entry point
└── bin/                # Build output (generated)
    └── index.js
```

## Resources

- [Fastly Compute Documentation](https://developer.fastly.com/learning/compute/)
- [Fastly CLI Reference](https://developer.fastly.com/reference/cli/)
- [JavaScript SDK Reference](https://js-compute-reference-docs.edgecompute.app/)
- [esm.do Repository](https://github.com/dot-do/esm)

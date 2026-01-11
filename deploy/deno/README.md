# esm.do Deno Deploy Configuration

This directory contains the configuration and entry point for deploying esm.do to [Deno Deploy](https://deno.com/deploy).

## Overview

The Deno Deploy adapter runs the esm.do module system on Deno's edge runtime. It provides the same API as the Cloudflare Workers version but adapted for Deno's environment.

## Files

- `main.ts` - Main entry point that adapts the ESM worker for Deno
- `deno.json` - Deno configuration with tasks and compiler options
- `import_map.json` - Import map for dependencies
- `deploy.sh` - Deployment script

## Prerequisites

1. **Install Deno**
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

2. **Install deployctl**
   ```bash
   deno install -gArf jsr:@deno/deployctl
   ```

3. **Authenticate with Deno Deploy**
   ```bash
   deployctl login
   ```

## Local Development

Run the server locally:

```bash
# Using deno task
deno task dev

# Or directly
deno run --allow-net --allow-env --watch main.ts
```

The server will start on `http://localhost:8000` by default.

## Deployment

### Using the deploy script

```bash
# Deploy to production
./deploy.sh

# Deploy as preview
./deploy.sh --preview

# Dry run (check without deploying)
./deploy.sh --dry-run
```

### Using deno tasks

```bash
# Deploy to production
deno task deploy

# Deploy as preview
deno task deploy:preview
```

### Using deployctl directly

```bash
# Deploy to production
deployctl deploy --project=esm-do --prod main.ts

# Deploy as preview
deployctl deploy --project=esm-do main.ts
```

## CI/CD

For automated deployments, set the `DENO_DEPLOY_TOKEN` environment variable:

```yaml
# GitHub Actions example
- name: Deploy to Deno Deploy
  env:
    DENO_DEPLOY_TOKEN: ${{ secrets.DENO_DEPLOY_TOKEN }}
  run: |
    cd deploy/deno
    ./deploy.sh
```

## API Endpoints

The Deno Deploy version supports the same API endpoints as the Cloudflare Workers version:

### GET Routes
- `GET /:scope/:name` - Module info (JSON metadata)
- `GET /:scope/:name.d.ts` - TypeScript declaration file
- `GET /:scope/:name.mjs` - ESM module (JavaScript)
- `GET /:scope/:name.test.js` - Test file
- `GET /:scope/:name.script.js` - Script file
- `GET /:scope/:name@:version` - Specific version
- `GET /:scope/:name/deps` - Module dependencies
- `GET /:scope/:name/diff` - Diff between versions
- `GET /:scope/` - List modules in scope

### POST Routes
- `POST /:scope/:name` - Create or update module
- `POST /:scope/:name/test` - Run module tests
- `POST /:scope/:name/run` - Execute module script
- `POST /:scope/:name/revert` - Revert to previous version

### DELETE Routes
- `DELETE /:scope/:name` - Delete module

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8000` |
| `DENO_DEPLOY_TOKEN` | API token for CI/CD | - |
| `ESM_DO_PROJECT` | Deno Deploy project name | `esm-do` |

## Differences from Cloudflare Workers

1. **Dynamic Code Execution**: Deno has native `eval()` support, so no special binding is needed (unlike Cloudflare's `unsafe_eval` binding).

2. **Storage**: Uses the same in-memory GitxStorage. For persistent storage, connect to an external service.

3. **Edge Network**: Deno Deploy runs on its own global edge network, separate from Cloudflare's.

## Type Checking

```bash
deno task check
```

## Linting

```bash
deno task lint
```

## Formatting

```bash
deno task fmt
```

## Architecture

```
deploy/deno/
├── main.ts           # Self-contained worker implementation
├── deno.json         # Deno configuration
├── import_map.json   # Import mappings
├── deploy.sh         # Deployment script
└── README.md         # This file
```

The `main.ts` file is self-contained and includes:
- Storage layer (InMemoryGitxClient, WorkerGitxStorage)
- Test runner and script executor
- HTTP route handlers
- Rate limiting and CORS

This design allows for single-file deployment without bundling.

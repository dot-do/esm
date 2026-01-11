# Azure Functions Deployment for esm.do

This directory contains the Azure Functions deployment configuration for the esm.do ESM module system.

## Overview

The esm.do service can be deployed to Azure Functions as a serverless application. This deployment adapts the Cloudflare Workers-based API to Azure's HTTP trigger model.

## Architecture

```
Azure Functions
    |
    v
api/index.ts (HTTP Handler)
    |
    v
Request/Response Adapter
    |
    v
esm.do Worker (../../src/api/worker.ts)
    |
    v
GitxStorage (In-Memory or Azure Blob/CosmosDB)
```

## Prerequisites

- **Node.js 18+** - Required for Azure Functions v4
- **Azure CLI** - For deployment (`az` command)
- **Azure Functions Core Tools** - For local development and deployment

```bash
# Install Azure CLI
# macOS
brew install azure-cli

# Windows
winget install Microsoft.AzureCLI

# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4
```

## Local Development

1. **Install dependencies:**

```bash
cd deploy/azure
npm install
```

2. **Build the parent package:**

```bash
cd ../..
npm run build
```

3. **Build and start:**

```bash
cd deploy/azure
npm run dev
```

4. **Test the endpoints:**

```bash
# Get module info
curl http://localhost:7071/math/add

# Get ESM module
curl http://localhost:7071/math/add.mjs

# Get TypeScript types
curl http://localhost:7071/math/add.d.ts

# Run tests
curl -X POST http://localhost:7071/math/add/test

# Execute script
curl -X POST http://localhost:7071/math/add/run
```

## Deployment

### Quick Deploy

Deploy to an existing Azure Functions app:

```bash
./deploy.sh --app-name your-function-app
```

### Full Setup (Create Resources + Deploy)

Create all Azure resources and deploy:

```bash
./deploy.sh --create
```

### Custom Configuration

```bash
./deploy.sh \
  --create \
  --resource-group mygroup \
  --app-name myapp \
  --location westus2
```

### Manual Deployment

```bash
# Login to Azure
az login

# Build the project
npm run build

# Deploy
func azure functionapp publish <app-name>
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ESM_DO_ENABLE_UNSAFE_EVAL` | Enable dynamic code execution for tests/scripts | `true` |
| `ESM_DO_STORAGE_TYPE` | Storage backend (`memory`, `azure-blob`, `cosmosdb`) | `memory` |
| `ESM_DO_BASE_URL` | Base URL for the service | Auto-detected |
| `ESM_DO_RATE_LIMIT_READ` | Rate limit for read operations (per minute) | `500` |
| `ESM_DO_RATE_LIMIT_WRITE` | Rate limit for write operations (per minute) | `100` |

### App Settings

Configure these in the Azure Portal or via CLI:

```bash
az functionapp config appsettings set \
  --name <app-name> \
  --resource-group <resource-group> \
  --settings \
    ESM_DO_ENABLE_UNSAFE_EVAL=true \
    ESM_DO_STORAGE_TYPE=memory \
    NODE_ENV=production
```

## File Structure

```
deploy/azure/
  api/
    function.json     # HTTP trigger binding configuration
    index.ts          # Azure Functions handler (adapts Workers API)
  dist/               # Compiled TypeScript output
  host.json           # Azure Functions host configuration
  local.settings.json # Local development settings
  package.json        # Dependencies
  tsconfig.json       # TypeScript configuration
  deploy.sh           # Deployment script
  README.md           # This file
```

## API Endpoints

The Azure Functions deployment exposes the same API as the Cloudflare Workers version:

### Read Operations (GET)

| Endpoint | Description |
|----------|-------------|
| `GET /:scope/:name` | Module info (JSON metadata) |
| `GET /:scope/:name.d.ts` | TypeScript declaration file |
| `GET /:scope/:name.mjs` | ESM module (JavaScript) |
| `GET /:scope/:name.test.js` | Test file |
| `GET /:scope/:name.script.js` | Script file |
| `GET /:scope/:name@:version` | Specific version |
| `GET /:scope/` | List modules in scope |

### Write Operations (POST)

| Endpoint | Description |
|----------|-------------|
| `POST /:scope/:name` | Create or update module |
| `POST /:scope/:name/test` | Run module tests |
| `POST /:scope/:name/run` | Execute module script |
| `POST /:scope/:name/revert` | Revert to previous version |

### Delete Operations

| Endpoint | Description |
|----------|-------------|
| `DELETE /:scope/:name` | Delete module |

## Differences from Cloudflare Workers

1. **Runtime Environment**: Azure Functions runs on Node.js, not V8 isolates.

2. **Dynamic Code Execution**: Uses native `eval()` and `new Function()` instead of the `unsafe_eval` binding.

3. **Storage**: Defaults to in-memory storage. For production, consider Azure Blob Storage or CosmosDB.

4. **Rate Limiting**: Uses in-memory rate limiting. For production with multiple instances, use Azure API Management or Redis.

5. **Cold Starts**: Azure Functions has longer cold start times than Cloudflare Workers. Consider Premium or Dedicated plans for consistent performance.

## Production Considerations

### Storage Options

For production deployments, implement one of these storage backends:

1. **Azure Blob Storage** - Store modules as blobs
2. **Azure CosmosDB** - Full Git-like versioning
3. **Azure Table Storage** - Simple key-value storage

### Scaling

- **Consumption Plan**: Auto-scales, pay per execution
- **Premium Plan**: Pre-warmed instances, no cold starts
- **Dedicated Plan**: Fixed capacity, full control

### Security

1. Enable Azure AD authentication for protected namespaces
2. Use Azure Key Vault for secrets
3. Enable HTTPS only
4. Configure CORS appropriately

### Monitoring

```bash
# View live logs
func azure functionapp logstream <app-name>

# Enable Application Insights
az functionapp config appsettings set \
  --name <app-name> \
  --resource-group <resource-group> \
  --settings APPINSIGHTS_INSTRUMENTATIONKEY=<key>
```

## Troubleshooting

### Common Issues

**Error: Dynamic code execution is disabled**

Set the environment variable:
```bash
az functionapp config appsettings set \
  --name <app-name> \
  --resource-group <resource-group> \
  --settings ESM_DO_ENABLE_UNSAFE_EVAL=true
```

**Error: Module not found**

Ensure the parent esm.do package is built:
```bash
cd ../..
npm run build
```

**Cold start timeouts**

Consider upgrading to Premium plan for pre-warmed instances.

## License

MIT - See the root LICENSE file for details.

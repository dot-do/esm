# Netlify Edge Functions Deployment for esm.do

This directory contains the configuration and edge function for deploying esm.do to Netlify Edge Functions.

## Overview

esm.do is a Cloudflare Workers-based ESM module system. This deployment adapts the worker to run on Netlify Edge Functions using the Deno runtime, enabling deployment on Netlify's global edge network.

## Prerequisites

1. **Netlify CLI**: Install the Netlify CLI
   ```bash
   npm install -g netlify-cli
   ```

2. **Authentication**: Log in to Netlify
   ```bash
   netlify login
   ```

3. **Node.js**: Ensure Node.js 18+ is installed locally for building

## Quick Start

### Deploy

Run the full deployment:

```bash
./deploy/netlify/deploy.sh deploy
```

This will:
1. Check CLI installation and authentication
2. Create the site if it doesn't exist
3. Build the project
4. Deploy edge functions
5. Output the site URL

### Local Development

```bash
./deploy/netlify/deploy.sh dev
```

### Check Status

```bash
./deploy/netlify/deploy.sh status
```

## Files

| File | Description |
|------|-------------|
| `netlify.toml` | Netlify configuration (build, headers, redirects) |
| `netlify/edge-functions/esm.ts` | Main edge function handler |
| `netlify/edge-functions/manifest.json` | Edge function manifest |
| `import_map.json` | Deno import map for edge functions |
| `deploy.sh` | Deployment script |

## Configuration

### netlify.toml

The main Netlify configuration file. Key settings:

| Setting | Value | Description |
|---------|-------|-------------|
| `build.command` | `npm run build` | Build command |
| `build.publish` | `public` | Static files directory |
| `build.edge_functions` | `netlify/edge-functions` | Edge functions directory |

### Environment Variables

Set in Netlify dashboard or via CLI:

| Variable | Description | Secret? |
|----------|-------------|---------|
| `ESM_API_KEY` | API authentication key | Yes |
| `ESM_STORAGE_KEY` | Storage encryption key | Yes |
| `ESM_AUTH_TOKEN` | Auth token for protected namespaces | Yes |

### Setting Environment Variables

```bash
# Via CLI
netlify env:set ESM_API_KEY your-api-key

# Via deployment script
ESM_API_KEY=your-key ./deploy/netlify/deploy.sh env
```

## Edge Function

The edge function (`netlify/edge-functions/esm.ts`) implements the full esm.do API:

### Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API information |
| GET | `/health` | Health check |
| GET | `/:scope/:name` | Get module info |
| GET | `/:scope/:name.mjs` | Get module code (JavaScript) |
| GET | `/:scope/:name.d.ts` | Get type definitions |
| GET | `/:scope/:name@:version` | Get specific version |
| POST | `/:scope/:name` | Create or update module |
| POST | `/:scope/:name/test` | Run module tests |
| POST | `/:scope/:name/run` | Execute module script |
| DELETE | `/:scope/:name` | Delete module |

### Example Usage

```bash
# Get module info
curl https://esm-do.netlify.app/@math/add

# Get module code
curl https://esm-do.netlify.app/@math/add.mjs

# Create a module
curl -X POST https://esm-do.netlify.app/@myapp/hello \
  -H "Content-Type: application/json" \
  -d '{
    "types": "export declare function hello(name: string): string;",
    "module": "export function hello(name) { return `Hello, ${name}!`; }",
    "tests": "describe(\"hello\", () => { it(\"greets\", () => { expect(hello(\"World\")).toBe(\"Hello, World!\"); }); });",
    "script": "return hello(\"esm.do\");"
  }'

# Run tests
curl -X POST https://esm-do.netlify.app/@math/add/test

# Execute script
curl -X POST https://esm-do.netlify.app/@math/add/run
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Netlify Edge Network                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   US East    │   Europe     │   Asia       │   Other        │
│   (iad)      │   (ams)      │   (sin)      │   regions      │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Edge Function (Deno)                       │ │
│  │  ┌────────────────────────────────────────────────┐    │ │
│  │  │           esm.do Edge Handler                   │    │ │
│  │  │  - In-memory storage                            │    │ │
│  │  │  - Test execution (describe/it/expect)          │    │ │
│  │  │  - Script runner                                │    │ │
│  │  │  - CORS handling                                │    │ │
│  │  └────────────────────────────────────────────────┘    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Comparison with Cloudflare Workers

| Feature | Cloudflare Workers | Netlify Edge |
|---------|-------------------|--------------|
| Runtime | workerd | Deno |
| Edge locations | 300+ cities | 100+ locations |
| Cold starts | ~0ms | ~5-50ms |
| Pricing | Request-based | Included in plan |
| Eval support | Via unsafe_eval | Native (Deno) |
| TypeScript | Via build | Native |

## Troubleshooting

### View Logs

```bash
# Via CLI
netlify logs:function esm

# Or via Netlify dashboard
# Go to: Site > Functions > Edge Functions > esm > Logs
```

### Common Issues

1. **Edge function not found**
   - Ensure `netlify/edge-functions/esm.ts` exists
   - Check `netlify.toml` configuration
   - Run `netlify deploy --prod`

2. **CORS errors**
   - Headers are configured in `netlify.toml`
   - Edge function also sets CORS headers
   - Check browser console for specific errors

3. **Build errors**
   - Ensure Node.js 18+ is installed
   - Run `npm install` in project root
   - Check TypeScript compilation: `npm run build`

4. **Environment variables not working**
   - Set via dashboard or CLI: `netlify env:set KEY value`
   - Redeploy after setting: `netlify deploy --prod`
   - Check current values: `netlify env:list`

## Development

### Local Testing

```bash
# Start Netlify dev server
./deploy/netlify/deploy.sh dev

# Test endpoints
curl http://localhost:8888/@math/add
curl http://localhost:8888/health
```

### Testing Edge Function

```bash
# Run with Netlify CLI
cd deploy/netlify
netlify dev

# Or use Deno directly
deno run --allow-net netlify/edge-functions/esm.ts
```

## Resources

- [Netlify Edge Functions Documentation](https://docs.netlify.com/edge-functions/overview/)
- [Deno Documentation](https://deno.land/manual)
- [esm.do Repository](https://github.com/dot-do/esm)
- [Netlify CLI Reference](https://docs.netlify.com/cli/get-started/)

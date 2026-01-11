# esm.do Bun Runtime

This directory contains configuration for running esm.do with [Bun](https://bun.sh), a fast all-in-one JavaScript runtime.

## Prerequisites

Install Bun:

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (via WSL)
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

## Quick Start

From the project root:

```bash
# Install dependencies
bun install

# Development with hot reload
bun run bun:dev

# Or directly:
bun run --hot deploy/bun/server.ts
```

## Available Commands

### Development

```bash
# Start dev server with hot reload
bun run bun:dev

# Or with explicit flags
bun run --hot deploy/bun/server.ts
```

### Production Build

```bash
# Build for production
bun run bun:build

# Or directly:
bun run deploy/bun/build.ts
```

### Running Production

```bash
# After building
NODE_ENV=production bun run deploy/bun/server.ts
```

## Docker Deployment

Build and run with Docker:

```bash
# Build the image
docker build -f deploy/bun/Dockerfile -t esm-do-bun .

# Run the container
docker run -p 8787:8787 esm-do-bun

# Run with environment variables
docker run -p 8787:8787 \
  -e NODE_ENV=production \
  -e PORT=8787 \
  esm-do-bun
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Environment mode |

## Configuration Files

- `server.ts` - Bun HTTP server entry point using `Bun.serve()`
- `bunfig.toml` - Bun configuration (build, test, install settings)
- `build.ts` - Production build script using `Bun.build()`
- `Dockerfile` - Multi-stage Docker build optimized for Bun

## Performance Benefits

Bun provides several performance advantages:

1. **Fast Startup** - Bun starts faster than Node.js
2. **Native TypeScript** - No transpilation step needed
3. **Built-in Bundler** - `Bun.build()` is extremely fast
4. **Hot Reload** - `--hot` flag for instant updates
5. **SQLite Support** - Native SQLite for future storage needs
6. **HTTP/2** - Native HTTP/2 support in `Bun.serve()`

## Differences from Cloudflare Workers

The Bun adapter emulates the Cloudflare Workers environment:

| Feature | Cloudflare Workers | Bun Adapter |
|---------|-------------------|-------------|
| `unsafe_eval` binding | Required | Emulated via native `eval()` |
| Edge locations | Global | Single server |
| Cold starts | Minimal | None (always running) |
| Request limits | 100k/day (free) | Unlimited |

## Comparison with Other Deploy Options

| Feature | Bun | Node.js | Cloudflare Workers |
|---------|-----|---------|-------------------|
| Cold Start | Fast | Medium | Fastest |
| TypeScript | Native | Transpile | Transpile |
| Bundle Size | Small | Medium | Smallest |
| Local Dev | Easy | Easy | Miniflare needed |

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8787
lsof -i :8787

# Kill the process
kill -9 <PID>
```

### Module Resolution Issues

Ensure `tsconfig.json` has compatible settings:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### Hot Reload Not Working

Make sure you're using the `--hot` flag:

```bash
bun run --hot deploy/bun/server.ts
```

## Resources

- [Bun Documentation](https://bun.sh/docs)
- [Bun.serve() API](https://bun.sh/docs/api/http)
- [Bun.build() API](https://bun.sh/docs/bundler)
- [bunfig.toml Reference](https://bun.sh/docs/runtime/bunfig)

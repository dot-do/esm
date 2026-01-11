# ESM.do Docker Compose Setup

Docker Compose configuration for local development and production deployment of the esm.do Cloudflare Workers-based ESM module system.

## Overview

This setup uses [Miniflare](https://miniflare.dev/) (via Wrangler) to emulate Cloudflare Workers locally, along with optional Redis and PostgreSQL services for caching and storage.

## Quick Start

### Prerequisites

- Docker and Docker Compose v2
- Make (optional, for convenience commands)

### Development

```bash
# Copy environment file
cp .env.example .env

# Start development environment with hot reload
make dev

# Or without Make:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

The worker will be available at `http://localhost:8787`.

### Production

```bash
# Configure .env with production settings
cp .env.example .env
# Edit .env with production values

# Start production environment
make prod

# Or without Make:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Services

| Service | Description | Port |
|---------|-------------|------|
| esm-do | Main worker service (Miniflare) | 8787 |
| redis | Redis cache | 6379 |
| postgres | PostgreSQL database | 5432 |

## File Structure

```
deploy/docker-compose/
├── docker-compose.yml      # Base configuration
├── docker-compose.dev.yml  # Development overrides
├── docker-compose.prod.yml # Production overrides
├── Dockerfile              # Base Dockerfile
├── Dockerfile.dev          # Development Dockerfile
├── Dockerfile.prod         # Production Dockerfile (multi-stage)
├── .env.example            # Example environment variables
├── Makefile                # Convenience commands
└── README.md               # This file
```

## Make Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development environment with hot reload |
| `make dev-build` | Build and start development environment |
| `make prod` | Start production environment |
| `make prod-build` | Build and start production environment |
| `make build` | Build all Docker images |
| `make logs` | View logs (follow mode) |
| `make logs-esm` | View esm-do service logs only |
| `make ps` | Show running containers |
| `make stop` | Stop all services |
| `make restart` | Restart all services |
| `make clean` | Stop and remove containers, networks, volumes |
| `make shell` | Open shell in esm-do container |
| `make test` | Run tests in container |
| `make health` | Check service health status |
| `make db-shell` | Open PostgreSQL shell |
| `make redis-cli` | Open Redis CLI |

## Configuration

### Environment Variables

See `.env.example` for all available configuration options. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `ESM_PORT` | 8787 | Worker port |
| `DEBUG_PORT` | 9229 | Node.js debug port (dev only) |
| `REDIS_PORT` | 6379 | Redis port |
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `POSTGRES_USER` | esm | Database user |
| `POSTGRES_PASSWORD` | esm | Database password |
| `POSTGRES_DB` | esm | Database name |

### Development Features

The development configuration includes:

- Hot reload via volume mounts
- Node.js debug port (9229) for debugging
- Faster health checks
- No data persistence (faster restarts)
- Debug logging enabled

### Production Features

The production configuration includes:

- Multi-stage Docker build for minimal image size
- Non-root user for security
- Resource limits (CPU/memory)
- Persistent data volumes
- JSON file logging with rotation
- Stricter health checks
- Automatic restart policies

## Health Checks

All services have health checks configured:

```bash
# Check all services
make health

# Or manually:
curl http://localhost:8787/health
```

## Debugging

### Attach Debugger (Development)

The development configuration exposes port 9229 for Node.js debugging.

**VS Code launch.json:**

```json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to Docker",
  "port": 9229,
  "address": "localhost",
  "localRoot": "${workspaceFolder}",
  "remoteRoot": "/app"
}
```

### View Logs

```bash
# All services
make logs

# ESM worker only
make logs-esm

# Specific service
docker compose logs -f esm-do
```

### Access Container Shell

```bash
make shell
```

## Troubleshooting

### Container won't start

1. Check logs: `make logs`
2. Verify .env file exists: `ls -la .env`
3. Check port conflicts: `lsof -i :8787`

### Health check failing

1. Wait for startup period (10-30 seconds)
2. Check if `/health` endpoint exists in worker
3. Verify network connectivity between containers

### Hot reload not working

1. Ensure volume mounts are correct in docker-compose.dev.yml
2. Check file permissions
3. Verify wrangler is running in watch mode

### Build failures

1. Clear Docker cache: `docker compose build --no-cache`
2. Check Node.js version compatibility
3. Verify pnpm-lock.yaml or package-lock.json exists

## Architecture

```
                                    +------------------+
                                    |                  |
                                    |  Host Machine    |
                                    |                  |
                                    +--------+---------+
                                             |
                              localhost:8787 |
                                             v
+-------------------------------------------------------------------------+
|  Docker Network (esm-network)                                           |
|                                                                         |
|  +----------------+    +----------------+    +------------------+       |
|  |                |    |                |    |                  |       |
|  |   esm-do       |<-->|   redis        |    |   postgres       |       |
|  |   (Worker)     |    |   (Cache)      |    |   (Storage)      |       |
|  |   :8787        |    |   :6379        |    |   :5432          |       |
|  |                |    |                |    |                  |       |
|  +----------------+    +----------------+    +------------------+       |
|                                                                         |
+-------------------------------------------------------------------------+
```

## Notes

- The worker runs in local mode using Wrangler's `--local` flag
- For actual Cloudflare deployment, use `wrangler deploy` directly
- Redis and PostgreSQL are optional but recommended for full functionality
- The unsafe_eval binding is required for dynamic code execution

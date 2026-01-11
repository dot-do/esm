# Docker Deployment

> Deploy esm.do using Docker containers for maximum flexibility and portability across any infrastructure.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (2.0+)
- 512MB+ available memory
- Git (for cloning the repository)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/dot-do/esm.git
cd esm

# Start with Docker Compose
docker compose -f deploy/docker-compose/docker-compose.yml up -d

# Check status
docker compose -f deploy/docker-compose/docker-compose.yml ps

# View logs
docker compose -f deploy/docker-compose/docker-compose.yml logs -f esm-do
```

Access the service at `http://localhost:8787`.

## Docker Images

### Official Images

```bash
# Pull the latest image
docker pull ghcr.io/dot-do/esm:latest

# Pull a specific version
docker pull ghcr.io/dot-do/esm:0.0.1

# Pull development image
docker pull ghcr.io/dot-do/esm:dev
```

### Building Locally

```bash
# Build production image
docker build -t esm-do:latest .

# Build with specific version
docker build -t esm-do:0.0.1 \
  --build-arg VERSION=0.0.1 \
  --build-arg COMMIT_SHA=$(git rev-parse HEAD) \
  .

# Build development image
docker build -t esm-do:dev -f deploy/docker/Dockerfile.dev .
```

## Dockerfile Reference

The production Dockerfile (`Dockerfile`):

```dockerfile
# syntax=docker/dockerfile:1

# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the project
RUN pnpm run build

# Production stage
FROM node:22-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Set build arguments
ARG VERSION=dev
ARG COMMIT_SHA=unknown

ENV NODE_ENV=production
ENV VERSION=${VERSION}
ENV COMMIT_SHA=${COMMIT_SHA}

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/dist ./core/dist
COPY --from=builder /app/bin ./bin

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

USER nodejs

# Expose default port
EXPOSE 8787

# Default command
CMD ["node", "dist/index.js"]
```

## Local Development

### Development with Hot Reload

```bash
# Start development environment
docker compose -f deploy/docker-compose/docker-compose.dev.yml up

# Rebuild after changes
docker compose -f deploy/docker-compose/docker-compose.dev.yml up --build
```

### Development Docker Compose

```yaml
# deploy/docker-compose/docker-compose.dev.yml
version: "3.8"

services:
  esm-do:
    build:
      context: ../..
      dockerfile: deploy/docker-compose/Dockerfile.dev
    container_name: esm-do-dev
    ports:
      - "8787:8787"
    volumes:
      # Mount source code for hot reload
      - ../../src:/app/src:ro
      - ../../core:/app/core:ro
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
    command: npm run dev
    restart: unless-stopped
```

### Interactive Development Shell

```bash
# Start a shell in the container
docker run -it --rm \
  -v $(pwd):/app \
  -w /app \
  node:22-alpine sh

# Run commands inside container
npm install
npm test
npm run build
```

## Production Deployment

### Production Docker Compose

```yaml
# deploy/docker-compose/docker-compose.prod.yml
version: "3.8"

services:
  esm-do:
    image: ghcr.io/dot-do/esm:latest
    container_name: esm-do
    ports:
      - "8787:8787"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://esm:${POSTGRES_PASSWORD}@postgres:5432/esm
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    networks:
      - esm-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: esm-redis
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-redis}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    networks:
      - esm-network

  postgres:
    image: postgres:16-alpine
    container_name: esm-postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=esm
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=esm
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U esm -d esm"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
    networks:
      - esm-network

  nginx:
    image: nginx:alpine
    container_name: esm-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - esm-do
    networks:
      - esm-network

networks:
  esm-network:
    driver: bridge

volumes:
  redis-data:
  postgres-data:
```

### Environment Variables File

Create `.env` file:

```bash
# .env
NODE_ENV=production
LOG_LEVEL=info

# Database
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_USER=esm
POSTGRES_DB=esm

# Redis
REDIS_PASSWORD=your-redis-password-here

# Application
ESM_MAX_EXECUTION_TIME=30000
ESM_MAX_BODY_SIZE=10mb
CORS_ORIGINS=https://esm.do
```

### Nginx Configuration

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream esm_backend {
        least_conn;
        server esm-do:8787;
    }

    server {
        listen 80;
        server_name esm.do;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name esm.do;

        ssl_certificate /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

        location / {
            proxy_pass http://esm_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        location /health {
            proxy_pass http://esm_backend/health;
            access_log off;
        }
    }
}
```

## Docker Swarm Deployment

### Initialize Swarm

```bash
# Initialize Docker Swarm
docker swarm init

# Deploy stack
docker stack deploy -c deploy/docker-compose/docker-compose.prod.yml esm

# View services
docker service ls

# Scale service
docker service scale esm_esm-do=5

# View logs
docker service logs -f esm_esm-do
```

### Swarm Stack Configuration

```yaml
# docker-stack.yml
version: "3.8"

services:
  esm-do:
    image: ghcr.io/dot-do/esm:latest
    deploy:
      mode: replicated
      replicas: 3
      placement:
        constraints:
          - node.role == worker
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        order: start-first
      rollback_config:
        parallelism: 1
        delay: 10s
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
    ports:
      - target: 8787
        published: 8787
        mode: ingress
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - esm-network
    secrets:
      - db_password
      - redis_password

secrets:
  db_password:
    external: true
  redis_password:
    external: true

networks:
  esm-network:
    driver: overlay
    attachable: true
```

## Multi-Stage Builds

### Optimized Production Build

```dockerfile
# Dockerfile.optimized
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/core/node_modules ./core/node_modules
COPY . .
RUN corepack enable && pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/dist ./core/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 8787
CMD ["node", "dist/index.js"]
```

## Container Registry

### GitHub Container Registry

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Build and tag
docker build -t ghcr.io/dot-do/esm:latest .
docker tag ghcr.io/dot-do/esm:latest ghcr.io/dot-do/esm:$(git rev-parse --short HEAD)

# Push
docker push ghcr.io/dot-do/esm:latest
docker push ghcr.io/dot-do/esm:$(git rev-parse --short HEAD)
```

### Docker Hub

```bash
# Login
docker login

# Build and push
docker build -t dotdo/esm:latest .
docker push dotdo/esm:latest
```

## Health Checks

### Docker Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8787/health || exit 1
```

### Custom Health Check Script

```bash
#!/bin/sh
# healthcheck.sh

set -e

HEALTH_URL="${HEALTH_URL:-http://localhost:8787/health}"
TIMEOUT="${HEALTH_TIMEOUT:-5}"

response=$(curl -sf -m $TIMEOUT "$HEALTH_URL" 2>&1)

if [ $? -ne 0 ]; then
    echo "Health check failed: $response"
    exit 1
fi

status=$(echo "$response" | jq -r '.status' 2>/dev/null)

if [ "$status" != "healthy" ]; then
    echo "Service unhealthy: $status"
    exit 1
fi

echo "Service healthy"
exit 0
```

## Troubleshooting

### Common Issues

#### 1. Container Won't Start

```bash
# Check logs
docker logs esm-do-worker

# Check container status
docker inspect esm-do-worker --format='{{.State.Status}}'

# Check exit code
docker inspect esm-do-worker --format='{{.State.ExitCode}}'
```

#### 2. Out of Memory

```bash
# Check memory usage
docker stats esm-do-worker

# Increase memory limit
docker update --memory 1g esm-do-worker
```

#### 3. Network Issues

```bash
# List networks
docker network ls

# Inspect network
docker network inspect esm-network

# Test connectivity
docker exec esm-do-worker ping redis
```

#### 4. Volume Permission Issues

```bash
# Check volume permissions
docker exec esm-do-worker ls -la /app

# Fix permissions
docker exec -u root esm-do-worker chown -R nodejs:nodejs /app
```

### Debug Mode

```bash
# Run with debug logging
docker run -it --rm \
  -e LOG_LEVEL=debug \
  -e NODE_OPTIONS="--inspect=0.0.0.0:9229" \
  -p 8787:8787 \
  -p 9229:9229 \
  ghcr.io/dot-do/esm:latest

# Attach to running container
docker exec -it esm-do-worker sh

# View real-time logs
docker logs -f --tail 100 esm-do-worker
```

## Performance Tuning

### Container Resources

```yaml
# Recommended production settings
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 1G
    reservations:
      cpus: '0.5'
      memory: 256M
```

### Node.js Optimization

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size"
```

### Docker Daemon Configuration

```json
// /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 65536
    }
  }
}
```

## Security Best Practices

1. **Run as non-root user**
2. **Use read-only root filesystem**
3. **Drop all capabilities**
4. **Scan images for vulnerabilities**
5. **Use secrets for sensitive data**

```yaml
services:
  esm-do:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
```

## Next Steps

1. Set up [Kubernetes](./kubernetes.md) for orchestration
2. Configure [Monitoring](./monitoring.md) for observability
3. Implement CI/CD pipelines for automated builds
4. Review security scanning and image hardening

## Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

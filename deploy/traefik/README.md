# Traefik Reverse Proxy Configuration for esm.do

This directory contains the Traefik v3.0 reverse proxy configuration for esm.do with automatic TLS, rate limiting, security headers, and Docker service discovery.

## Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    Traefik                          │
Internet ──────────>│  :80 (redirect) ──> :443 (HTTPS)                   │
                    │                         │                           │
                    │  ┌──────────────────────┼───────────────────────┐  │
                    │  │                      ▼                       │  │
                    │  │  ┌─────────────┐  ┌─────────────────────┐   │  │
                    │  │  │ Rate Limit  │  │ Security Headers    │   │  │
                    │  │  └──────┬──────┘  └──────────┬──────────┘   │  │
                    │  │         │                    │              │  │
                    │  │         ▼                    ▼              │  │
                    │  │      ┌──────────────────────────┐          │  │
                    │  │      │      Compression         │          │  │
                    │  │      └────────────┬─────────────┘          │  │
                    │  │                   │                        │  │
                    │  └───────────────────┼────────────────────────┘  │
                    └──────────────────────┼───────────────────────────┘
                                           │
                    ┌──────────────────────┼───────────────────────────┐
                    │       Backend Network│(internal)                 │
                    │                      ▼                           │
                    │              ┌───────────────┐                   │
                    │              │   esm-do      │                   │
                    │              │   :8787       │                   │
                    │              └───────┬───────┘                   │
                    │                      │                           │
                    │         ┌────────────┴────────────┐              │
                    │         ▼                         ▼              │
                    │  ┌─────────────┐          ┌─────────────┐       │
                    │  │   Redis     │          │  PostgreSQL │       │
                    │  │   :6379     │          │   :5432     │       │
                    │  └─────────────┘          └─────────────┘       │
                    └──────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose v2+
- Domain pointing to your server (esm.do, traefik.esm.do)
- Ports 80 and 443 available

### 1. Configure Environment

```bash
# Copy example environment (create if needed)
cp .env.example .env

# Edit environment variables
nano .env
```

Required environment variables:
```bash
# PostgreSQL
POSTGRES_USER=esm
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=esm

# Node environment
NODE_ENV=production

# Optional: Cloudflare DNS challenge
# CF_API_EMAIL=your-email@example.com
# CF_DNS_API_TOKEN=your-dns-api-token
```

### 2. Update Dashboard Authentication

Generate a new password hash for the Traefik dashboard:

```bash
# Install htpasswd if needed
# Ubuntu/Debian: apt-get install apache2-utils
# macOS: brew install httpd

# Generate password hash
htpasswd -nb admin your-secure-password
```

Update `dynamic/esm-do.yml` with the generated hash:

```yaml
middlewares:
  dashboard-auth:
    basicAuth:
      users:
        - "admin:$apr1$..."  # Your generated hash
```

### 3. Start Services

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Start with monitoring (Prometheus)
docker compose --profile monitoring up -d
```

### 4. Verify Deployment

```bash
# Check Traefik is running
curl -I http://localhost:80  # Should redirect to HTTPS

# Check service health
curl https://esm.do/health

# Access dashboard (after DNS setup)
open https://traefik.esm.do
```

## Configuration Files

### `traefik.yml` - Static Configuration

Core Traefik settings that require restart to change:

- **Entrypoints**: HTTP (:80), HTTPS (:443), Metrics (:8082)
- **Providers**: Docker (automatic discovery), File (dynamic config)
- **Certificate Resolvers**: Let's Encrypt production and staging
- **Logging**: JSON format with access logs
- **Metrics**: Prometheus endpoint

### `dynamic/esm-do.yml` - Dynamic Configuration

Runtime configuration that hot-reloads:

- **Routers**: URL routing rules for different paths
- **Services**: Backend service definitions
- **Middlewares**: Request/response processing
- **TLS Options**: Cipher suites and protocol versions

## Features

### Automatic TLS Certificates

Traefik automatically obtains and renews Let's Encrypt certificates:

```yaml
# Using HTTP challenge (default)
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@esm.do
      httpChallenge:
        entryPoint: http
```

For wildcard certificates, enable DNS challenge:

```yaml
# In traefik.yml
dnsChallenge:
  provider: cloudflare
  delayBeforeCheck: 10s

# Set environment variables
CF_API_EMAIL=your-email@example.com
CF_DNS_API_TOKEN=your-token
```

### Rate Limiting

Two tiers of rate limiting:

| Route | Rate | Burst | Period |
|-------|------|-------|--------|
| General | 100 req | 200 | 1 min |
| API | 60 req | 100 | 1 min |

Rate limiting excludes internal IPs (10.x, 172.16.x, 192.168.x).

### Security Headers

All responses include security headers:

- **HSTS**: 1 year, includeSubDomains, preload
- **X-Frame-Options**: DENY
- **X-Content-Type-Options**: nosniff
- **X-XSS-Protection**: 1; mode=block
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Content-Security-Policy**: Configured for esm.do

### Compression

Automatic gzip/brotli compression for responses > 1KB:

- Excludes text/event-stream (SSE)
- Applies to JSON, JavaScript, CSS, HTML

### Health Checks

Backend health checks every 10 seconds:

```yaml
healthCheck:
  path: /health
  interval: 10s
  timeout: 5s
```

## Routers

| Router | Host | Path | Priority | Middlewares |
|--------|------|------|----------|-------------|
| esm-do | esm.do, www.esm.do | / | default | security, rate-limit, compress |
| esm-do-api | esm.do | /api/* | 100 | security, api-rate-limit, cors, compress |
| esm-do-modules | esm.do | /* | 50 | security, rate-limit, compress, cache |
| esm-do-health | esm.do | /health | 200 | security |
| dashboard | traefik.esm.do | / | default | auth, security |

## Scaling

### Horizontal Scaling

To run multiple esm.do instances:

```bash
docker compose up -d --scale esm-do=3
```

Traefik automatically load balances across all instances.

### Resource Limits

Add resource limits to docker-compose.yml:

```yaml
services:
  esm-do:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Monitoring

### Enable Prometheus Stack

```bash
docker compose --profile monitoring up -d
```

Access Prometheus at https://prometheus.esm.do (requires dashboard auth).

### Metrics Endpoint

Traefik exposes Prometheus metrics at `:8082/metrics`:

```bash
curl http://localhost:8082/metrics
```

### Key Metrics

- `traefik_entrypoint_requests_total` - Total requests per entrypoint
- `traefik_router_requests_total` - Requests per router
- `traefik_service_requests_total` - Requests per service
- `traefik_service_request_duration_seconds` - Request latency histogram

## Troubleshooting

### Certificate Issues

```bash
# Check ACME account
docker exec traefik cat /letsencrypt/acme.json | jq

# Use staging for testing
# Edit traefik.yml: caServer: https://acme-staging-v02.api.letsencrypt.org/directory

# Clear certificates and retry
docker volume rm esm-letsencrypt
docker compose up -d traefik
```

### Connection Refused

```bash
# Check Traefik is running
docker compose ps

# Check Traefik logs
docker compose logs traefik

# Verify network connectivity
docker exec traefik ping esm-do
```

### Rate Limit Debugging

```bash
# Check current rate limit state
docker compose logs traefik | grep rate

# Temporarily increase limits in dynamic/esm-do.yml
middlewares:
  rate-limit:
    rateLimit:
      average: 1000
      burst: 2000
```

### Service Not Discovered

```bash
# Check Docker labels are correct
docker inspect esm-do | jq '.[0].Config.Labels'

# Verify network membership
docker network inspect traefik-network

# Check Traefik can see the service
curl http://localhost:8080/api/http/services
```

## Production Checklist

- [ ] Change dashboard password in `dynamic/esm-do.yml`
- [ ] Set secure PostgreSQL password in `.env`
- [ ] Configure DNS records for esm.do, traefik.esm.do
- [ ] Remove staging certificate resolver references
- [ ] Enable Cloudflare DNS challenge for wildcards (optional)
- [ ] Set up log rotation
- [ ] Configure firewall rules
- [ ] Enable monitoring profile
- [ ] Set resource limits
- [ ] Configure backup for volumes

## Useful Commands

```bash
# Restart Traefik (reload static config)
docker compose restart traefik

# Force certificate renewal
docker exec traefik traefik certificate renew --domains=esm.do

# View active routers
curl -s http://localhost:8082/api/http/routers | jq

# View active services
curl -s http://localhost:8082/api/http/services | jq

# Check Traefik health
docker exec traefik traefik healthcheck

# Follow all logs
docker compose logs -f

# Clean up unused resources
docker system prune -f
```

## License

MIT

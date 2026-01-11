# Caddy Reverse Proxy for esm.do

High-performance reverse proxy configuration using [Caddy](https://caddyserver.com/) with automatic HTTPS, compression, security headers, and rate limiting.

## Features

- **Automatic HTTPS** - Let's Encrypt certificates with auto-renewal
- **HTTP/3 Support** - Modern QUIC protocol for improved performance
- **Compression** - gzip and zstd compression for responses
- **Security Headers** - HSTS, X-Frame-Options, CSP, and more
- **Rate Limiting** - Protection against abuse (requires caddy-ratelimit plugin)
- **Health Checks** - Automatic upstream health monitoring
- **Logging** - Structured JSON logging with rotation
- **Metrics** - Prometheus metrics endpoint

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Domain pointing to your server (for production HTTPS)

### Development

```bash
# Start with local/self-signed certificates
docker compose up -d

# View logs
docker compose logs -f caddy
```

### Production

```bash
# Set your email for Let's Encrypt notifications
export ACME_EMAIL=your-email@example.com

# Start services
docker compose up -d

# Verify certificates
docker compose exec caddy caddy list-certs
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACME_EMAIL` | `admin@esm.do` | Email for Let's Encrypt notifications |
| `NODE_ENV` | `production` | Application environment |
| `LOG_LEVEL` | `info` | Logging verbosity |

### Caddyfile Structure

```
Caddyfile
|-- Global options (TLS, admin, logging)
|-- Snippets (reusable configurations)
|   |-- security_headers
|   |-- compression
|   |-- logging
|-- Site blocks
    |-- esm.do (production)
    |-- localhost (development)
    |-- :9999 (metrics)
```

## Architecture

```
                    +----------------+
                    |    Internet    |
                    +-------+--------+
                            |
                            v
                    +-------+--------+
                    |     Caddy      |
                    |  (Port 80/443) |
                    +-------+--------+
                            |
              +-------------+-------------+
              |                           |
              v                           v
    +---------+----------+     +----------+---------+
    |    esm-do worker   |     |       Redis        |
    |    (Port 8787)     |     |    (Port 6379)     |
    +--------------------+     +--------------------+
```

## Usage

### Start Services

```bash
# Start all services
docker compose up -d

# Start with Redis cache
docker compose --profile with-cache up -d

# View status
docker compose ps
```

### Logs

```bash
# All logs
docker compose logs -f

# Caddy only
docker compose logs -f caddy

# Access logs
docker compose exec caddy cat /var/log/caddy/access.log | jq .
```

### Reload Configuration

```bash
# Reload Caddyfile without downtime
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

# Validate configuration
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
```

### View Certificates

```bash
# List certificates
docker compose exec caddy caddy list-certs

# Certificate details
docker compose exec caddy caddy cert esm.do
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Main application |
| `/health` | Health check (bypasses rate limiting) |
| `/api/*` | API endpoints (stricter rate limiting) |
| `:9999/metrics` | Prometheus metrics (internal) |
| `:9999/health` | Caddy health check |

## Security

### Headers

The configuration includes these security headers:

- `Strict-Transport-Security` - HSTS with 1-year max-age
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` - Restrictive feature policy

### TLS Configuration

- TLS 1.2 and 1.3 only
- Strong cipher suites
- OCSP stapling enabled

### Rate Limiting

Default limits (configurable in Caddyfile):

- Global: 100 requests/minute per IP
- API: 60 requests/minute per IP

## Plugins

The custom Dockerfile includes these Caddy plugins:

| Plugin | Description |
|--------|-------------|
| `caddy-ratelimit` | Rate limiting by IP, path, or headers |
| `transform-encoder` | Log transformation and formatting |
| `caddy-dns/cloudflare` | DNS challenge for Cloudflare domains |
| `caddy-security` | Additional security features |

## Monitoring

### Prometheus Metrics

Metrics are available at `http://localhost:9999/metrics`:

```bash
# Scrape metrics
curl http://localhost:9999/metrics
```

### Health Checks

```bash
# Caddy health
curl http://localhost:9999/health

# Application health
curl https://esm.do/health
```

## Troubleshooting

### Certificate Issues

```bash
# Check ACME account
docker compose exec caddy caddy list-certs

# Force certificate renewal
docker compose exec caddy caddy reload --force

# View Caddy logs for ACME errors
docker compose logs caddy | grep -i acme
```

### Connection Issues

```bash
# Test upstream connectivity
docker compose exec caddy wget -qO- http://esm-do:8787/health

# Check DNS resolution
docker compose exec caddy nslookup esm-do

# View network
docker network inspect caddy_esm-network
```

### Performance Tuning

For high-traffic deployments, consider:

1. **Multiple workers**: Scale the esm-do service
2. **Redis caching**: Enable with `--profile with-cache`
3. **Connection pooling**: Adjust `max_conns_per_host` in Caddyfile
4. **Timeouts**: Tune based on your application needs

## Development

### Local Testing

```bash
# Build custom Caddy image
docker compose build caddy

# Test configuration
docker compose run --rm caddy caddy validate --config /etc/caddy/Caddyfile

# Run with debug logging
docker compose run --rm -e CADDY_DEBUG=1 caddy
```

### Customizing

1. Edit `Caddyfile` for routing and proxy settings
2. Edit `Dockerfile` to add/remove plugins
3. Edit `docker-compose.yml` for service configuration

## License

MIT License - see the main project LICENSE file.

# Nginx Reverse Proxy for esm.do

Production-ready Nginx reverse proxy configuration for the esm.do ESM CDN service.

## Features

- **SSL/TLS**: Modern TLS 1.2/1.3 with strong ciphers
- **Compression**: Gzip and Brotli compression for optimal delivery
- **Caching**: Aggressive caching for versioned packages (immutable)
- **Rate Limiting**: Configurable rate limits per endpoint type
- **Security Headers**: Comprehensive security headers including HSTS, CSP-ready
- **CORS**: Full CORS support for ESM module imports
- **Logging**: JSON-formatted logs for easy parsing

## Quick Start

### Development

```bash
cd deploy/nginx

# Generate self-signed certificates (see ssl/README.md)
./generate-dev-certs.sh

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Production

```bash
cd deploy/nginx

# Set up SSL certificates (see ssl/README.md)
# Option 1: Let's Encrypt
docker-compose run --rm certbot certonly --webroot ...

# Option 2: Commercial certificate
# Place certificates in ssl/ directory

# Start services
docker-compose up -d
```

## Directory Structure

```
deploy/nginx/
├── nginx.conf              # Main Nginx configuration
├── sites-available/
│   └── esm.do.conf         # Site-specific configuration
├── conf.d/                 # Additional configuration files
├── ssl/
│   ├── README.md           # SSL setup instructions
│   ├── esm.do.crt          # SSL certificate
│   ├── esm.do.key          # SSL private key
│   └── esm.do.chain.crt    # Certificate chain
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile              # Custom Nginx image with Brotli
└── README.md               # This file
```

## Configuration

### Rate Limits

Rate limits are defined in `nginx.conf`:

| Zone     | Rate    | Burst | Use Case                    |
|----------|---------|-------|-----------------------------|
| general  | 10r/s   | 20    | Default endpoints           |
| api      | 30r/s   | 50    | ESM module requests         |
| strict   | 1r/s    | 5     | Sensitive operations        |

Adjust in `nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
```

### Caching

Cache policies are defined in `sites-available/esm.do.conf`:

| Content Type        | Cache Duration | Notes                      |
|---------------------|----------------|----------------------------|
| Versioned packages  | 365 days       | Immutable, version in URL  |
| Unversioned imports | 5 minutes      | Resolves to latest         |
| API responses       | 1 minute       | May change frequently      |
| Static assets       | 30 days        | favicon, robots.txt        |

### Environment Variables

Create a `.env` file for customization:

```bash
# .env
NGINX_WORKER_CONNECTIONS=4096
NGINX_KEEPALIVE_TIMEOUT=65
WORKER_PORT=8787
```

## Operations

### Health Check

```bash
# Check nginx health
curl http://localhost/health

# Check with SSL
curl https://esm.do/health
```

### Reload Configuration

```bash
# Test configuration
docker-compose exec nginx nginx -t

# Reload without downtime
docker-compose exec nginx nginx -s reload
```

### View Logs

```bash
# All logs
docker-compose logs -f nginx

# Access logs only
docker-compose exec nginx tail -f /var/log/nginx/access.log

# Error logs
docker-compose exec nginx tail -f /var/log/nginx/error.log

# Parse JSON logs with jq
docker-compose logs nginx | jq -r 'select(.status >= 400)'
```

### Cache Management

```bash
# View cache stats
docker-compose exec nginx ls -la /var/cache/nginx/esm/

# Clear cache
docker-compose exec nginx rm -rf /var/cache/nginx/esm/*

# Or restart nginx
docker-compose restart nginx
```

### SSL Certificate Renewal

```bash
# Manual renewal
docker-compose --profile ssl run --rm certbot certbot renew

# Reload nginx after renewal
docker-compose exec nginx nginx -s reload
```

## Scaling

### Multiple Workers

For high-traffic deployments, scale the worker service:

```bash
docker-compose up -d --scale worker=3
```

Update upstream in `nginx.conf`:

```nginx
upstream esm_worker {
    least_conn;
    server worker_1:8787;
    server worker_2:8787;
    server worker_3:8787;
    keepalive 32;
}
```

### External Load Balancer

When behind AWS ALB, Cloudflare, etc., add to server block:

```nginx
# Trust proxy headers
set_real_ip_from 10.0.0.0/8;
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

## Monitoring

### Prometheus Metrics

Enable stub status for Prometheus nginx exporter:

```nginx
location /nginx_status {
    stub_status on;
    allow 127.0.0.1;
    allow 10.0.0.0/8;
    deny all;
}
```

### Log Analysis

Parse JSON logs for metrics:

```bash
# Request count by status
cat access.log | jq -r '.status' | sort | uniq -c

# Slowest requests
cat access.log | jq -r 'select(.request_time > 1) | "\(.request_time)s \(.request)"'

# Cache hit ratio
cat access.log | jq -r '.upstream_cache_status' | sort | uniq -c
```

## Troubleshooting

### Common Issues

**502 Bad Gateway**
```bash
# Check if worker is running
docker-compose ps worker
docker-compose logs worker

# Verify connectivity
docker-compose exec nginx curl http://worker:8787/health
```

**SSL Certificate Errors**
```bash
# Verify certificate
openssl x509 -in ssl/esm.do.crt -text -noout

# Check key matches
openssl x509 -noout -modulus -in ssl/esm.do.crt | openssl md5
openssl rsa -noout -modulus -in ssl/esm.do.key | openssl md5
```

**Rate Limit Issues**
```bash
# Check rate limit status in logs
docker-compose logs nginx | grep "limiting requests"

# Temporarily increase limits for testing
# Edit nginx.conf and reload
```

**Cache Not Working**
```bash
# Check X-Cache-Status header
curl -I https://esm.do/lodash@4.17.21/lodash.js

# Values: MISS, HIT, EXPIRED, STALE, UPDATING, REVALIDATED, BYPASS
```

### Debug Mode

Enable debug logging temporarily:

```nginx
# In nginx.conf
error_log /var/log/nginx/error.log debug;
```

```bash
docker-compose exec nginx nginx -s reload
docker-compose exec nginx tail -f /var/log/nginx/error.log
```

## Security

### Recommended DNS Records

```
# A/AAAA records
esm.do.     A     YOUR_IP
esm.do.     AAAA  YOUR_IPv6

# CAA records (Let's Encrypt)
esm.do.     CAA   0 issue "letsencrypt.org"
esm.do.     CAA   0 issuewild "letsencrypt.org"

# HTTPS record (for HTTPS RR)
esm.do.     HTTPS 1 . alpn="h2,http/1.1"
```

### Firewall Rules

```bash
# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Rate limit at firewall level (optional)
iptables -A INPUT -p tcp --dport 443 -m connlimit --connlimit-above 100 -j DROP
```

## License

MIT License - See repository root for full license.

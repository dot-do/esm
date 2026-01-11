# =============================================================================
# Custom Caddy Docker Image with Plugins
# Includes rate limiting and additional modules for esm.do
# =============================================================================

# Build stage - compile Caddy with plugins
FROM caddy:2-builder AS builder

# Build Caddy with additional plugins
RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddyserver/transform-encoder \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/greenpau/caddy-security

# =============================================================================
# Runtime stage
# =============================================================================
FROM caddy:2-alpine

# Copy custom Caddy binary with plugins
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Install additional tools for health checks
RUN apk add --no-cache \
    wget \
    curl \
    ca-certificates \
    tzdata

# Create directories
RUN mkdir -p /var/log/caddy && \
    chown -R caddy:caddy /var/log/caddy

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Validate Caddyfile syntax
RUN caddy validate --config /etc/caddy/Caddyfile || true

# Use non-root user
USER caddy

# Expose ports
# 80 - HTTP (redirect to HTTPS)
# 443 - HTTPS
# 443/udp - HTTP/3
# 9999 - Metrics (internal)
EXPOSE 80 443 443/udp 9999

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9999/health || exit 1

# Run Caddy
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

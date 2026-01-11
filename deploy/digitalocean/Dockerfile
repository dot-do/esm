# =============================================================================
# esm.do Dockerfile for DigitalOcean App Platform
# Optimized multi-stage build with Miniflare runtime
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build TypeScript
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.json ./
COPY core/ ./core/
COPY src/ ./src/
COPY wrangler.jsonc ./

# Build TypeScript
RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime with Miniflare
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Install pnpm and runtime utilities
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S esm -u 1001 -G nodejs

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Install miniflare for Workers runtime
RUN pnpm add miniflare@4

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/dist ./core/dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/wrangler.jsonc ./

# Copy entrypoint script
COPY deploy/digitalocean/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory for potential persistent storage
RUN mkdir -p /data && chown esm:nodejs /data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV MINIFLARE_LOG=info

# Expose the port (DigitalOcean App Platform expects this)
EXPOSE 8787

# Set ownership
RUN chown -R esm:nodejs /app

# Switch to non-root user
USER esm

# Health check (DigitalOcean also performs its own health checks)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8787/health || exit 1

# Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the worker using miniflare
CMD ["/entrypoint.sh"]

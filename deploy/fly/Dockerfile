# Multi-stage Dockerfile for esm.do on Fly.io
# Uses workerd for Cloudflare Workers compatibility

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.json ./
COPY core/ ./core/
COPY src/ ./src/
COPY wrangler.jsonc ./

# Build the project
RUN pnpm run build

# =============================================================================
# Stage 2: Production Runtime with Miniflare
# =============================================================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
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

# Copy the entrypoint script
COPY deploy/fly/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory for persistent storage
RUN mkdir -p /data && chown esm:nodejs /data

# Set environment
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

# Expose the port
EXPOSE 8787

# Switch to non-root user
USER esm

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

# Use dumb-init as PID 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the worker using miniflare
CMD ["/entrypoint.sh"]

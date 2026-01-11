# Dockerfile for esm.do worker - Google Cloud Run
# Multi-stage build optimized for Cloud Run deployment

# ============================================================================
# Stage 1: Builder
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* pnpm-workspace.yaml* ./
COPY core/package.json ./core/

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile || npm ci || npm install

# Copy source code
COPY tsconfig.json ./
COPY wrangler.jsonc ./
COPY core/ ./core/
COPY src/ ./src/

# Build TypeScript
RUN pnpm run build || npm run build

# Prune dev dependencies for production
RUN pnpm prune --prod || npm prune --production

# ============================================================================
# Stage 2: Production Runtime
# ============================================================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling (critical for Cloud Run)
# and curl for health checks
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S esm && \
    adduser -S esm -u 1001 -G esm

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder --chown=esm:esm /app/dist ./dist
COPY --from=builder --chown=esm:esm /app/core/dist ./core/dist
COPY --from=builder --chown=esm:esm /app/node_modules ./node_modules
COPY --from=builder --chown=esm:esm /app/package.json ./package.json
COPY --from=builder --chown=esm:esm /app/core/package.json ./core/package.json
COPY --from=builder --chown=esm:esm /app/wrangler.jsonc ./wrangler.jsonc
COPY --from=builder --chown=esm:esm /app/src ./src

# Switch to non-root user
USER esm

# Cloud Run sets PORT environment variable (default 8080)
# The container must listen on this port
ENV PORT=8080
ENV NODE_ENV=production

# Expose the port (Cloud Run uses PORT env var)
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Use dumb-init as PID 1 for proper signal handling
# This ensures SIGTERM is properly forwarded for graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Run miniflare/wrangler with --port set to Cloud Run's PORT
# Using shell form to allow PORT variable expansion
CMD sh -c "npx wrangler dev --local --port $PORT --host 0.0.0.0"

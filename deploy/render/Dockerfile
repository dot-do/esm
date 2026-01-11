# =============================================================================
# esm.do Render Deployment Dockerfile
# =============================================================================
# Multi-stage build for running Cloudflare Workers on Render using miniflare
#
# Build: docker build -f deploy/render/Dockerfile -t esm-do .
# Run:   docker run -p 8787:8787 esm-do
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml* ./
COPY core/package.json ./core/

# Install pnpm and dependencies
RUN corepack enable pnpm && \
    pnpm install --frozen-lockfile --prod=false

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/core/node_modules ./core/node_modules

# Copy source code
COPY . .

# Build the application
RUN corepack enable pnpm && \
    pnpm run build

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

# Set environment variables
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0

# Copy built application
COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/core/dist ./core/dist
COPY --from=builder --chown=worker:nodejs /app/src ./src
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/package.json ./package.json
COPY --from=builder --chown=worker:nodejs /app/wrangler.jsonc ./wrangler.jsonc

# Copy startup scripts
COPY --chown=worker:nodejs deploy/render/start.sh ./start.sh
RUN chmod +x ./start.sh

# Switch to non-root user
USER worker

# Expose the application port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["./start.sh"]

# Multi-stage Dockerfile for esm.do on Railway
# Optimized for Cloudflare Workers runtime using Miniflare

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY tsconfig.json ./
COPY wrangler.jsonc ./
COPY core/ ./core/
COPY src/ ./src/

# Build TypeScript
RUN pnpm run build

# =============================================================================
# Stage 2: Production Runtime
# =============================================================================
FROM node:20-slim AS runtime

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home esm

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Install miniflare for local Cloudflare Workers runtime
RUN pnpm add miniflare

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/dist ./core/dist
COPY --from=builder /app/wrangler.jsonc ./

# Copy source for miniflare (it needs the original TypeScript)
COPY --from=builder /app/src ./src
COPY --from=builder /app/core/src ./core/src

# Set ownership to non-root user
RUN chown -R esm:nodejs /app

# Switch to non-root user
USER esm

# Expose port
EXPOSE 8787

# Environment variables
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:8787/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start miniflare with the worker
CMD ["npx", "miniflare", "--host", "0.0.0.0", "--port", "8787", "--modules", "src/worker/index.ts"]

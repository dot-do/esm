# =============================================================================
# esm.do Bun Dockerfile
# Optimized multi-stage build using oven/bun base image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1-slim AS deps

WORKDIR /app

# Copy dependency files first for layer caching
COPY package.json bun.lockb* pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY core/package.json ./core/

# Install dependencies using Bun
# Falls back to pnpm-lock.yaml if bun.lockb doesn't exist
RUN if [ -f bun.lockb ]; then \
      bun install --frozen-lockfile; \
    elif [ -f pnpm-lock.yaml ]; then \
      bun install; \
    else \
      bun install; \
    fi

# -----------------------------------------------------------------------------
# Stage 2: Build TypeScript
# -----------------------------------------------------------------------------
FROM oven/bun:1-slim AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/core/node_modules ./core/node_modules 2>/dev/null || true

# Copy source files
COPY package.json ./
COPY tsconfig.json ./
COPY core/ ./core/
COPY src/ ./src/
COPY deploy/bun/ ./deploy/bun/

# Build with Bun
RUN bun run deploy/bun/build.ts

# -----------------------------------------------------------------------------
# Stage 3: Production runtime
# -----------------------------------------------------------------------------
FROM oven/bun:1-slim AS runtime

# Install wget for health checks
RUN apt-get update && apt-get install -y --no-install-recommends wget && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1001 bun && \
    useradd --uid 1001 --gid bun --shell /bin/bash --create-home esm

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/dist ./core/dist 2>/dev/null || true
COPY --from=builder /app/package.json ./

# Copy source for dynamic imports (worker uses src)
COPY --from=builder /app/src ./src
COPY --from=builder /app/core/src ./core/src 2>/dev/null || true

# Copy server entry point
COPY --from=builder /app/deploy/bun/server.ts ./deploy/bun/server.ts

# Install production dependencies only
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/core/node_modules ./core/node_modules 2>/dev/null || true

# Set ownership
RUN chown -R esm:bun /app

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
    CMD wget --no-verbose --tries=1 --spider http://localhost:8787/ || exit 1

# Run the server
CMD ["bun", "run", "deploy/bun/server.ts"]

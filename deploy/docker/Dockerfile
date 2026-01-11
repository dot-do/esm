# =============================================================================
# esm.do Production Dockerfile
# Multi-stage build for Cloudflare Workers (workerd) deployment
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build TypeScript
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copy package files for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install pnpm and dependencies
RUN npm install -g pnpm@9 && \
    pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.json ./
COPY core/ ./core/
COPY src/ ./src/
COPY wrangler.jsonc ./

# Build TypeScript
RUN pnpm run build

# Generate workerd-compatible bundle using wrangler
# This creates a single bundled worker file
RUN npx wrangler deploy --dry-run --outdir=.wrangler/dist src/worker/index.ts 2>/dev/null || \
    npx esbuild src/worker/index.ts \
      --bundle \
      --format=esm \
      --platform=neutral \
      --target=es2022 \
      --outfile=.wrangler/dist/worker.js \
      --external:cloudflare:* \
      --external:node:*

# -----------------------------------------------------------------------------
# Stage 2: Runtime with workerd
# -----------------------------------------------------------------------------
FROM ghcr.io/cloudflare/workerd:latest AS runtime

# Create non-root user for security
RUN addgroup -g 1000 worker && \
    adduser -u 1000 -G worker -s /bin/sh -D worker

WORKDIR /app

# Copy built worker bundle from builder stage
COPY --from=builder /app/.wrangler/dist/worker.js ./worker.js
COPY --from=builder /app/wrangler.jsonc ./

# Copy entrypoint script
COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create workerd capnp configuration
RUN cat > /app/config.capnp << 'EOF'
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .esmWorker),
  ],

  sockets = [
    (
      name = "http",
      address = "*:8787",
      http = (),
      service = "main"
    ),
  ]
);

const esmWorker :Workerd.Worker = (
  modules = [
    (name = "worker", esModule = embed "worker.js"),
  ],
  compatibilityDate = "2024-01-01",
  compatibilityFlags = ["nodejs_compat"],

  bindings = [
    (name = "unsafe_eval", unsafeEval = void),
  ],
);
EOF

# Set ownership
RUN chown -R worker:worker /app

# Switch to non-root user
USER worker

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/ || exit 1

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Default command
CMD ["workerd", "serve", "/app/config.capnp"]

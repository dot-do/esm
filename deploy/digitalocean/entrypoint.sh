#!/bin/sh
set -e

# =============================================================================
# esm.do Entrypoint for DigitalOcean App Platform
# Runs the Cloudflare Worker using Miniflare
# =============================================================================

echo "=========================================="
echo "  esm.do Worker Starting"
echo "=========================================="
echo "Node version: $(node --version)"
echo "Environment: ${NODE_ENV:-development}"
echo "Host: ${HOST:-0.0.0.0}"
echo "Port: ${PORT:-8787}"
echo "Log level: ${MINIFLARE_LOG:-info}"
echo "=========================================="

# Run miniflare with the worker configuration
exec npx miniflare \
    --modules \
    --modules-rule "CompiledWasm=**/*.wasm" \
    --host "${HOST:-0.0.0.0}" \
    --port "${PORT:-8787}" \
    --compatibility-date "2024-01-01" \
    --compatibility-flag "nodejs_compat" \
    --global "unsafe_eval" \
    --log "${MINIFLARE_LOG:-info}" \
    ./src/worker/index.ts

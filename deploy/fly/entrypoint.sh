#!/bin/sh
set -e

# Entrypoint script for esm.do on Fly.io
# Runs the Cloudflare Worker using miniflare

echo "Starting esm.do worker..."
echo "Node version: $(node --version)"
echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-8787}"

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

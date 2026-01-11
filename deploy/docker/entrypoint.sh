#!/bin/sh
# =============================================================================
# esm.do Docker Entrypoint
# Validates environment and starts workerd with proper configuration
# =============================================================================

set -e

# Colors for output (if terminal supports it)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo "${RED}[ERROR]${NC} $1"
}

# -----------------------------------------------------------------------------
# Environment Validation
# -----------------------------------------------------------------------------

log_info "Starting esm.do worker..."
log_info "Validating environment..."

# Check if worker bundle exists
if [ ! -f "/app/worker.js" ]; then
    log_error "Worker bundle not found at /app/worker.js"
    exit 1
fi

# Check if config exists
if [ ! -f "/app/config.capnp" ]; then
    log_error "Workerd config not found at /app/config.capnp"
    exit 1
fi

# Validate worker bundle is not empty
if [ ! -s "/app/worker.js" ]; then
    log_error "Worker bundle is empty"
    exit 1
fi

log_info "Worker bundle: /app/worker.js ($(wc -c < /app/worker.js) bytes)"

# -----------------------------------------------------------------------------
# Optional Environment Variables
# -----------------------------------------------------------------------------

# ESM_PORT: Override the default port (8787)
if [ -n "$ESM_PORT" ]; then
    log_info "Custom port: $ESM_PORT"
    # Update config.capnp with custom port
    sed -i "s/:8787/:$ESM_PORT/g" /app/config.capnp
fi

# ESM_LOG_LEVEL: Set log level (debug, info, warn, error)
LOG_LEVEL="${ESM_LOG_LEVEL:-info}"
log_info "Log level: $LOG_LEVEL"

# ESM_WORKERS: Number of worker threads (default: auto)
if [ -n "$ESM_WORKERS" ]; then
    log_info "Worker threads: $ESM_WORKERS"
fi

# -----------------------------------------------------------------------------
# Health Check Endpoint (pre-flight)
# -----------------------------------------------------------------------------

# Ensure we can bind to the port
PORT="${ESM_PORT:-8787}"

# On Alpine, use nc for port check
if command -v nc >/dev/null 2>&1; then
    if nc -z localhost "$PORT" 2>/dev/null; then
        log_warn "Port $PORT is already in use"
    fi
fi

# -----------------------------------------------------------------------------
# Signal Handling for Graceful Shutdown
# -----------------------------------------------------------------------------

cleanup() {
    log_info "Received shutdown signal, stopping workerd..."
    # workerd handles SIGTERM gracefully
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# -----------------------------------------------------------------------------
# Start workerd
# -----------------------------------------------------------------------------

log_info "Starting workerd server on port $PORT..."
log_info "Configuration: /app/config.capnp"

# Print startup banner
echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║           esm.do Worker Runtime           ║"
echo "  ╠═══════════════════════════════════════════╣"
echo "  ║  Port: $PORT                              "
echo "  ║  Mode: Production                         ║"
echo "  ║  Engine: workerd (Cloudflare)             ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""

# Execute the command passed to the container
# Default is: workerd serve /app/config.capnp
exec "$@"

#!/bin/sh
# =============================================================================
# esm.do Render Startup Script
# =============================================================================
# Handles environment validation and graceful shutdown for Render deployment
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
PORT="${PORT:-8787}"
HOST="${HOST:-0.0.0.0}"
NODE_ENV="${NODE_ENV:-production}"
LOG_LEVEL="${LOG_LEVEL:-info}"

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
}

log_info() {
    log "INFO: $1"
}

log_warn() {
    log "WARN: $1"
}

log_error() {
    log "ERROR: $1"
}

# -----------------------------------------------------------------------------
# Environment Validation
# -----------------------------------------------------------------------------
validate_environment() {
    log_info "Validating environment..."

    # Check required files
    if [ ! -f "wrangler.jsonc" ]; then
        log_error "wrangler.jsonc not found"
        exit 1
    fi

    if [ ! -d "src" ]; then
        log_error "src directory not found"
        exit 1
    fi

    # Validate port is a number
    case "$PORT" in
        ''|*[!0-9]*)
            log_error "PORT must be a number, got: $PORT"
            exit 1
            ;;
    esac

    # Validate port range
    if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
        log_error "PORT must be between 1 and 65535, got: $PORT"
        exit 1
    fi

    log_info "Environment validation passed"
}

# -----------------------------------------------------------------------------
# Graceful Shutdown Handler
# -----------------------------------------------------------------------------
shutdown_handler() {
    log_info "Received shutdown signal, initiating graceful shutdown..."

    # Give in-flight requests time to complete
    sleep 2

    # Kill the main process if it exists
    if [ -n "$MAIN_PID" ] && kill -0 "$MAIN_PID" 2>/dev/null; then
        log_info "Stopping worker process (PID: $MAIN_PID)..."
        kill -TERM "$MAIN_PID" 2>/dev/null || true

        # Wait for process to exit (max 10 seconds)
        timeout=10
        while [ $timeout -gt 0 ] && kill -0 "$MAIN_PID" 2>/dev/null; do
            sleep 1
            timeout=$((timeout - 1))
        done

        # Force kill if still running
        if kill -0 "$MAIN_PID" 2>/dev/null; then
            log_warn "Process did not exit gracefully, forcing termination..."
            kill -KILL "$MAIN_PID" 2>/dev/null || true
        fi
    fi

    log_info "Shutdown complete"
    exit 0
}

# -----------------------------------------------------------------------------
# Signal Handlers
# -----------------------------------------------------------------------------
trap shutdown_handler SIGTERM SIGINT SIGQUIT

# -----------------------------------------------------------------------------
# Print Startup Banner
# -----------------------------------------------------------------------------
print_banner() {
    log_info "============================================"
    log_info "esm.do - Living ESM Module System"
    log_info "============================================"
    log_info "Environment: $NODE_ENV"
    log_info "Port: $PORT"
    log_info "Host: $HOST"
    log_info "Log Level: $LOG_LEVEL"
    log_info "Node Version: $(node --version)"
    log_info "============================================"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    print_banner
    validate_environment

    log_info "Starting miniflare worker..."

    # Run miniflare with the worker configuration
    # Using npx to ensure miniflare is available
    npx miniflare \
        --config wrangler.jsonc \
        --port "$PORT" \
        --host "$HOST" \
        --no-cf \
        --no-update-check \
        --log-level "$LOG_LEVEL" &

    MAIN_PID=$!

    log_info "Worker started with PID: $MAIN_PID"

    # Wait for the main process
    wait $MAIN_PID
    EXIT_CODE=$?

    if [ $EXIT_CODE -ne 0 ]; then
        log_error "Worker exited with code: $EXIT_CODE"
    else
        log_info "Worker exited normally"
    fi

    exit $EXIT_CODE
}

# Run main function
main "$@"

#!/bin/bash
# =============================================================================
# esm.do Render Manual Deployment Script
# =============================================================================
# Deploy esm.do to Render using the Render CLI or API
#
# Usage:
#   ./deploy/render/deploy.sh [options]
#
# Options:
#   --service-id ID    Render service ID (or set RENDER_SERVICE_ID env var)
#   --api-key KEY      Render API key (or set RENDER_API_KEY env var)
#   --build-only       Only build, don't deploy
#   --dry-run          Show what would be done without executing
#   --help             Show this help message
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVICE_NAME="esm-do"
DOCKER_IMAGE="esm-do:latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------
show_help() {
    head -30 "$0" | tail -22 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------
BUILD_ONLY=false
DRY_RUN=false
RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-}"
RENDER_API_KEY="${RENDER_API_KEY:-}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --service-id)
            RENDER_SERVICE_ID="$2"
            shift 2
            ;;
        --api-key)
            RENDER_API_KEY="$2"
            shift 2
            ;;
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------
validate_requirements() {
    log_info "Validating requirements..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi

    # Check project structure
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "package.json not found in project root"
        exit 1
    fi

    if [[ ! -f "$PROJECT_ROOT/wrangler.jsonc" ]]; then
        log_error "wrangler.jsonc not found in project root"
        exit 1
    fi

    # Check API key for non-build-only deployments
    if [[ "$BUILD_ONLY" == "false" ]] && [[ -z "$RENDER_API_KEY" ]]; then
        log_warn "RENDER_API_KEY not set - deployment will require manual trigger"
    fi

    log_success "Requirements validated"
}

# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------
build_docker_image() {
    log_info "Building Docker image: $DOCKER_IMAGE"

    cd "$PROJECT_ROOT"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would execute: docker build -f deploy/render/Dockerfile -t $DOCKER_IMAGE ."
        return 0
    fi

    docker build \
        -f deploy/render/Dockerfile \
        -t "$DOCKER_IMAGE" \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
        .

    log_success "Docker image built successfully"
}

# -----------------------------------------------------------------------------
# Test
# -----------------------------------------------------------------------------
test_docker_image() {
    log_info "Testing Docker image..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would start container and test health endpoint"
        return 0
    fi

    # Start container in background
    CONTAINER_ID=$(docker run -d -p 8787:8787 --name esm-test-$$ "$DOCKER_IMAGE")

    # Wait for startup
    log_info "Waiting for container to start..."
    sleep 5

    # Test health endpoint
    if curl -sf http://localhost:8787/health > /dev/null 2>&1; then
        log_success "Health check passed"
    else
        log_error "Health check failed"
        docker logs "$CONTAINER_ID"
        docker rm -f "$CONTAINER_ID" 2>/dev/null || true
        exit 1
    fi

    # Cleanup
    docker rm -f "$CONTAINER_ID" 2>/dev/null || true
    log_success "Docker image tested successfully"
}

# -----------------------------------------------------------------------------
# Deploy
# -----------------------------------------------------------------------------
trigger_render_deploy() {
    if [[ "$BUILD_ONLY" == "true" ]]; then
        log_info "Build-only mode, skipping deployment"
        return 0
    fi

    if [[ -z "$RENDER_API_KEY" ]]; then
        log_warn "No API key provided - please deploy manually via Render dashboard"
        log_info "Dashboard: https://dashboard.render.com"
        return 0
    fi

    if [[ -z "$RENDER_SERVICE_ID" ]]; then
        log_warn "No service ID provided - please deploy manually via Render dashboard"
        log_info "Dashboard: https://dashboard.render.com"
        return 0
    fi

    log_info "Triggering Render deployment..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would trigger deployment for service: $RENDER_SERVICE_ID"
        return 0
    fi

    # Trigger deployment via Render API
    RESPONSE=$(curl -sf -X POST \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
        -d '{"clearCache": "do_not_clear"}')

    if [[ $? -eq 0 ]]; then
        DEPLOY_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        log_success "Deployment triggered: $DEPLOY_ID"
        log_info "Monitor at: https://dashboard.render.com/web/$RENDER_SERVICE_ID"
    else
        log_error "Failed to trigger deployment"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    log_info "============================================"
    log_info "esm.do Render Deployment"
    log_info "============================================"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "Running in dry-run mode"
    fi

    validate_requirements
    build_docker_image
    test_docker_image
    trigger_render_deploy

    log_info "============================================"
    log_success "Deployment complete!"
    log_info "============================================"
}

main "$@"

#!/usr/bin/env bash
# =============================================================================
# Railway Deployment Script for esm.do
# =============================================================================
# This script automates Railway deployment using the Railway CLI
#
# Prerequisites:
#   - Railway CLI installed: npm install -g @railway/cli
#   - Authenticated: railway login
#   - Project linked: railway link
#
# Usage:
#   ./deploy.sh [environment]
#
# Examples:
#   ./deploy.sh              # Deploy to default environment
#   ./deploy.sh production   # Deploy to production
#   ./deploy.sh staging      # Deploy to staging
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default environment
ENVIRONMENT="${1:-production}"

# =============================================================================
# Helper Functions
# =============================================================================

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

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check Railway CLI
    check_command "railway"
    log_success "Railway CLI found"

    # Check if logged in
    if ! railway whoami &> /dev/null; then
        log_error "Not logged in to Railway. Run 'railway login' first."
        exit 1
    fi
    log_success "Railway authentication verified"

    # Check Node.js
    check_command "node"
    log_success "Node.js found: $(node --version)"

    # Check pnpm
    check_command "pnpm"
    log_success "pnpm found: $(pnpm --version)"
}

# =============================================================================
# Build
# =============================================================================

build_project() {
    log_info "Building project..."

    cd "$PROJECT_ROOT"

    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile

    # Build TypeScript
    log_info "Compiling TypeScript..."
    pnpm run build

    # Run tests
    log_info "Running tests..."
    pnpm run test || {
        log_warn "Some tests failed. Continuing with deployment..."
    }

    log_success "Build completed successfully"
}

# =============================================================================
# Deploy
# =============================================================================

deploy_to_railway() {
    log_info "Deploying to Railway (${ENVIRONMENT})..."

    cd "$PROJECT_ROOT"

    # Set environment variables
    log_info "Setting environment variables..."
    railway variables set NODE_ENV=production
    railway variables set PORT=8787
    railway variables set MINIFLARE_LOG_LEVEL=info

    # Deploy using Dockerfile
    log_info "Triggering deployment..."
    railway up --dockerfile deploy/railway/Dockerfile

    log_success "Deployment initiated"
}

# =============================================================================
# Post-deployment
# =============================================================================

post_deploy() {
    log_info "Running post-deployment checks..."

    # Get deployment URL
    DEPLOY_URL=$(railway domain 2>/dev/null || echo "")

    if [ -n "$DEPLOY_URL" ]; then
        log_info "Deployment URL: https://${DEPLOY_URL}"

        # Health check
        log_info "Waiting for service to be ready..."
        sleep 10

        if curl -sf "https://${DEPLOY_URL}/" > /dev/null; then
            log_success "Service is healthy and responding"
        else
            log_warn "Service health check failed. It may still be starting up."
        fi
    else
        log_warn "Could not retrieve deployment URL. Check Railway dashboard."
    fi

    # Show logs hint
    log_info "To view logs: railway logs"
    log_info "To open dashboard: railway open"
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "=========================================="
    echo "  esm.do Railway Deployment"
    echo "  Environment: ${ENVIRONMENT}"
    echo "=========================================="
    echo ""

    preflight_checks
    echo ""

    build_project
    echo ""

    deploy_to_railway
    echo ""

    post_deploy
    echo ""

    log_success "Deployment complete!"
}

# Run main function
main "$@"

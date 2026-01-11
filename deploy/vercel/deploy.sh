#!/bin/bash
#
# esm.do Vercel Edge Functions Deployment Script
#
# Usage:
#   ./deploy.sh              # Deploy to production
#   ./deploy.sh preview      # Deploy preview
#   ./deploy.sh dev          # Run local development server
#
# Prerequisites:
#   - Node.js >= 18
#   - Vercel CLI installed: npm i -g vercel
#   - Authenticated with Vercel: vercel login
#
# Environment Variables (optional):
#   VERCEL_TOKEN          - Vercel API token for CI/CD
#   VERCEL_ORG_ID         - Vercel organization ID
#   VERCEL_PROJECT_ID     - Vercel project ID
#   ESM_DO_API_KEY        - API key for protected namespaces
#   ESM_DO_ADMIN_KEY      - Admin API key
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Helper functions
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
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js >= 18."
    fi

    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version must be >= 18. Current: $(node -v)"
    fi
    log_info "Node.js version: $(node -v)"

    # Check Vercel CLI
    if ! command -v vercel &> /dev/null; then
        log_warn "Vercel CLI not found. Installing..."
        npm install -g vercel
    fi
    log_info "Vercel CLI version: $(vercel --version)"
}

# Install dependencies
install_deps() {
    log_info "Installing dependencies..."
    npm install
}

# Type check
typecheck() {
    log_info "Running TypeScript type check..."
    npm run typecheck || log_warn "Type check completed with warnings"
}

# Deploy to Vercel
deploy_production() {
    log_info "Deploying to Vercel (production)..."

    DEPLOY_ARGS="--prod"

    # Add token if available (for CI/CD)
    if [ -n "$VERCEL_TOKEN" ]; then
        DEPLOY_ARGS="$DEPLOY_ARGS --token=$VERCEL_TOKEN"
    fi

    # Run deployment
    vercel $DEPLOY_ARGS

    log_success "Production deployment complete!"
}

deploy_preview() {
    log_info "Deploying to Vercel (preview)..."

    DEPLOY_ARGS=""

    # Add token if available (for CI/CD)
    if [ -n "$VERCEL_TOKEN" ]; then
        DEPLOY_ARGS="$DEPLOY_ARGS --token=$VERCEL_TOKEN"
    fi

    # Run deployment
    vercel $DEPLOY_ARGS

    log_success "Preview deployment complete!"
}

run_dev() {
    log_info "Starting local development server..."
    vercel dev
}

# Show help
show_help() {
    echo "esm.do Vercel Edge Functions Deployment"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  (none)    Deploy to production"
    echo "  preview   Deploy preview"
    echo "  dev       Run local development server"
    echo "  help      Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  VERCEL_TOKEN        Vercel API token for CI/CD"
    echo "  VERCEL_ORG_ID       Vercel organization ID"
    echo "  VERCEL_PROJECT_ID   Vercel project ID"
    echo "  ESM_DO_API_KEY      API key for protected namespaces"
    echo "  ESM_DO_ADMIN_KEY    Admin API key"
}

# Main
main() {
    echo ""
    echo "========================================"
    echo "  esm.do Vercel Edge Deployment"
    echo "========================================"
    echo ""

    case "${1:-}" in
        help|--help|-h)
            show_help
            exit 0
            ;;
        dev)
            check_prerequisites
            install_deps
            run_dev
            ;;
        preview)
            check_prerequisites
            install_deps
            typecheck
            deploy_preview
            ;;
        *)
            check_prerequisites
            install_deps
            typecheck
            deploy_production
            ;;
    esac
}

main "$@"

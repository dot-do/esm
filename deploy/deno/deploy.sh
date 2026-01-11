#!/bin/bash
#
# esm.do Deno Deploy Script
#
# This script deploys the esm.do worker to Deno Deploy.
#
# Prerequisites:
#   1. Install Deno: https://deno.land/manual/getting_started/installation
#   2. Install deployctl: deno install -gArf jsr:@deno/deployctl
#   3. Authenticate: deployctl login
#
# Usage:
#   ./deploy.sh              # Deploy to production
#   ./deploy.sh --preview    # Deploy preview (non-production)
#   ./deploy.sh --dry-run    # Check without deploying
#
# Environment Variables:
#   DENO_DEPLOY_TOKEN  - API token for CI/CD deployments
#   ESM_DO_PROJECT     - Deno Deploy project name (default: esm-do)
#

set -e

# Configuration
PROJECT_NAME="${ESM_DO_PROJECT:-esm-do}"
ENTRYPOINT="main.ts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check for required tools
check_requirements() {
    info "Checking requirements..."

    if ! command -v deno &> /dev/null; then
        error "Deno is not installed. Install from: https://deno.land/manual/getting_started/installation"
    fi

    if ! command -v deployctl &> /dev/null; then
        warn "deployctl not found. Installing..."
        deno install -gArf jsr:@deno/deployctl
    fi

    success "All requirements met"
}

# Type check the code
type_check() {
    info "Type checking..."
    cd "$SCRIPT_DIR"
    deno check "$ENTRYPOINT"
    success "Type check passed"
}

# Lint the code
lint() {
    info "Linting..."
    cd "$SCRIPT_DIR"
    deno lint "$ENTRYPOINT"
    success "Lint passed"
}

# Deploy to Deno Deploy
deploy() {
    local deploy_args=("--project=$PROJECT_NAME")

    # Add production flag unless preview mode
    if [[ "$1" != "--preview" ]]; then
        deploy_args+=("--prod")
    fi

    # Add token if available (for CI/CD)
    if [[ -n "$DENO_DEPLOY_TOKEN" ]]; then
        deploy_args+=("--token=$DENO_DEPLOY_TOKEN")
    fi

    info "Deploying to Deno Deploy..."
    info "Project: $PROJECT_NAME"
    info "Entrypoint: $ENTRYPOINT"

    cd "$SCRIPT_DIR"
    deployctl deploy "${deploy_args[@]}" "$ENTRYPOINT"

    success "Deployment complete!"

    if [[ "$1" == "--preview" ]]; then
        info "Preview deployment created"
    else
        info "Production URL: https://$PROJECT_NAME.deno.dev"
    fi
}

# Main execution
main() {
    echo ""
    echo "========================================"
    echo "  esm.do Deno Deploy Script"
    echo "========================================"
    echo ""

    case "${1:-}" in
        --dry-run)
            check_requirements
            type_check
            lint
            info "Dry run complete. Ready to deploy."
            ;;
        --preview)
            check_requirements
            type_check
            lint
            deploy --preview
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --preview    Deploy as preview (non-production)"
            echo "  --dry-run    Check code without deploying"
            echo "  --help, -h   Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  DENO_DEPLOY_TOKEN  API token for CI/CD deployments"
            echo "  ESM_DO_PROJECT     Deno Deploy project name (default: esm-do)"
            ;;
        *)
            check_requirements
            type_check
            lint
            deploy
            ;;
    esac
}

main "$@"

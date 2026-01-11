#!/bin/bash
set -euo pipefail

# =============================================================================
# Fly.io Deployment Script for esm.do
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="esm-do"
PRIMARY_REGION="iad"
SECONDARY_REGIONS=("lhr" "sin" "syd")  # London, Singapore, Sydney
ORG="${FLY_ORG:-personal}"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

check_fly_cli() {
    log_info "Checking for Fly CLI..."
    if ! command -v fly &> /dev/null; then
        log_error "Fly CLI is not installed. Install it with: curl -L https://fly.io/install.sh | sh"
    fi
    log_success "Fly CLI found: $(fly version)"
}

check_auth() {
    log_info "Checking Fly.io authentication..."
    if ! fly auth whoami &> /dev/null; then
        log_error "Not authenticated with Fly.io. Run: fly auth login"
    fi
    log_success "Authenticated as: $(fly auth whoami)"
}

check_project_files() {
    log_info "Checking project files..."

    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "package.json not found in project root"
    fi

    if [[ ! -f "$PROJECT_ROOT/wrangler.jsonc" ]]; then
        log_error "wrangler.jsonc not found in project root"
    fi

    if [[ ! -f "$SCRIPT_DIR/fly.toml" ]]; then
        log_error "fly.toml not found in deploy/fly directory"
    fi

    if [[ ! -f "$SCRIPT_DIR/Dockerfile" ]]; then
        log_error "Dockerfile not found in deploy/fly directory"
    fi

    log_success "All required project files found"
}

# =============================================================================
# App Management
# =============================================================================

app_exists() {
    fly apps list --json 2>/dev/null | grep -q "\"$APP_NAME\""
}

create_app() {
    log_info "Checking if app '$APP_NAME' exists..."

    if app_exists; then
        log_success "App '$APP_NAME' already exists"
    else
        log_info "Creating app '$APP_NAME' in region '$PRIMARY_REGION'..."
        fly apps create "$APP_NAME" --org "$ORG" || log_error "Failed to create app"
        log_success "App '$APP_NAME' created successfully"
    fi
}

# =============================================================================
# Secrets Management
# =============================================================================

set_secrets() {
    log_info "Setting secrets..."

    # Check for required environment variables
    local secrets_to_set=""

    # Add secrets from environment if they exist
    if [[ -n "${ESM_API_KEY:-}" ]]; then
        secrets_to_set+="ESM_API_KEY=$ESM_API_KEY "
    fi

    if [[ -n "${ESM_STORAGE_KEY:-}" ]]; then
        secrets_to_set+="ESM_STORAGE_KEY=$ESM_STORAGE_KEY "
    fi

    if [[ -n "${ESM_AUTH_TOKEN:-}" ]]; then
        secrets_to_set+="ESM_AUTH_TOKEN=$ESM_AUTH_TOKEN "
    fi

    if [[ -n "$secrets_to_set" ]]; then
        echo "$secrets_to_set" | xargs fly secrets set --app "$APP_NAME"
        log_success "Secrets configured"
    else
        log_warning "No secrets found in environment. Set ESM_API_KEY, ESM_STORAGE_KEY, ESM_AUTH_TOKEN if needed."
    fi
}

# =============================================================================
# Deployment
# =============================================================================

deploy() {
    log_info "Starting deployment to Fly.io..."

    # Change to project root for Docker context
    cd "$PROJECT_ROOT"

    # Copy fly.toml to project root temporarily for deployment
    cp "$SCRIPT_DIR/fly.toml" "$PROJECT_ROOT/fly.toml"

    # Deploy with the Dockerfile
    fly deploy \
        --app "$APP_NAME" \
        --dockerfile "$SCRIPT_DIR/Dockerfile" \
        --region "$PRIMARY_REGION" \
        --strategy rolling \
        --wait-timeout 300

    # Clean up temporary fly.toml
    rm -f "$PROJECT_ROOT/fly.toml"

    log_success "Deployment completed successfully!"
}

# =============================================================================
# Multi-region Scaling
# =============================================================================

scale_regions() {
    log_info "Scaling to multiple regions..."

    for region in "${SECONDARY_REGIONS[@]}"; do
        log_info "Adding machine in region: $region"
        fly machine clone \
            --app "$APP_NAME" \
            --region "$region" \
            --select || log_warning "Could not add machine in $region (may already exist)"
    done

    log_success "Multi-region scaling configured"
}

# =============================================================================
# Status and Verification
# =============================================================================

show_status() {
    log_info "Deployment Status:"
    echo ""

    fly status --app "$APP_NAME"
    echo ""

    log_info "App URL: https://$APP_NAME.fly.dev"
    log_info "Dashboard: https://fly.io/apps/$APP_NAME"
}

verify_deployment() {
    log_info "Verifying deployment..."

    local url="https://$APP_NAME.fly.dev/health"
    local max_attempts=10
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        log_info "Health check attempt $attempt/$max_attempts..."

        if curl -sf "$url" > /dev/null 2>&1; then
            log_success "Health check passed!"
            return 0
        fi

        sleep 5
        ((attempt++))
    done

    log_warning "Health check failed after $max_attempts attempts. The app may still be starting."
}

# =============================================================================
# Main
# =============================================================================

usage() {
    cat << EOF
Usage: $0 [command]

Commands:
    deploy      Full deployment (create app, set secrets, deploy, scale)
    create      Create the app only
    secrets     Set secrets only
    scale       Scale to multiple regions only
    status      Show deployment status
    verify      Verify deployment health
    help        Show this help message

Environment Variables:
    FLY_ORG         Fly.io organization (default: personal)
    ESM_API_KEY     API key for ESM service
    ESM_STORAGE_KEY Storage encryption key
    ESM_AUTH_TOKEN  Authentication token

Examples:
    $0 deploy                    # Full deployment
    $0 status                    # Check status
    ESM_API_KEY=xxx $0 secrets   # Set secrets
EOF
}

main() {
    local command="${1:-deploy}"

    case "$command" in
        deploy)
            check_fly_cli
            check_auth
            check_project_files
            create_app
            set_secrets
            deploy
            scale_regions
            show_status
            verify_deployment
            ;;
        create)
            check_fly_cli
            check_auth
            create_app
            ;;
        secrets)
            check_fly_cli
            check_auth
            set_secrets
            ;;
        scale)
            check_fly_cli
            check_auth
            scale_regions
            ;;
        status)
            check_fly_cli
            check_auth
            show_status
            ;;
        verify)
            verify_deployment
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $command. Use '$0 help' for usage."
            ;;
    esac
}

main "$@"

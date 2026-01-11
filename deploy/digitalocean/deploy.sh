#!/usr/bin/env bash
# =============================================================================
# DigitalOcean App Platform Deployment Script for esm.do
# =============================================================================
#
# Prerequisites:
#   - doctl CLI installed: https://docs.digitalocean.com/reference/doctl/how-to/install/
#   - Authenticated: doctl auth init
#
# Usage:
#   ./deploy.sh [command]
#
# Commands:
#   create    - Create a new app from the spec
#   update    - Update an existing app
#   deploy    - Create or update the app
#   status    - Show app status
#   logs      - Stream app logs
#   destroy   - Delete the app
#   help      - Show this help message
#
# Examples:
#   ./deploy.sh deploy        # Deploy the app
#   ./deploy.sh status        # Check deployment status
#   ./deploy.sh logs          # Stream logs
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
APP_SPEC="${SCRIPT_DIR}/.do/app.yaml"

# App name (must match app.yaml)
APP_NAME="esm-do"

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
        echo ""
        echo "Install doctl:"
        echo "  macOS:   brew install doctl"
        echo "  Linux:   snap install doctl"
        echo "  Manual:  https://docs.digitalocean.com/reference/doctl/how-to/install/"
        exit 1
    fi
}

get_app_id() {
    doctl apps list --format ID,Spec.Name --no-header 2>/dev/null | \
        grep "${APP_NAME}$" | awk '{print $1}' || echo ""
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check doctl CLI
    check_command "doctl"
    log_success "doctl CLI found: $(doctl version | head -n1)"

    # Check if authenticated
    if ! doctl account get &> /dev/null; then
        log_error "Not authenticated with DigitalOcean. Run 'doctl auth init' first."
        exit 1
    fi
    log_success "DigitalOcean authentication verified"

    # Check app spec exists
    if [ ! -f "$APP_SPEC" ]; then
        log_error "App spec not found at: $APP_SPEC"
        exit 1
    fi
    log_success "App spec found: $APP_SPEC"
}

# =============================================================================
# Commands
# =============================================================================

cmd_create() {
    log_info "Creating new app: ${APP_NAME}..."

    cd "$PROJECT_ROOT"

    # Check if app already exists
    APP_ID=$(get_app_id)
    if [ -n "$APP_ID" ]; then
        log_warn "App already exists with ID: ${APP_ID}"
        log_info "Use 'update' command to update the existing app."
        exit 1
    fi

    # Create the app
    doctl apps create --spec "$APP_SPEC" --wait

    log_success "App created successfully!"

    # Show app URL
    cmd_status
}

cmd_update() {
    log_info "Updating app: ${APP_NAME}..."

    cd "$PROJECT_ROOT"

    # Get app ID
    APP_ID=$(get_app_id)
    if [ -z "$APP_ID" ]; then
        log_error "App not found: ${APP_NAME}"
        log_info "Use 'create' command to create a new app."
        exit 1
    fi

    log_info "Found app ID: ${APP_ID}"

    # Update the app
    doctl apps update "$APP_ID" --spec "$APP_SPEC" --wait

    log_success "App updated successfully!"

    # Show app URL
    cmd_status
}

cmd_deploy() {
    log_info "Deploying app: ${APP_NAME}..."

    cd "$PROJECT_ROOT"

    # Check if app exists
    APP_ID=$(get_app_id)

    if [ -z "$APP_ID" ]; then
        log_info "App does not exist. Creating new app..."
        cmd_create
    else
        log_info "App exists. Updating..."
        cmd_update
    fi
}

cmd_status() {
    log_info "Checking app status..."

    APP_ID=$(get_app_id)
    if [ -z "$APP_ID" ]; then
        log_error "App not found: ${APP_NAME}"
        exit 1
    fi

    echo ""
    echo "=========================================="
    echo "  App Status: ${APP_NAME}"
    echo "=========================================="
    echo ""

    # Get app info
    doctl apps get "$APP_ID" --format ID,Spec.Name,DefaultIngress,ActiveDeployment.Phase,Region,UpdatedAt

    echo ""

    # Get deployments
    log_info "Recent deployments:"
    doctl apps list-deployments "$APP_ID" --format ID,Phase,Progress,CreatedAt --no-header | head -5

    echo ""

    # Get live URL
    LIVE_URL=$(doctl apps get "$APP_ID" --format DefaultIngress --no-header 2>/dev/null || echo "")
    if [ -n "$LIVE_URL" ]; then
        log_success "Live URL: ${LIVE_URL}"

        # Health check
        log_info "Checking health endpoint..."
        if curl -sf "${LIVE_URL}/health" > /dev/null 2>&1; then
            log_success "Health check passed!"
        else
            log_warn "Health check failed or endpoint not ready."
        fi
    fi
}

cmd_logs() {
    log_info "Streaming logs for: ${APP_NAME}..."

    APP_ID=$(get_app_id)
    if [ -z "$APP_ID" ]; then
        log_error "App not found: ${APP_NAME}"
        exit 1
    fi

    # Stream logs
    doctl apps logs "$APP_ID" --follow
}

cmd_destroy() {
    log_warn "This will permanently delete the app: ${APP_NAME}"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled."
        exit 0
    fi

    APP_ID=$(get_app_id)
    if [ -z "$APP_ID" ]; then
        log_error "App not found: ${APP_NAME}"
        exit 1
    fi

    log_info "Deleting app..."
    doctl apps delete "$APP_ID" --force

    log_success "App deleted successfully!"
}

cmd_help() {
    echo "=========================================="
    echo "  esm.do DigitalOcean Deployment"
    echo "=========================================="
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  create    Create a new app from the spec"
    echo "  update    Update an existing app"
    echo "  deploy    Create or update the app (recommended)"
    echo "  status    Show app status and URL"
    echo "  logs      Stream app logs"
    echo "  destroy   Delete the app"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy        # Deploy the app"
    echo "  $0 status        # Check deployment status"
    echo "  $0 logs          # Stream logs"
    echo ""
    echo "Environment Variables:"
    echo "  DIGITALOCEAN_ACCESS_TOKEN   API token (or use doctl auth init)"
    echo ""
    echo "Documentation:"
    echo "  https://docs.digitalocean.com/products/app-platform/"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
    local command="${1:-help}"

    # Run preflight checks for commands that need them
    case "$command" in
        create|update|deploy|status|logs|destroy)
            preflight_checks
            echo ""
            ;;
    esac

    # Execute command
    case "$command" in
        create)
            cmd_create
            ;;
        update)
            cmd_update
            ;;
        deploy)
            cmd_deploy
            ;;
        status)
            cmd_status
            ;;
        logs)
            cmd_logs
            ;;
        destroy)
            cmd_destroy
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"

#!/bin/bash
# Netlify deployment script for esm.do
#
# Usage:
#   ./deploy/netlify/deploy.sh [command]
#
# Commands:
#   deploy    - Deploy to Netlify (default)
#   dev       - Start local development server
#   build     - Build the project locally
#   status    - Check deployment status
#   logs      - View deployment logs
#   env       - Set environment variables

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SITE_NAME="${NETLIFY_SITE_NAME:-esm-do}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
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
}

# Check if Netlify CLI is installed
check_cli() {
    if ! command -v netlify &> /dev/null; then
        log_error "Netlify CLI not found. Install with: npm install -g netlify-cli"
        exit 1
    fi
    log_info "Netlify CLI version: $(netlify --version)"
}

# Check authentication
check_auth() {
    if ! netlify status &> /dev/null; then
        log_warning "Not logged in to Netlify. Running 'netlify login'..."
        netlify login
    fi
    log_info "Authenticated with Netlify"
}

# Initialize site if not exists
init_site() {
    log_info "Checking if site exists..."

    if ! netlify sites:list | grep -q "$SITE_NAME"; then
        log_info "Creating new Netlify site: $SITE_NAME"
        cd "$SCRIPT_DIR"
        netlify sites:create --name "$SITE_NAME"
    else
        log_info "Site '$SITE_NAME' already exists"
    fi
}

# Link to site
link_site() {
    log_info "Linking to Netlify site..."
    cd "$SCRIPT_DIR"

    if [ ! -f ".netlify/state.json" ]; then
        netlify link --name "$SITE_NAME"
    else
        log_info "Already linked to site"
    fi
}

# Build the project
build() {
    log_info "Building project..."
    cd "$PROJECT_ROOT"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install
    fi

    # Build TypeScript
    log_info "Compiling TypeScript..."
    npm run build

    # Create public directory for static assets
    mkdir -p "$SCRIPT_DIR/public"

    # Create a simple index.html for root path fallback
    cat > "$SCRIPT_DIR/public/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>esm.do - Living ESM Modules</title>
    <script>
        // Redirect to API on JavaScript-enabled browsers
        window.location.href = '/@math/add';
    </script>
</head>
<body>
    <h1>esm.do</h1>
    <p>Living ESM modules for AI agents</p>
    <p><a href="https://github.com/dot-do/esm">Documentation</a></p>
</body>
</html>
EOF

    log_success "Build complete"
}

# Deploy to Netlify
deploy() {
    log_info "Deploying to Netlify..."
    cd "$SCRIPT_DIR"

    # Ensure we have a public directory
    mkdir -p public

    # Deploy
    netlify deploy --prod --dir=public --functions=netlify/edge-functions

    log_success "Deployment complete!"
    log_info "Site URL: https://$SITE_NAME.netlify.app"
}

# Start local development server
dev() {
    log_info "Starting local development server..."
    cd "$SCRIPT_DIR"

    netlify dev --port 8888 --target-port 8787
}

# Check deployment status
status() {
    log_info "Checking deployment status..."
    cd "$SCRIPT_DIR"

    netlify status

    echo ""
    log_info "Recent deploys:"
    netlify deploys --json | jq -r '.[] | "\(.state) - \(.created_at) - \(.deploy_url)"' | head -5
}

# View logs
logs() {
    log_info "Viewing edge function logs..."
    cd "$SCRIPT_DIR"

    netlify logs:function esm
}

# Set environment variables
set_env() {
    log_info "Setting environment variables..."
    cd "$SCRIPT_DIR"

    # Set from environment or prompt
    if [ -n "$ESM_API_KEY" ]; then
        netlify env:set ESM_API_KEY "$ESM_API_KEY"
        log_success "Set ESM_API_KEY"
    fi

    if [ -n "$ESM_STORAGE_KEY" ]; then
        netlify env:set ESM_STORAGE_KEY "$ESM_STORAGE_KEY"
        log_success "Set ESM_STORAGE_KEY"
    fi

    if [ -n "$ESM_AUTH_TOKEN" ]; then
        netlify env:set ESM_AUTH_TOKEN "$ESM_AUTH_TOKEN"
        log_success "Set ESM_AUTH_TOKEN"
    fi

    log_info "Current environment variables:"
    netlify env:list
}

# Main function
main() {
    local command="${1:-deploy}"

    echo "========================================"
    echo "  esm.do Netlify Deployment"
    echo "========================================"
    echo ""

    case "$command" in
        deploy)
            check_cli
            check_auth
            init_site
            link_site
            build
            deploy
            ;;
        dev)
            check_cli
            dev
            ;;
        build)
            build
            ;;
        status)
            check_cli
            check_auth
            link_site
            status
            ;;
        logs)
            check_cli
            check_auth
            link_site
            logs
            ;;
        env)
            check_cli
            check_auth
            link_site
            set_env
            ;;
        help|--help|-h)
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  deploy    Deploy to Netlify (default)"
            echo "  dev       Start local development server"
            echo "  build     Build the project locally"
            echo "  status    Check deployment status"
            echo "  logs      View edge function logs"
            echo "  env       Set environment variables"
            echo "  help      Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  NETLIFY_SITE_NAME   Site name (default: esm-do)"
            echo "  ESM_API_KEY         API authentication key"
            echo "  ESM_STORAGE_KEY     Storage encryption key"
            echo "  ESM_AUTH_TOKEN      Auth token for protected namespaces"
            ;;
        *)
            log_error "Unknown command: $command"
            log_info "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

main "$@"

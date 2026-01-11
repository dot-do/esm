#!/bin/bash
#
# Fastly Compute@Edge Deployment Script for esm.do
#
# This script handles the complete deployment lifecycle for esm.do
# on Fastly's Compute@Edge platform.
#
# Usage:
#   ./deploy.sh [command] [options]
#
# Commands:
#   build       Build the Compute@Edge package
#   deploy      Deploy to Fastly (staging by default)
#   production  Deploy to production
#   serve       Run local development server
#   validate    Validate the fastly.toml configuration
#   logs        Tail production logs
#   status      Show service status
#   rollback    Rollback to previous version
#   help        Show this help message

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FASTLY_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Check prerequisites
check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check for Fastly CLI
  if ! command -v fastly &> /dev/null; then
    log_error "Fastly CLI not found. Install with: brew install fastly/tap/fastly"
    log_info "Or download from: https://developer.fastly.com/learning/tools/cli/"
    exit 1
  fi

  # Check for Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js 18+"
    exit 1
  fi

  # Check Node.js version
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 18+ required. Current version: $(node -v)"
    exit 1
  fi

  # Check for npm
  if ! command -v npm &> /dev/null; then
    log_error "npm not found. Please install npm"
    exit 1
  fi

  # Check Fastly authentication
  if ! fastly whoami &> /dev/null 2>&1; then
    log_warning "Not logged in to Fastly. Running 'fastly profile create'..."
    fastly profile create
  fi

  log_success "All prerequisites met"
}

# Install dependencies
install_deps() {
  log_info "Installing dependencies..."
  cd "$FASTLY_DIR"

  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi

  log_success "Dependencies installed"
}

# Build the project
build() {
  log_info "Building Compute@Edge package..."
  cd "$FASTLY_DIR"

  # Install deps if node_modules doesn't exist
  if [ ! -d "node_modules" ]; then
    install_deps
  fi

  # Run the build
  npm run build

  # Validate the output
  if [ ! -f "bin/index.js" ]; then
    log_error "Build failed: bin/index.js not found"
    exit 1
  fi

  log_success "Build complete: bin/index.js"
}

# Validate configuration
validate() {
  log_info "Validating Fastly configuration..."
  cd "$FASTLY_DIR"

  fastly compute validate

  log_success "Configuration is valid"
}

# Deploy to staging/development
deploy() {
  log_info "Deploying to Fastly Compute@Edge..."
  cd "$FASTLY_DIR"

  build

  # Check if service exists
  if [ -n "$FASTLY_SERVICE_ID" ]; then
    log_info "Using service ID: $FASTLY_SERVICE_ID"
    fastly compute deploy --service-id "$FASTLY_SERVICE_ID"
  else
    fastly compute deploy
  fi

  log_success "Deployment complete"
}

# Deploy to production
deploy_production() {
  log_info "Deploying to PRODUCTION..."
  cd "$FASTLY_DIR"

  # Confirm production deployment
  echo -e "${YELLOW}WARNING: You are about to deploy to PRODUCTION${NC}"
  read -p "Are you sure? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    log_info "Deployment cancelled"
    exit 0
  fi

  build

  # Deploy and activate immediately
  if [ -n "$FASTLY_SERVICE_ID" ]; then
    fastly compute deploy --service-id "$FASTLY_SERVICE_ID" --activate
  else
    fastly compute deploy --activate
  fi

  log_success "Production deployment complete and activated"
}

# Run local development server
serve() {
  log_info "Starting local development server..."
  cd "$FASTLY_DIR"

  # Build first
  NODE_ENV=development npm run build

  # Start the local server
  fastly compute serve

  log_info "Local server stopped"
}

# View logs
logs() {
  log_info "Tailing logs..."
  cd "$FASTLY_DIR"

  if [ -n "$FASTLY_SERVICE_ID" ]; then
    fastly log-tail --service-id "$FASTLY_SERVICE_ID"
  else
    fastly log-tail
  fi
}

# Show service status
status() {
  log_info "Checking service status..."
  cd "$FASTLY_DIR"

  if [ -n "$FASTLY_SERVICE_ID" ]; then
    fastly service describe --service-id "$FASTLY_SERVICE_ID"
  else
    fastly service describe
  fi

  echo ""
  log_info "Recent versions:"
  fastly service-version list --json 2>/dev/null | head -20 || fastly service-version list
}

# Rollback to previous version
rollback() {
  log_info "Rolling back to previous version..."
  cd "$FASTLY_DIR"

  # Get the current active version
  CURRENT=$(fastly service-version list --json 2>/dev/null | jq -r '.[] | select(.active == true) | .number' || echo "")

  if [ -z "$CURRENT" ]; then
    log_error "Could not determine current version"
    exit 1
  fi

  PREVIOUS=$((CURRENT - 1))

  if [ "$PREVIOUS" -lt 1 ]; then
    log_error "No previous version to rollback to"
    exit 1
  fi

  log_info "Rolling back from version $CURRENT to version $PREVIOUS..."

  fastly service-version activate --version "$PREVIOUS"

  log_success "Rollback complete. Version $PREVIOUS is now active"
}

# Show help
show_help() {
  cat << EOF
Fastly Compute@Edge Deployment Script for esm.do

Usage:
  ./deploy.sh [command] [options]

Commands:
  build       Build the Compute@Edge package
  deploy      Deploy to Fastly (creates new version, doesn't activate)
  production  Deploy to production (builds, deploys, and activates)
  serve       Run local development server with hot reload
  validate    Validate the fastly.toml configuration
  logs        Tail production logs in real-time
  status      Show service status and recent versions
  rollback    Rollback to the previous active version
  help        Show this help message

Environment Variables:
  FASTLY_SERVICE_ID    Fastly service ID (optional, read from fastly.toml)
  FASTLY_API_TOKEN     Fastly API token for authentication

Examples:
  # Local development
  ./deploy.sh serve

  # Deploy to staging
  ./deploy.sh deploy

  # Deploy to production
  ./deploy.sh production

  # View logs
  ./deploy.sh logs

  # Rollback a bad deployment
  ./deploy.sh rollback

Prerequisites:
  - Fastly CLI: brew install fastly/tap/fastly
  - Node.js 18+
  - Fastly account with API token

For more information:
  https://developer.fastly.com/learning/compute/
EOF
}

# Main command handler
case "${1:-help}" in
  build)
    check_prerequisites
    build
    ;;
  deploy)
    check_prerequisites
    deploy
    ;;
  production)
    check_prerequisites
    deploy_production
    ;;
  serve)
    check_prerequisites
    serve
    ;;
  validate)
    check_prerequisites
    validate
    ;;
  logs)
    logs
    ;;
  status)
    status
    ;;
  rollback)
    rollback
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    log_error "Unknown command: $1"
    echo ""
    show_help
    exit 1
    ;;
esac

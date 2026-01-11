#!/usr/bin/env bash
#
# AWS Lambda Deployment Script for esm.do
#
# This script handles the complete deployment workflow:
# 1. Install dependencies
# 2. Build the TypeScript handler
# 3. Deploy to AWS via Serverless Framework
#
# Usage:
#   ./deploy.sh [stage] [region]
#
# Arguments:
#   stage   - Deployment stage (dev, staging, prod). Default: dev
#   region  - AWS region. Default: us-east-1
#
# Environment Variables:
#   AWS_PROFILE           - AWS CLI profile to use
#   ESM_DOMAIN            - Custom domain for the API (optional)
#   ESM_CERTIFICATE_NAME  - ACM certificate name for custom domain
#   ESM_S3_BUCKET         - S3 bucket for module storage
#   ESM_DYNAMODB_TABLE    - DynamoDB table for metadata
#   ESM_CREATE_RESOURCES  - Set to 'true' to create S3/DynamoDB resources
#
# Examples:
#   ./deploy.sh                    # Deploy to dev in us-east-1
#   ./deploy.sh prod               # Deploy to prod in us-east-1
#   ./deploy.sh staging eu-west-1  # Deploy to staging in eu-west-1
#

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

# Parse arguments
STAGE="${1:-dev}"
REGION="${2:-us-east-1}"

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

  # Check Node.js
  if ! command -v node &>/dev/null; then
    log_error "Node.js is not installed. Please install Node.js 20.x or later."
    exit 1
  fi

  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js version must be 18 or later. Current: $(node -v)"
    exit 1
  fi
  log_success "Node.js $(node -v) detected"

  # Check npm or pnpm
  if command -v pnpm &>/dev/null; then
    PKG_MANAGER="pnpm"
  elif command -v npm &>/dev/null; then
    PKG_MANAGER="npm"
  else
    log_error "Neither npm nor pnpm is installed."
    exit 1
  fi
  log_success "Package manager: $PKG_MANAGER"

  # Check AWS CLI
  if ! command -v aws &>/dev/null; then
    log_warning "AWS CLI is not installed. Some features may not work."
  else
    log_success "AWS CLI detected"
  fi

  # Check serverless
  if ! command -v serverless &>/dev/null && ! npx serverless --version &>/dev/null; then
    log_warning "Serverless Framework not found globally. Will use npx."
  fi
}

# Install dependencies
install_dependencies() {
  log_info "Installing dependencies..."

  cd "$PROJECT_ROOT"
  if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm install
  else
    npm install
  fi

  cd "$SCRIPT_DIR"
  if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm install
  else
    npm install
  fi

  log_success "Dependencies installed"
}

# Build the project
build_project() {
  log_info "Building project..."

  # Build the main project first
  cd "$PROJECT_ROOT"
  if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm run build
  else
    npm run build
  fi
  log_success "Main project built"

  # Build the Lambda handler
  cd "$SCRIPT_DIR"
  if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm run build:prod
  else
    npm run build:prod
  fi
  log_success "Lambda handler built"
}

# Deploy to AWS
deploy_to_aws() {
  log_info "Deploying to AWS..."
  log_info "  Stage: $STAGE"
  log_info "  Region: $REGION"

  cd "$SCRIPT_DIR"

  # Set AWS region
  export AWS_DEFAULT_REGION="$REGION"

  # Deploy using Serverless Framework
  local SLS_CMD="serverless"
  if ! command -v serverless &>/dev/null; then
    SLS_CMD="npx serverless"
  fi

  # Build deploy command
  local DEPLOY_CMD="$SLS_CMD deploy --stage $STAGE --region $REGION"

  # Add verbose flag for debugging
  if [ "${VERBOSE:-false}" = "true" ]; then
    DEPLOY_CMD="$DEPLOY_CMD --verbose"
  fi

  log_info "Running: $DEPLOY_CMD"

  if $DEPLOY_CMD; then
    log_success "Deployment complete!"
  else
    log_error "Deployment failed"
    exit 1
  fi
}

# Get deployment info
show_deployment_info() {
  log_info "Getting deployment info..."

  cd "$SCRIPT_DIR"

  local SLS_CMD="serverless"
  if ! command -v serverless &>/dev/null; then
    SLS_CMD="npx serverless"
  fi

  $SLS_CMD info --stage "$STAGE" --region "$REGION"
}

# Setup custom domain (optional)
setup_custom_domain() {
  if [ -z "${ESM_DOMAIN:-}" ]; then
    log_info "No custom domain configured (ESM_DOMAIN not set)"
    return
  fi

  log_info "Setting up custom domain: $ESM_DOMAIN"

  cd "$SCRIPT_DIR"

  local SLS_CMD="serverless"
  if ! command -v serverless &>/dev/null; then
    SLS_CMD="npx serverless"
  fi

  if $SLS_CMD create_domain --stage "$STAGE" --region "$REGION"; then
    log_success "Custom domain created"
  else
    log_warning "Custom domain setup failed (may already exist)"
  fi
}

# Main function
main() {
  echo ""
  echo "=========================================="
  echo "  esm.do AWS Lambda Deployment"
  echo "=========================================="
  echo ""

  check_prerequisites
  echo ""

  install_dependencies
  echo ""

  build_project
  echo ""

  # Setup custom domain if configured
  if [ -n "${ESM_DOMAIN:-}" ]; then
    setup_custom_domain
    echo ""
  fi

  deploy_to_aws
  echo ""

  show_deployment_info
  echo ""

  echo "=========================================="
  log_success "Deployment complete!"
  echo ""
  echo "To view logs:"
  echo "  cd $SCRIPT_DIR && $PKG_MANAGER run logs:$STAGE"
  echo ""
  echo "To remove deployment:"
  echo "  cd $SCRIPT_DIR && $PKG_MANAGER run remove:$STAGE"
  echo "=========================================="
}

# Run main function
main "$@"

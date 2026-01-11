#!/bin/bash
# deploy.sh - Deploy esm.do to Google Cloud Run
#
# This script handles the complete deployment process:
# 1. Creates Artifact Registry repository (if needed)
# 2. Builds and pushes Docker image
# 3. Deploys to Cloud Run
#
# Usage:
#   ./deploy.sh                    # Deploy with defaults
#   ./deploy.sh --project my-proj  # Deploy to specific project
#   ./deploy.sh --region us-west1  # Deploy to specific region
#   ./deploy.sh --build-only       # Only build and push image
#   ./deploy.sh --deploy-only      # Only deploy (image must exist)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration defaults
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-esm-do}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"

# Resource configuration
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MEMORY="${MEMORY:-512Mi}"
CPU="${CPU:-1}"
CONCURRENCY="${CONCURRENCY:-80}"
TIMEOUT="${TIMEOUT:-300}"

# Flags
BUILD_ONLY=false
DEPLOY_ONLY=false
USE_CLOUD_BUILD=false
VERBOSE=false

# Print colored output
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project)
            PROJECT_ID="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --service)
            SERVICE_NAME="$2"
            shift 2
            ;;
        --tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --deploy-only)
            DEPLOY_ONLY=true
            shift
            ;;
        --cloud-build)
            USE_CLOUD_BUILD=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            set -x
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --project PROJECT_ID    GCP project ID (default: current gcloud config)"
            echo "  --region REGION         Cloud Run region (default: us-central1)"
            echo "  --service NAME          Service name (default: esm-do)"
            echo "  --tag TAG               Image tag (default: git short SHA)"
            echo "  --build-only            Only build and push image"
            echo "  --deploy-only           Only deploy (skip build)"
            echo "  --cloud-build           Use Cloud Build instead of local Docker"
            echo "  --verbose               Enable verbose output"
            echo "  --help                  Show this help"
            echo ""
            echo "Environment variables:"
            echo "  PROJECT_ID, REGION, SERVICE_NAME, IMAGE_TAG"
            echo "  MIN_INSTANCES, MAX_INSTANCES, MEMORY, CPU, CONCURRENCY, TIMEOUT"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required configuration
if [[ -z "$PROJECT_ID" ]]; then
    error "PROJECT_ID is required. Set via --project or 'gcloud config set project PROJECT_ID'"
    exit 1
fi

# Derived variables
ARTIFACT_REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}"
IMAGE_URI="${ARTIFACT_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}"
IMAGE_LATEST="${ARTIFACT_REGISTRY}/${SERVICE_NAME}:latest"

log "Configuration:"
echo "  Project:    $PROJECT_ID"
echo "  Region:     $REGION"
echo "  Service:    $SERVICE_NAME"
echo "  Image Tag:  $IMAGE_TAG"
echo "  Image URI:  $IMAGE_URI"
echo ""

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Step 1: Enable required APIs
enable_apis() {
    log "Enabling required GCP APIs..."
    gcloud services enable \
        run.googleapis.com \
        artifactregistry.googleapis.com \
        cloudbuild.googleapis.com \
        --project="$PROJECT_ID" \
        --quiet
    success "APIs enabled"
}

# Step 2: Create Artifact Registry repository
create_repository() {
    log "Creating Artifact Registry repository..."
    if gcloud artifacts repositories describe "$SERVICE_NAME" \
        --location="$REGION" \
        --project="$PROJECT_ID" &>/dev/null; then
        log "Repository already exists"
    else
        gcloud artifacts repositories create "$SERVICE_NAME" \
            --repository-format=docker \
            --location="$REGION" \
            --description="Docker images for $SERVICE_NAME" \
            --project="$PROJECT_ID"
        success "Repository created"
    fi
}

# Step 3: Configure Docker authentication
configure_docker() {
    log "Configuring Docker authentication for Artifact Registry..."
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
    success "Docker authentication configured"
}

# Step 4: Build and push image
build_and_push() {
    if [[ "$USE_CLOUD_BUILD" == "true" ]]; then
        log "Building with Cloud Build..."
        gcloud builds submit \
            --config=deploy/gcp/cloudbuild.yaml \
            --substitutions="_REGION=${REGION},_SERVICE_NAME=${SERVICE_NAME}" \
            --project="$PROJECT_ID" \
            .
        success "Cloud Build completed"
    else
        log "Building Docker image locally..."
        docker build \
            -t "$IMAGE_URI" \
            -t "$IMAGE_LATEST" \
            -f deploy/gcp/Dockerfile \
            .
        success "Docker image built"

        log "Pushing image to Artifact Registry..."
        docker push "$IMAGE_URI"
        docker push "$IMAGE_LATEST"
        success "Image pushed to Artifact Registry"
    fi
}

# Step 5: Deploy to Cloud Run
deploy_service() {
    log "Deploying to Cloud Run..."
    gcloud run deploy "$SERVICE_NAME" \
        --image="$IMAGE_URI" \
        --region="$REGION" \
        --platform=managed \
        --allow-unauthenticated \
        --port=8080 \
        --memory="$MEMORY" \
        --cpu="$CPU" \
        --min-instances="$MIN_INSTANCES" \
        --max-instances="$MAX_INSTANCES" \
        --concurrency="$CONCURRENCY" \
        --timeout="${TIMEOUT}s" \
        --set-env-vars="NODE_ENV=production" \
        --labels="app=${SERVICE_NAME},managed-by=deploy-script" \
        --project="$PROJECT_ID"
    success "Deployed to Cloud Run"
}

# Step 6: Get service URL
get_service_url() {
    log "Getting service URL..."
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(status.url)")

    echo ""
    success "Deployment complete!"
    echo ""
    echo "  Service URL: $SERVICE_URL"
    echo "  Health check: $SERVICE_URL/health"
    echo ""
    echo "  View logs:"
    echo "    gcloud run logs read --service=$SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
    echo ""
    echo "  View in console:"
    echo "    https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME?project=$PROJECT_ID"
}

# Main execution
main() {
    echo ""
    echo "======================================"
    echo "  esm.do Cloud Run Deployment"
    echo "======================================"
    echo ""

    enable_apis

    if [[ "$DEPLOY_ONLY" != "true" ]]; then
        create_repository
        configure_docker
        build_and_push
    fi

    if [[ "$BUILD_ONLY" != "true" ]]; then
        deploy_service
        get_service_url
    else
        success "Build complete. Image: $IMAGE_URI"
    fi
}

main

# Google Cloud Run Deployment

Deploy esm.do to Google Cloud Run for serverless container hosting.

## Prerequisites

1. **Google Cloud SDK** installed and configured
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Docker** installed (for local builds)

3. **Required GCP APIs** enabled (the deploy script handles this):
   - Cloud Run API
   - Artifact Registry API
   - Cloud Build API

## Quick Start

```bash
# Make deploy script executable
chmod +x deploy/gcp/deploy.sh

# Deploy with defaults
./deploy/gcp/deploy.sh

# Deploy to specific project and region
./deploy/gcp/deploy.sh --project my-project --region us-west1
```

## Deployment Options

### Option 1: Using deploy.sh (Recommended)

The `deploy.sh` script handles the complete deployment process:

```bash
# Full deployment (build + deploy)
./deploy/gcp/deploy.sh

# Build only (push to Artifact Registry)
./deploy/gcp/deploy.sh --build-only

# Deploy only (use existing image)
./deploy/gcp/deploy.sh --deploy-only

# Use Cloud Build instead of local Docker
./deploy/gcp/deploy.sh --cloud-build

# Custom configuration
./deploy/gcp/deploy.sh \
  --project my-project \
  --region us-central1 \
  --service esm-do \
  --tag v1.0.0
```

### Option 2: Using Cloud Build

Trigger a build using Cloud Build:

```bash
gcloud builds submit \
  --config=deploy/gcp/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE_NAME=esm-do
```

### Option 3: Manual Deployment

```bash
# Set variables
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1
export SERVICE_NAME=esm-do

# Build and push image
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest \
  -f deploy/gcp/Dockerfile .
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated
```

### Option 4: Using service.yaml

For declarative deployments with more control:

```bash
# Edit service.yaml to set PROJECT_ID and REGION
gcloud run services replace deploy/gcp/service.yaml --region=us-central1
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ID` | Current gcloud project | GCP project ID |
| `REGION` | `us-central1` | Cloud Run region |
| `SERVICE_NAME` | `esm-do` | Service name |
| `IMAGE_TAG` | Git SHA | Docker image tag |
| `MIN_INSTANCES` | `0` | Minimum instances (0 = scale to zero) |
| `MAX_INSTANCES` | `10` | Maximum instances |
| `MEMORY` | `512Mi` | Memory per instance |
| `CPU` | `1` | CPU per instance |
| `CONCURRENCY` | `80` | Max concurrent requests per instance |
| `TIMEOUT` | `300` | Request timeout (seconds) |

### Resource Recommendations

| Workload | Memory | CPU | Max Instances |
|----------|--------|-----|---------------|
| Development | 256Mi | 0.5 | 2 |
| Production | 512Mi | 1 | 10 |
| High Traffic | 1Gi | 2 | 100 |

## Architecture

```
                    +------------------+
                    |   Cloud Load     |
                    |   Balancer       |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Cloud Run      |
                    |   Service        |
                    +--------+---------+
                             |
         +-------------------+-------------------+
         |                   |                   |
+--------v-------+  +--------v-------+  +--------v-------+
|   Container    |  |   Container    |  |   Container    |
|   Instance 1   |  |   Instance 2   |  |   Instance N   |
+----------------+  +----------------+  +----------------+
         |
+--------v---------+
| Miniflare/       |
| Wrangler Local   |
| (Emulates CF     |
|  Workers runtime)|
+------------------+
```

## Monitoring

### View Logs

```bash
# Stream logs
gcloud run logs tail --service=esm-do --region=us-central1

# View recent logs
gcloud run logs read --service=esm-do --region=us-central1 --limit=100
```

### Cloud Console

- **Service Dashboard**: https://console.cloud.google.com/run
- **Logs**: https://console.cloud.google.com/logs
- **Monitoring**: https://console.cloud.google.com/monitoring

### Health Check

The service exposes a `/health` endpoint:

```bash
SERVICE_URL=$(gcloud run services describe esm-do --region=us-central1 --format='value(status.url)')
curl ${SERVICE_URL}/health
```

## Cost Optimization

1. **Scale to Zero**: Set `MIN_INSTANCES=0` to avoid costs when idle
2. **CPU Throttling**: Enabled by default to reduce costs during idle time
3. **Right-size Resources**: Start with 256Mi/0.5 CPU and scale up as needed
4. **Regional Deployment**: Deploy to region closest to users

## Troubleshooting

### Container Fails to Start

```bash
# Check logs
gcloud run logs read --service=esm-do --region=us-central1

# Check revision status
gcloud run revisions list --service=esm-do --region=us-central1
```

### Permission Errors

```bash
# Ensure Cloud Run Admin role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=user:YOUR_EMAIL \
  --role=roles/run.admin

# Enable Artifact Registry access
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=user:YOUR_EMAIL \
  --role=roles/artifactregistry.writer
```

### Image Not Found

```bash
# List images in registry
gcloud artifacts docker images list \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/esm-do

# Verify image exists
gcloud artifacts docker images describe \
  ${REGION}-docker.pkg.dev/${PROJECT_ID}/esm-do/esm-do:latest
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Deploy
        run: |
          gcloud builds submit \
            --config=deploy/gcp/cloudbuild.yaml \
            --substitutions=_REGION=us-central1
```

### Cloud Build Triggers

Set up automatic deployments via Cloud Build triggers in the GCP Console:

1. Go to Cloud Build > Triggers
2. Create trigger connected to your repository
3. Configure to use `deploy/gcp/cloudbuild.yaml`
4. Set trigger on push to main branch

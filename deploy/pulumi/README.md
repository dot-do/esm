# esm.do Pulumi Infrastructure

This directory contains Pulumi TypeScript infrastructure as code for deploying the esm.do worker across multiple cloud platforms.

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/) installed
- [Node.js](https://nodejs.org/) >= 18.x
- Cloud provider credentials configured (see provider-specific sections below)

## Quick Start

```bash
# Navigate to the Pulumi directory
cd deploy/pulumi

# Install dependencies
npm install

# Login to Pulumi (uses local backend by default, or configure cloud backend)
pulumi login --local
# or
pulumi login  # for Pulumi Cloud

# Select or create a stack
pulumi stack select dev
# or
pulumi stack init dev

# Preview changes
pulumi preview

# Deploy
pulumi up

# Destroy (when needed)
pulumi destroy
```

## Project Structure

```
deploy/pulumi/
├── Pulumi.yaml           # Project configuration
├── Pulumi.dev.yaml       # Development environment config
├── Pulumi.staging.yaml   # Staging environment config
├── Pulumi.prod.yaml      # Production environment config
├── index.ts              # Main entry point
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript configuration
└── stacks/
    ├── aws.ts            # AWS Lambda + API Gateway
    ├── gcp.ts            # GCP Cloud Run
    ├── azure.ts          # Azure Functions
    ├── cloudflare.ts     # Cloudflare Workers
    └── kubernetes.ts     # Kubernetes deployment
```

## Stack Selection

By default, only Cloudflare Workers is enabled. Enable other stacks via configuration:

```bash
# Enable specific stacks
pulumi config set esm-do:enableAws true
pulumi config set esm-do:enableGcp true
pulumi config set esm-do:enableAzure true
pulumi config set esm-do:enableKubernetes true
```

## Cloud Provider Configuration

### Cloudflare Workers (Default)

```bash
# Set Cloudflare credentials
pulumi config set cloudflare:accountId YOUR_ACCOUNT_ID
pulumi config set cloudflare:apiToken YOUR_API_TOKEN --secret

# Optional: Custom domain
pulumi config set esm-do:cloudflareCustomDomain esm.do
pulumi config set esm-do:cloudflareZoneId YOUR_ZONE_ID
```

### AWS Lambda + API Gateway

```bash
# Enable AWS stack
pulumi config set esm-do:enableAws true

# Configure AWS (credentials via environment or AWS CLI)
pulumi config set aws:region us-east-1
```

Required AWS permissions:
- Lambda: Create, update, delete functions
- API Gateway: Create, update, delete APIs
- IAM: Create roles and policies
- CloudWatch Logs: Write logs

### GCP Cloud Run

```bash
# Enable GCP stack
pulumi config set esm-do:enableGcp true

# Configure GCP
pulumi config set gcp:project YOUR_PROJECT_ID
pulumi config set gcp:region us-central1

# Optional: Custom domain
pulumi config set esm-do:gcpCustomDomain api.esm.do
```

Required GCP permissions:
- Cloud Run Admin
- Service Account User

### Azure Functions

```bash
# Enable Azure stack
pulumi config set esm-do:enableAzure true

# Configure Azure (credentials via Azure CLI or environment)
pulumi config set azure-native:location eastus
```

Required Azure permissions:
- Resource Group Contributor
- Function App Contributor
- Storage Account Contributor

### Kubernetes

```bash
# Enable Kubernetes stack
pulumi config set esm-do:enableKubernetes true

# Configure Kubernetes
pulumi config set kubernetes:kubeconfig /path/to/kubeconfig
pulumi config set kubernetes:image ghcr.io/dot-do/esm:latest

# Optional: Ingress host
pulumi config set esm-do:k8sIngressHost api.esm.do
```

## Environment Stacks

### Development

```bash
pulumi stack select dev
pulumi up
```

Development uses minimal resources and allows public access for testing.

### Staging

```bash
pulumi stack select staging
pulumi up
```

Staging mirrors production configuration with staging-specific domains.

### Production

```bash
pulumi stack select prod
pulumi up
```

Production includes:
- Auto-scaling configurations
- High availability settings
- Production domain bindings
- Monitoring and alerting

## Outputs

After deployment, view outputs:

```bash
pulumi stack output

# Example outputs:
# cloudflare:
#   workerUrl: https://esm-do-dev.workers.dev
#   workerName: esm-do-dev
# aws:
#   apiGatewayUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
#   lambdaArn: arn:aws:lambda:us-east-1:123456789:function:esm-do
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Setup Pulumi
  uses: pulumi/actions@v4

- name: Deploy Infrastructure
  uses: pulumi/actions@v4
  with:
    command: up
    stack-name: prod
    work-dir: deploy/pulumi
  env:
    PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Secrets Management

Sensitive values should be stored as Pulumi secrets:

```bash
# Store secrets (encrypted in state)
pulumi config set cloudflare:apiToken YOUR_TOKEN --secret
pulumi config set some:password YOUR_PASSWORD --secret
```

## Troubleshooting

### Common Issues

1. **Authentication errors**: Ensure cloud provider credentials are configured
2. **Quota limits**: Check cloud provider quotas and limits
3. **Dependency errors**: Run `npm install` to update dependencies

### Debugging

```bash
# Enable verbose logging
pulumi up --debug

# Preview with diff
pulumi preview --diff

# Export stack state
pulumi stack export > stack.json
```

## Resources

- [Pulumi Documentation](https://www.pulumi.com/docs/)
- [Pulumi TypeScript Reference](https://www.pulumi.com/docs/languages-sdks/javascript/)
- [esm.do Documentation](https://esm.do/docs)

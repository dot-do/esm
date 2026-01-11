# ESM Terraform Infrastructure

Terraform configurations for deploying ESM (ECMAScript Modules) service across multiple cloud providers: AWS Lambda, GCP Cloud Run, and Azure Functions.

## Directory Structure

```
deploy/terraform/
├── main.tf                    # Main configuration with module declarations
├── variables.tf               # Input variable definitions
├── outputs.tf                 # Output value definitions
├── .terraform-version         # Required Terraform version
├── modules/
│   ├── aws-lambda/            # AWS Lambda + API Gateway module
│   ├── gcp-cloud-run/         # GCP Cloud Run module
│   └── azure-functions/       # Azure Functions module
└── environments/
    ├── dev/                   # Development environment
    ├── staging/               # Staging environment
    └── prod/                  # Production environment
```

## Prerequisites

- Terraform >= 1.5.0
- AWS CLI configured with appropriate credentials
- GCP CLI (`gcloud`) configured with appropriate credentials
- Azure CLI configured with appropriate credentials
- S3 bucket for Terraform state (or configure alternative backend)

## Quick Start

### 1. Set up Terraform State Backend

Create an S3 bucket and DynamoDB table for state management:

```bash
aws s3 mb s3://esm-terraform-state --region us-east-1
aws dynamodb create-table \
  --table-name esm-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### 2. Deploy to Development Environment

```bash
cd deploy/terraform/environments/dev

# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Apply changes
terraform apply
```

### 3. Deploy to Staging Environment

```bash
cd deploy/terraform/environments/staging

# Create terraform.tfvars with required variables
cat > terraform.tfvars <<EOF
gcp_project_id      = "your-gcp-project"
gcp_container_image = "gcr.io/your-project/esm:latest"
alarm_email         = "staging-alerts@example.com"
EOF

terraform init
terraform plan
terraform apply
```

### 4. Deploy to Production Environment

```bash
cd deploy/terraform/environments/prod

# Create terraform.tfvars with required variables
cat > terraform.tfvars <<EOF
gcp_project_id           = "your-gcp-project-prod"
gcp_container_image      = "gcr.io/your-project/esm:v1.0.0"
azure_subscription_id    = "your-azure-subscription-id"
azure_resource_group_name = "esm-prod-rg"
azure_storage_account_name = "esmprodsa"
alarm_email              = "prod-alerts@example.com"
EOF

terraform init
terraform plan
terraform apply
```

## Module Usage

### Using Individual Modules

You can use modules independently in your own Terraform configurations:

```hcl
# AWS Lambda only
module "esm_lambda" {
  source = "github.com/your-org/esm//deploy/terraform/modules/aws-lambda"

  environment        = "prod"
  name_prefix        = "esm-prod"
  lambda_memory_size = 512
  lambda_timeout     = 30
  lambda_runtime     = "nodejs20.x"
  api_gateway_stage  = "v1"

  tags = {
    Project = "esm"
  }
}

# GCP Cloud Run only
module "esm_cloud_run" {
  source = "github.com/your-org/esm//deploy/terraform/modules/gcp-cloud-run"

  environment     = "prod"
  name_prefix     = "esm-prod"
  project_id      = "your-project"
  region          = "us-central1"
  container_image = "gcr.io/your-project/esm:latest"
  min_instances   = 1
  max_instances   = 10
}
```

## Configuration Variables

### Environment Selection

| Variable | Description | Default |
|----------|-------------|---------|
| `environment` | Deployment environment (dev, staging, prod) | - |
| `enable_aws` | Enable AWS Lambda deployment | `true` |
| `enable_gcp` | Enable GCP Cloud Run deployment | `false` |
| `enable_azure` | Enable Azure Functions deployment | `false` |

### AWS Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `lambda_memory_size` | Lambda memory in MB | `256` |
| `lambda_timeout` | Lambda timeout in seconds | `30` |
| `lambda_runtime` | Lambda runtime | `nodejs20.x` |
| `enable_xray_tracing` | Enable X-Ray tracing | `false` |

### GCP Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `gcp_project_id` | GCP project ID | - |
| `gcp_region` | GCP region | `us-central1` |
| `gcp_container_image` | Container image URL | - |
| `cloud_run_min_instances` | Minimum instances | `0` |
| `cloud_run_max_instances` | Maximum instances | `100` |
| `cloud_run_memory` | Memory allocation | `256Mi` |

### Azure Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `azure_subscription_id` | Azure subscription ID | - |
| `azure_location` | Azure location | `eastus` |
| `azure_resource_group_name` | Resource group name | - |
| `azure_app_service_plan_tier` | App service plan tier | `Dynamic` |
| `azure_function_runtime` | Function runtime | `node` |

### Scaling Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `scaling_config.min_capacity` | Minimum instances | `1` |
| `scaling_config.max_capacity` | Maximum instances | `10` |
| `scaling_config.target_cpu` | Target CPU percentage | `70` |

## Outputs

After deployment, you can retrieve service URLs and resource identifiers:

```bash
# Get all outputs
terraform output

# Get specific output
terraform output aws_api_gateway_url
terraform output service_urls
```

### Available Outputs

- `aws_api_gateway_url` - AWS API Gateway endpoint URL
- `aws_lambda_function_name` - Lambda function name
- `aws_lambda_function_arn` - Lambda function ARN
- `gcp_cloud_run_url` - GCP Cloud Run service URL
- `azure_function_app_url` - Azure Function App URL
- `service_urls` - Map of all deployed service URLs
- `resource_identifiers` - Map of all resource identifiers

## Security Considerations

1. **State File Security**: Terraform state contains sensitive information. Always use encrypted remote state backends.

2. **Secrets Management**: Never commit secrets to version control. Use:
   - AWS Secrets Manager / SSM Parameter Store
   - GCP Secret Manager
   - Azure Key Vault
   - Environment variables in CI/CD

3. **IAM Least Privilege**: Modules create IAM roles with minimal required permissions.

4. **Network Security**: Production environments enable VPC deployment for network isolation.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Infrastructure

on:
  push:
    branches: [main]
    paths: ['deploy/terraform/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.5.7

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Terraform Init
        working-directory: deploy/terraform/environments/prod
        run: terraform init

      - name: Terraform Plan
        working-directory: deploy/terraform/environments/prod
        run: terraform plan -out=tfplan

      - name: Terraform Apply
        working-directory: deploy/terraform/environments/prod
        run: terraform apply -auto-approve tfplan
```

## Troubleshooting

### Common Issues

1. **State Lock Error**: If Terraform state is locked, check for other running operations or manually release the lock:
   ```bash
   terraform force-unlock LOCK_ID
   ```

2. **Provider Authentication**: Ensure cloud provider CLIs are properly configured:
   ```bash
   aws sts get-caller-identity
   gcloud auth list
   az account show
   ```

3. **Version Mismatch**: Ensure you're using the correct Terraform version:
   ```bash
   tfenv use 1.5.7  # If using tfenv
   ```

## Contributing

1. Make changes to modules or environments
2. Run `terraform fmt -recursive` to format code
3. Run `terraform validate` to check syntax
4. Test in development environment before promoting to staging/production

## License

MIT License - See LICENSE file for details.

# ESM Staging Environment Configuration

terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "esm-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "esm-terraform-locks"
  }
}

module "esm" {
  source = "../../"

  environment = "staging"

  # Enable AWS and GCP for staging (multi-cloud testing)
  enable_aws   = true
  enable_gcp   = true
  enable_azure = false

  # AWS Configuration
  aws_region         = "us-east-1"
  lambda_memory_size = 512
  lambda_timeout     = 60
  lambda_runtime     = "nodejs20.x"
  enable_xray_tracing = true

  # GCP Configuration
  gcp_project_id      = var.gcp_project_id
  gcp_region          = "us-central1"
  gcp_container_image = var.gcp_container_image
  cloud_run_min_instances = 0
  cloud_run_max_instances = 10
  cloud_run_memory        = "512Mi"
  cloud_run_cpu           = "1"

  # Scaling Configuration (moderate for staging)
  scaling_config = {
    min_capacity       = 1
    max_capacity       = 10
    target_cpu         = 70
    scale_in_cooldown  = 180
    scale_out_cooldown = 60
  }

  # Monitoring (enabled for staging)
  enable_monitoring  = true
  log_retention_days = 14
  alarm_email        = var.alarm_email

  # VPC enabled for staging
  enable_vpc = true
  vpc_cidr   = "10.1.0.0/16"
}

# Variables specific to staging
variable "gcp_project_id" {
  description = "GCP project ID for staging"
  type        = string
}

variable "gcp_container_image" {
  description = "Container image for GCP Cloud Run"
  type        = string
}

variable "alarm_email" {
  description = "Email for staging alerts"
  type        = string
  default     = ""
}

# Staging-specific outputs
output "aws_api_url" {
  description = "AWS API Gateway URL for staging"
  value       = module.esm.aws_api_gateway_url
}

output "gcp_service_url" {
  description = "GCP Cloud Run URL for staging"
  value       = module.esm.gcp_cloud_run_url
}

output "service_urls" {
  description = "All service URLs"
  value       = module.esm.service_urls
}

output "deployment_summary" {
  description = "Deployment summary"
  value       = module.esm.deployment_summary
}

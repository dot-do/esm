# ESM Production Environment Configuration

terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "esm-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "esm-terraform-locks"
  }
}

module "esm" {
  source = "../../"

  environment = "prod"

  # Enable all cloud providers for production (multi-cloud resilience)
  enable_aws   = true
  enable_gcp   = true
  enable_azure = true

  # AWS Configuration
  aws_region         = "us-east-1"
  lambda_memory_size = 1024
  lambda_timeout     = 60
  lambda_runtime     = "nodejs20.x"
  enable_xray_tracing = true

  # GCP Configuration
  gcp_project_id      = var.gcp_project_id
  gcp_region          = "us-central1"
  gcp_container_image = var.gcp_container_image
  cloud_run_min_instances = 2
  cloud_run_max_instances = 100
  cloud_run_memory        = "1Gi"
  cloud_run_cpu           = "2"
  cloud_run_allow_unauthenticated = true

  # Azure Configuration
  azure_subscription_id     = var.azure_subscription_id
  azure_location            = "eastus"
  azure_resource_group_name = var.azure_resource_group_name
  azure_storage_account_name = var.azure_storage_account_name
  azure_app_service_plan_tier = "Standard"
  azure_app_service_plan_size = "S1"
  azure_function_runtime      = "node"

  # Scaling Configuration (production-grade)
  scaling_config = {
    min_capacity       = 2
    max_capacity       = 100
    target_cpu         = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }

  # Monitoring (full production monitoring)
  enable_monitoring  = true
  log_retention_days = 90
  alarm_email        = var.alarm_email

  # VPC enabled for production
  enable_vpc = true
  vpc_cidr   = "10.2.0.0/16"
}

# Variables specific to production
variable "gcp_project_id" {
  description = "GCP project ID for production"
  type        = string
}

variable "gcp_container_image" {
  description = "Container image for GCP Cloud Run"
  type        = string
}

variable "azure_subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "azure_resource_group_name" {
  description = "Azure resource group name"
  type        = string
}

variable "azure_storage_account_name" {
  description = "Azure storage account name"
  type        = string
}

variable "alarm_email" {
  description = "Email for production alerts"
  type        = string
}

# Production-specific outputs
output "aws_api_url" {
  description = "AWS API Gateway URL for production"
  value       = module.esm.aws_api_gateway_url
}

output "gcp_service_url" {
  description = "GCP Cloud Run URL for production"
  value       = module.esm.gcp_cloud_run_url
}

output "azure_function_url" {
  description = "Azure Functions URL for production"
  value       = module.esm.azure_function_app_url
}

output "service_urls" {
  description = "All service URLs"
  value       = module.esm.service_urls
}

output "resource_identifiers" {
  description = "All resource identifiers"
  value       = module.esm.resource_identifiers
}

output "deployment_summary" {
  description = "Deployment summary"
  value       = module.esm.deployment_summary
}

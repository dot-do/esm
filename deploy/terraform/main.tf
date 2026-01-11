# ESM Multi-Cloud Terraform Configuration
# Main configuration file for multi-cloud ESM module deployment

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  # Backend configuration - override per environment
  backend "s3" {}
}

# AWS Provider Configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# GCP Provider Configuration
provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# Azure Provider Configuration
provider "azurerm" {
  features {}

  subscription_id = var.azure_subscription_id
}

# Local values
locals {
  common_tags = {
    Project     = "esm"
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  name_prefix = "esm-${var.environment}"
}

# AWS Lambda Module
module "aws_lambda" {
  source = "./modules/aws-lambda"
  count  = var.enable_aws ? 1 : 0

  environment         = var.environment
  name_prefix         = local.name_prefix
  lambda_memory_size  = var.lambda_memory_size
  lambda_timeout      = var.lambda_timeout
  lambda_runtime      = var.lambda_runtime
  api_gateway_stage   = var.environment
  enable_xray_tracing = var.enable_xray_tracing

  tags = local.common_tags
}

# GCP Cloud Run Module
module "gcp_cloud_run" {
  source = "./modules/gcp-cloud-run"
  count  = var.enable_gcp ? 1 : 0

  environment           = var.environment
  name_prefix           = local.name_prefix
  project_id            = var.gcp_project_id
  region                = var.gcp_region
  container_image       = var.gcp_container_image
  min_instances         = var.cloud_run_min_instances
  max_instances         = var.cloud_run_max_instances
  memory                = var.cloud_run_memory
  cpu                   = var.cloud_run_cpu
  allow_unauthenticated = var.cloud_run_allow_unauthenticated

  labels = {
    environment = var.environment
    managed-by  = "terraform"
  }
}

# Azure Functions Module
module "azure_functions" {
  source = "./modules/azure-functions"
  count  = var.enable_azure ? 1 : 0

  environment           = var.environment
  name_prefix           = local.name_prefix
  location              = var.azure_location
  resource_group_name   = var.azure_resource_group_name
  storage_account_name  = var.azure_storage_account_name
  app_service_plan_tier = var.azure_app_service_plan_tier
  app_service_plan_size = var.azure_app_service_plan_size
  function_runtime      = var.azure_function_runtime

  tags = local.common_tags
}

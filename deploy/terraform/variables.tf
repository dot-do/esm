# ESM Terraform Variables
# Input variables for multi-cloud ESM deployment

# -----------------------------------------------------------------------------
# General Configuration
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# -----------------------------------------------------------------------------
# Cloud Provider Enablement
# -----------------------------------------------------------------------------

variable "enable_aws" {
  description = "Enable AWS Lambda deployment"
  type        = bool
  default     = true
}

variable "enable_gcp" {
  description = "Enable GCP Cloud Run deployment"
  type        = bool
  default     = false
}

variable "enable_azure" {
  description = "Enable Azure Functions deployment"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# AWS Configuration
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "lambda_memory_size" {
  description = "Memory size for Lambda function in MB"
  type        = number
  default     = 256

  validation {
    condition     = var.lambda_memory_size >= 128 && var.lambda_memory_size <= 10240
    error_message = "Lambda memory must be between 128 MB and 10240 MB."
  }
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30

  validation {
    condition     = var.lambda_timeout >= 1 && var.lambda_timeout <= 900
    error_message = "Lambda timeout must be between 1 and 900 seconds."
  }
}

variable "lambda_runtime" {
  description = "Lambda runtime version"
  type        = string
  default     = "nodejs20.x"
}

variable "enable_xray_tracing" {
  description = "Enable AWS X-Ray tracing for Lambda"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# GCP Configuration
# -----------------------------------------------------------------------------

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
  default     = ""
}

variable "gcp_region" {
  description = "GCP region for deployment"
  type        = string
  default     = "us-central1"
}

variable "gcp_container_image" {
  description = "Container image for Cloud Run"
  type        = string
  default     = ""
}

variable "cloud_run_min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

variable "cloud_run_max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 100
}

variable "cloud_run_memory" {
  description = "Memory allocation for Cloud Run (e.g., 256Mi, 512Mi, 1Gi)"
  type        = string
  default     = "256Mi"
}

variable "cloud_run_cpu" {
  description = "CPU allocation for Cloud Run"
  type        = string
  default     = "1"
}

variable "cloud_run_allow_unauthenticated" {
  description = "Allow unauthenticated access to Cloud Run service"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Azure Configuration
# -----------------------------------------------------------------------------

variable "azure_subscription_id" {
  description = "Azure subscription ID"
  type        = string
  default     = ""
}

variable "azure_location" {
  description = "Azure location for deployment"
  type        = string
  default     = "eastus"
}

variable "azure_resource_group_name" {
  description = "Azure resource group name"
  type        = string
  default     = ""
}

variable "azure_storage_account_name" {
  description = "Azure storage account name for function app"
  type        = string
  default     = ""
}

variable "azure_app_service_plan_tier" {
  description = "Azure App Service Plan tier"
  type        = string
  default     = "Dynamic"
}

variable "azure_app_service_plan_size" {
  description = "Azure App Service Plan size"
  type        = string
  default     = "Y1"
}

variable "azure_function_runtime" {
  description = "Azure Functions runtime version"
  type        = string
  default     = "node"
}

# -----------------------------------------------------------------------------
# Scaling Configuration
# -----------------------------------------------------------------------------

variable "scaling_config" {
  description = "Scaling configuration per environment"
  type = object({
    min_capacity     = number
    max_capacity     = number
    target_cpu       = number
    scale_in_cooldown  = number
    scale_out_cooldown = number
  })
  default = {
    min_capacity       = 1
    max_capacity       = 10
    target_cpu         = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for VPC (if creating new VPC)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_vpc" {
  description = "Deploy resources within a VPC"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Monitoring Configuration
# -----------------------------------------------------------------------------

variable "enable_monitoring" {
  description = "Enable CloudWatch/Stackdriver/Azure Monitor"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain logs"
  type        = number
  default     = 30
}

variable "alarm_email" {
  description = "Email address for monitoring alarms"
  type        = string
  default     = ""
}

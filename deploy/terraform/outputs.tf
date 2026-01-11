# ESM Terraform Outputs
# Output values for multi-cloud ESM deployment

# -----------------------------------------------------------------------------
# AWS Outputs
# -----------------------------------------------------------------------------

output "aws_lambda_function_name" {
  description = "Name of the AWS Lambda function"
  value       = var.enable_aws ? module.aws_lambda[0].function_name : null
}

output "aws_lambda_function_arn" {
  description = "ARN of the AWS Lambda function"
  value       = var.enable_aws ? module.aws_lambda[0].function_arn : null
}

output "aws_api_gateway_url" {
  description = "URL of the AWS API Gateway endpoint"
  value       = var.enable_aws ? module.aws_lambda[0].api_gateway_url : null
}

output "aws_api_gateway_id" {
  description = "ID of the AWS API Gateway"
  value       = var.enable_aws ? module.aws_lambda[0].api_gateway_id : null
}

output "aws_cloudwatch_log_group" {
  description = "CloudWatch log group for Lambda function"
  value       = var.enable_aws ? module.aws_lambda[0].cloudwatch_log_group : null
}

# -----------------------------------------------------------------------------
# GCP Outputs
# -----------------------------------------------------------------------------

output "gcp_cloud_run_url" {
  description = "URL of the GCP Cloud Run service"
  value       = var.enable_gcp ? module.gcp_cloud_run[0].service_url : null
}

output "gcp_cloud_run_service_name" {
  description = "Name of the GCP Cloud Run service"
  value       = var.enable_gcp ? module.gcp_cloud_run[0].service_name : null
}

output "gcp_cloud_run_latest_revision" {
  description = "Latest revision of the Cloud Run service"
  value       = var.enable_gcp ? module.gcp_cloud_run[0].latest_revision : null
}

# -----------------------------------------------------------------------------
# Azure Outputs
# -----------------------------------------------------------------------------

output "azure_function_app_name" {
  description = "Name of the Azure Function App"
  value       = var.enable_azure ? module.azure_functions[0].function_app_name : null
}

output "azure_function_app_url" {
  description = "URL of the Azure Function App"
  value       = var.enable_azure ? module.azure_functions[0].function_app_url : null
}

output "azure_function_app_id" {
  description = "ID of the Azure Function App"
  value       = var.enable_azure ? module.azure_functions[0].function_app_id : null
}

# -----------------------------------------------------------------------------
# Combined Outputs
# -----------------------------------------------------------------------------

output "service_urls" {
  description = "Map of all deployed service URLs by provider"
  value = {
    aws   = var.enable_aws ? module.aws_lambda[0].api_gateway_url : null
    gcp   = var.enable_gcp ? module.gcp_cloud_run[0].service_url : null
    azure = var.enable_azure ? module.azure_functions[0].function_app_url : null
  }
}

output "deployment_summary" {
  description = "Summary of deployed resources"
  value = {
    environment = var.environment
    providers = {
      aws   = var.enable_aws
      gcp   = var.enable_gcp
      azure = var.enable_azure
    }
    regions = {
      aws   = var.enable_aws ? var.aws_region : null
      gcp   = var.enable_gcp ? var.gcp_region : null
      azure = var.enable_azure ? var.azure_location : null
    }
  }
}

output "resource_identifiers" {
  description = "Map of resource identifiers for all deployed services"
  value = {
    aws = var.enable_aws ? {
      lambda_arn      = module.aws_lambda[0].function_arn
      api_gateway_id  = module.aws_lambda[0].api_gateway_id
      log_group       = module.aws_lambda[0].cloudwatch_log_group
    } : null
    gcp = var.enable_gcp ? {
      service_name    = module.gcp_cloud_run[0].service_name
      latest_revision = module.gcp_cloud_run[0].latest_revision
      project_id      = var.gcp_project_id
    } : null
    azure = var.enable_azure ? {
      function_app_id   = module.azure_functions[0].function_app_id
      resource_group    = var.azure_resource_group_name
      storage_account   = var.azure_storage_account_name
    } : null
  }
}

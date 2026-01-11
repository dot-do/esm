# ESM Development Environment Configuration

terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "esm-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "esm-terraform-locks"
  }
}

module "esm" {
  source = "../../"

  environment = "dev"

  # Enable only AWS for development (faster iteration)
  enable_aws   = true
  enable_gcp   = false
  enable_azure = false

  # AWS Configuration
  aws_region         = "us-east-1"
  lambda_memory_size = 256
  lambda_timeout     = 30
  lambda_runtime     = "nodejs20.x"
  enable_xray_tracing = false

  # Scaling Configuration (minimal for dev)
  scaling_config = {
    min_capacity       = 0
    max_capacity       = 5
    target_cpu         = 70
    scale_in_cooldown  = 60
    scale_out_cooldown = 30
  }

  # Monitoring (minimal for dev)
  enable_monitoring  = true
  log_retention_days = 7
  alarm_email        = ""

  # VPC disabled for dev
  enable_vpc = false
}

# Development-specific outputs
output "api_url" {
  description = "API Gateway URL for development"
  value       = module.esm.aws_api_gateway_url
}

output "lambda_function" {
  description = "Lambda function name"
  value       = module.esm.aws_lambda_function_name
}

output "log_group" {
  description = "CloudWatch log group"
  value       = module.esm.aws_cloudwatch_log_group
}

# AWS Lambda Module Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Lambda Configuration
# -----------------------------------------------------------------------------

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_handler" {
  description = "Lambda handler function"
  type        = string
  default     = "index.handler"
}

variable "lambda_memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_zip_path" {
  description = "Path to Lambda deployment package"
  type        = string
  default     = ""
}

variable "s3_bucket" {
  description = "S3 bucket containing Lambda deployment package"
  type        = string
  default     = ""
}

variable "s3_key" {
  description = "S3 key for Lambda deployment package"
  type        = string
  default     = ""
}

variable "s3_object_version" {
  description = "S3 object version for Lambda deployment package"
  type        = string
  default     = null
}

variable "environment_variables" {
  description = "Additional environment variables for Lambda"
  type        = map(string)
  default     = {}
}

variable "log_level" {
  description = "Log level for the application"
  type        = string
  default     = "info"
}

# -----------------------------------------------------------------------------
# VPC Configuration
# -----------------------------------------------------------------------------

variable "vpc_subnet_ids" {
  description = "VPC subnet IDs for Lambda"
  type        = list(string)
  default     = null
}

variable "vpc_security_group_ids" {
  description = "VPC security group IDs for Lambda"
  type        = list(string)
  default     = null
}

# -----------------------------------------------------------------------------
# API Gateway Configuration
# -----------------------------------------------------------------------------

variable "api_gateway_stage" {
  description = "API Gateway stage name"
  type        = string
  default     = "v1"
}

variable "cors_allow_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = ["*"]
}

variable "throttling_burst_limit" {
  description = "API Gateway throttling burst limit"
  type        = number
  default     = 1000
}

variable "throttling_rate_limit" {
  description = "API Gateway throttling rate limit"
  type        = number
  default     = 500
}

# -----------------------------------------------------------------------------
# Monitoring Configuration
# -----------------------------------------------------------------------------

variable "enable_xray_tracing" {
  description = "Enable X-Ray tracing"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "enable_alarms" {
  description = "Enable CloudWatch alarms"
  type        = bool
  default     = false
}

variable "error_threshold" {
  description = "Error count threshold for alarm"
  type        = number
  default     = 5
}

variable "alarm_actions" {
  description = "ARNs of actions for alarms (e.g., SNS topic)"
  type        = list(string)
  default     = []
}

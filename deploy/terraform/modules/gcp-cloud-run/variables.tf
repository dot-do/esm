# GCP Cloud Run Module Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Container Configuration
# -----------------------------------------------------------------------------

variable "container_image" {
  description = "Container image URL"
  type        = string
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "CPU allocation (e.g., 1, 2)"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory allocation (e.g., 256Mi, 1Gi)"
  type        = string
  default     = "256Mi"
}

variable "cpu_idle" {
  description = "Keep CPU allocated during idle"
  type        = bool
  default     = false
}

variable "startup_cpu_boost" {
  description = "Enable CPU boost during startup"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Scaling Configuration
# -----------------------------------------------------------------------------

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 100
}

variable "concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "request_timeout" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

# -----------------------------------------------------------------------------
# Environment Variables
# -----------------------------------------------------------------------------

variable "environment_variables" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "Secret environment variables from Secret Manager"
  type = map(object({
    secret  = string
    version = string
  }))
  default = {}
}

variable "log_level" {
  description = "Log level"
  type        = string
  default     = "info"
}

# -----------------------------------------------------------------------------
# Networking Configuration
# -----------------------------------------------------------------------------

variable "ingress" {
  description = "Ingress setting (INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER)"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access"
  type        = bool
  default     = true
}

variable "vpc_connector" {
  description = "VPC connector name"
  type        = string
  default     = null
}

variable "vpc_egress" {
  description = "VPC egress setting"
  type        = string
  default     = "PRIVATE_RANGES_ONLY"
}

variable "custom_domain" {
  description = "Custom domain for the service"
  type        = string
  default     = null
}

# -----------------------------------------------------------------------------
# Health Check Configuration
# -----------------------------------------------------------------------------

variable "health_check_path" {
  description = "Path for health check"
  type        = string
  default     = "/health"
}

# -----------------------------------------------------------------------------
# Service Account Configuration
# -----------------------------------------------------------------------------

variable "service_account_roles" {
  description = "IAM roles to grant to the service account"
  type        = list(string)
  default = [
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent"
  ]
}

# -----------------------------------------------------------------------------
# Monitoring Configuration
# -----------------------------------------------------------------------------

variable "enable_alerts" {
  description = "Enable Cloud Monitoring alerts"
  type        = bool
  default     = false
}

variable "notification_channels" {
  description = "Notification channel IDs for alerts"
  type        = list(string)
  default     = []
}

variable "error_rate_threshold" {
  description = "Error rate threshold for alerts"
  type        = number
  default     = 0.05
}

variable "latency_threshold_ms" {
  description = "P95 latency threshold in milliseconds"
  type        = number
  default     = 1000
}

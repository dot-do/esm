# Azure Functions Module Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "location" {
  description = "Azure location"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Resource Group Configuration
# -----------------------------------------------------------------------------

variable "resource_group_name" {
  description = "Name of existing resource group (if not creating new)"
  type        = string
  default     = ""
}

variable "create_resource_group" {
  description = "Create a new resource group"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Storage Account Configuration
# -----------------------------------------------------------------------------

variable "storage_account_name" {
  description = "Name of existing storage account (if not creating new)"
  type        = string
  default     = ""
}

variable "storage_account_access_key" {
  description = "Access key for existing storage account"
  type        = string
  default     = ""
  sensitive   = true
}

variable "create_storage_account" {
  description = "Create a new storage account"
  type        = bool
  default     = true
}

variable "storage_account_tier" {
  description = "Storage account tier"
  type        = string
  default     = "Standard"
}

variable "storage_account_replication" {
  description = "Storage account replication type"
  type        = string
  default     = "LRS"
}

# -----------------------------------------------------------------------------
# App Service Plan Configuration
# -----------------------------------------------------------------------------

variable "app_service_plan_tier" {
  description = "App Service Plan tier (deprecated, use app_service_plan_sku)"
  type        = string
  default     = "Dynamic"
}

variable "app_service_plan_size" {
  description = "App Service Plan size (deprecated, use app_service_plan_sku)"
  type        = string
  default     = "Y1"
}

variable "app_service_plan_sku" {
  description = "App Service Plan SKU (e.g., Y1, B1, S1, P1v2)"
  type        = string
  default     = "Y1"
}

variable "always_on" {
  description = "Keep function app always on (requires non-consumption plan)"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Function App Configuration
# -----------------------------------------------------------------------------

variable "function_runtime" {
  description = "Function runtime (node, python, dotnet, java)"
  type        = string
  default     = "node"
}

variable "node_version" {
  description = "Node.js version"
  type        = string
  default     = "20"
}

variable "functions_extension_version" {
  description = "Azure Functions runtime version"
  type        = string
  default     = "~4"
}

variable "app_settings" {
  description = "Additional app settings"
  type        = map(string)
  default     = {}
}

variable "log_level" {
  description = "Log level"
  type        = string
  default     = "info"
}

# -----------------------------------------------------------------------------
# CORS Configuration
# -----------------------------------------------------------------------------

variable "cors_allowed_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = []
}

variable "cors_support_credentials" {
  description = "CORS support credentials"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Networking Configuration
# -----------------------------------------------------------------------------

variable "ip_restrictions" {
  description = "IP restrictions for the function app"
  type = list(object({
    ip_address = string
    name       = string
    priority   = number
    action     = string
  }))
  default = []
}

# -----------------------------------------------------------------------------
# Staging Slot Configuration
# -----------------------------------------------------------------------------

variable "create_staging_slot" {
  description = "Create a staging deployment slot"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Monitoring Configuration
# -----------------------------------------------------------------------------

variable "enable_application_insights" {
  description = "Enable Application Insights"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Log retention in days"
  type        = number
  default     = 30
}

variable "enable_alerts" {
  description = "Enable metric alerts"
  type        = bool
  default     = false
}

variable "alert_action_group_ids" {
  description = "Action group IDs for alerts"
  type        = list(string)
  default     = []
}

variable "error_threshold" {
  description = "Error count threshold for alert"
  type        = number
  default     = 10
}

variable "latency_threshold_seconds" {
  description = "Latency threshold in seconds for alert"
  type        = number
  default     = 5
}

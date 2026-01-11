# Azure Functions Module Outputs

output "function_app_name" {
  description = "Name of the Function App"
  value       = azurerm_linux_function_app.esm.name
}

output "function_app_id" {
  description = "ID of the Function App"
  value       = azurerm_linux_function_app.esm.id
}

output "function_app_url" {
  description = "Default URL of the Function App"
  value       = "https://${azurerm_linux_function_app.esm.default_hostname}"
}

output "function_app_default_hostname" {
  description = "Default hostname of the Function App"
  value       = azurerm_linux_function_app.esm.default_hostname
}

output "function_app_outbound_ip_addresses" {
  description = "Outbound IP addresses of the Function App"
  value       = azurerm_linux_function_app.esm.outbound_ip_addresses
}

output "function_app_possible_outbound_ip_addresses" {
  description = "Possible outbound IP addresses of the Function App"
  value       = azurerm_linux_function_app.esm.possible_outbound_ip_addresses
}

output "function_app_identity_principal_id" {
  description = "Principal ID of the Function App managed identity"
  value       = azurerm_linux_function_app.esm.identity[0].principal_id
}

output "function_app_identity_tenant_id" {
  description = "Tenant ID of the Function App managed identity"
  value       = azurerm_linux_function_app.esm.identity[0].tenant_id
}

output "resource_group_name" {
  description = "Name of the resource group"
  value       = local.resource_group_name
}

output "app_service_plan_id" {
  description = "ID of the App Service Plan"
  value       = azurerm_service_plan.esm.id
}

output "app_service_plan_name" {
  description = "Name of the App Service Plan"
  value       = azurerm_service_plan.esm.name
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = local.storage_account_name
}

output "application_insights_id" {
  description = "ID of Application Insights"
  value       = var.enable_application_insights ? azurerm_application_insights.esm[0].id : null
}

output "application_insights_instrumentation_key" {
  description = "Instrumentation key for Application Insights"
  value       = var.enable_application_insights ? azurerm_application_insights.esm[0].instrumentation_key : null
  sensitive   = true
}

output "application_insights_connection_string" {
  description = "Connection string for Application Insights"
  value       = var.enable_application_insights ? azurerm_application_insights.esm[0].connection_string : null
  sensitive   = true
}

output "staging_slot_name" {
  description = "Name of the staging slot"
  value       = var.create_staging_slot ? azurerm_linux_function_app_slot.staging[0].name : null
}

output "staging_slot_url" {
  description = "URL of the staging slot"
  value       = var.create_staging_slot ? "https://${azurerm_linux_function_app_slot.staging[0].default_hostname}" : null
}

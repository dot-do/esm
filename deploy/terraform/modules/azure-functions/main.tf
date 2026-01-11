# Azure Functions Module for ESM
# Deploys Azure Function App with supporting infrastructure

# -----------------------------------------------------------------------------
# Resource Group (if not provided)
# -----------------------------------------------------------------------------

resource "azurerm_resource_group" "esm" {
  count = var.create_resource_group ? 1 : 0

  name     = var.resource_group_name != "" ? var.resource_group_name : "${var.name_prefix}-rg"
  location = var.location
  tags     = var.tags
}

locals {
  resource_group_name = var.create_resource_group ? azurerm_resource_group.esm[0].name : var.resource_group_name
}

# -----------------------------------------------------------------------------
# Storage Account
# -----------------------------------------------------------------------------

resource "azurerm_storage_account" "esm" {
  count = var.create_storage_account ? 1 : 0

  name                     = var.storage_account_name != "" ? var.storage_account_name : replace("${var.name_prefix}sa", "-", "")
  resource_group_name      = local.resource_group_name
  location                 = var.location
  account_tier             = var.storage_account_tier
  account_replication_type = var.storage_account_replication
  min_tls_version          = "TLS1_2"

  tags = var.tags
}

locals {
  storage_account_name       = var.create_storage_account ? azurerm_storage_account.esm[0].name : var.storage_account_name
  storage_account_access_key = var.create_storage_account ? azurerm_storage_account.esm[0].primary_access_key : var.storage_account_access_key
}

# -----------------------------------------------------------------------------
# App Service Plan
# -----------------------------------------------------------------------------

resource "azurerm_service_plan" "esm" {
  name                = "${var.name_prefix}-plan"
  resource_group_name = local.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Application Insights
# -----------------------------------------------------------------------------

resource "azurerm_application_insights" "esm" {
  count = var.enable_application_insights ? 1 : 0

  name                = "${var.name_prefix}-insights"
  resource_group_name = local.resource_group_name
  location            = var.location
  application_type    = "Node.JS"
  retention_in_days   = var.log_retention_days

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Function App
# -----------------------------------------------------------------------------

resource "azurerm_linux_function_app" "esm" {
  name                = "${var.name_prefix}-func"
  resource_group_name = local.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.esm.id

  storage_account_name       = local.storage_account_name
  storage_account_access_key = local.storage_account_access_key

  https_only                  = true
  functions_extension_version = var.functions_extension_version

  site_config {
    always_on                              = var.always_on
    http2_enabled                          = true
    minimum_tls_version                    = "1.2"
    ftps_state                             = "Disabled"
    application_insights_connection_string = var.enable_application_insights ? azurerm_application_insights.esm[0].connection_string : null
    application_insights_key               = var.enable_application_insights ? azurerm_application_insights.esm[0].instrumentation_key : null

    application_stack {
      node_version = var.node_version
    }

    dynamic "cors" {
      for_each = length(var.cors_allowed_origins) > 0 ? [1] : []
      content {
        allowed_origins     = var.cors_allowed_origins
        support_credentials = var.cors_support_credentials
      }
    }

    dynamic "ip_restriction" {
      for_each = var.ip_restrictions
      content {
        ip_address = ip_restriction.value.ip_address
        name       = ip_restriction.value.name
        priority   = ip_restriction.value.priority
        action     = ip_restriction.value.action
      }
    }
  }

  app_settings = merge(
    {
      FUNCTIONS_WORKER_RUNTIME       = var.function_runtime
      WEBSITE_NODE_DEFAULT_VERSION   = var.node_version
      NODE_ENV                       = var.environment
      LOG_LEVEL                      = var.log_level
      SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
    },
    var.app_settings
  )

  identity {
    type = "SystemAssigned"
  }

  lifecycle {
    ignore_changes = [
      app_settings["WEBSITE_RUN_FROM_PACKAGE"],
    ]
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Function App Slot (for staging deployments)
# -----------------------------------------------------------------------------

resource "azurerm_linux_function_app_slot" "staging" {
  count = var.create_staging_slot ? 1 : 0

  name                       = "staging"
  function_app_id            = azurerm_linux_function_app.esm.id
  storage_account_name       = local.storage_account_name
  storage_account_access_key = local.storage_account_access_key

  site_config {
    always_on         = false
    http2_enabled     = true
    ftps_state        = "Disabled"
    application_insights_connection_string = var.enable_application_insights ? azurerm_application_insights.esm[0].connection_string : null

    application_stack {
      node_version = var.node_version
    }
  }

  app_settings = merge(
    {
      FUNCTIONS_WORKER_RUNTIME       = var.function_runtime
      WEBSITE_NODE_DEFAULT_VERSION   = var.node_version
      NODE_ENV                       = "staging"
      LOG_LEVEL                      = var.log_level
      SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
    },
    var.app_settings
  )

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Monitor Metric Alert (Optional)
# -----------------------------------------------------------------------------

resource "azurerm_monitor_metric_alert" "function_errors" {
  count = var.enable_alerts ? 1 : 0

  name                = "${var.name_prefix}-function-errors"
  resource_group_name = local.resource_group_name
  scopes              = [azurerm_linux_function_app.esm.id]
  description         = "Alert when function error rate is high"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "Http5xx"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = var.error_threshold
  }

  dynamic "action" {
    for_each = var.alert_action_group_ids
    content {
      action_group_id = action.value
    }
  }

  tags = var.tags
}

resource "azurerm_monitor_metric_alert" "function_latency" {
  count = var.enable_alerts ? 1 : 0

  name                = "${var.name_prefix}-function-latency"
  resource_group_name = local.resource_group_name
  scopes              = [azurerm_linux_function_app.esm.id]
  description         = "Alert when function response time is high"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "HttpResponseTime"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = var.latency_threshold_seconds
  }

  dynamic "action" {
    for_each = var.alert_action_group_ids
    content {
      action_group_id = action.value
    }
  }

  tags = var.tags
}

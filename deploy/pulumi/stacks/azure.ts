import * as pulumi from '@pulumi/pulumi'
import * as azure from '@pulumi/azure-native'

export interface AzureStackConfig {
  projectName: string
  environment: string
  tags: Record<string, string>
}

export interface AzureStackOutputs {
  functionAppUrl: pulumi.Output<string>
  functionAppName: pulumi.Output<string>
  resourceGroupName: pulumi.Output<string>
}

export function createAzureStack(config: AzureStackConfig): AzureStackOutputs {
  const { projectName, environment, tags } = config
  const azureConfig = new pulumi.Config('azure-native')
  const location = azureConfig.get('location') || 'eastus'

  // Sanitize name for Azure (alphanumeric and hyphens, 3-24 chars for storage)
  const sanitizedName = projectName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)

  // Resource Group
  const resourceGroup = new azure.resources.ResourceGroup(`${projectName}-rg`, {
    location,
    tags,
  })

  // Storage Account for Function App
  const storageAccount = new azure.storage.StorageAccount(`${sanitizedName}sa`, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
      name: azure.storage.SkuName.Standard_LRS,
    },
    kind: azure.storage.Kind.StorageV2,
    tags,
  })

  // App Service Plan (Consumption)
  const appServicePlan = new azure.web.AppServicePlan(`${projectName}-plan`, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
      name: 'Y1',
      tier: 'Dynamic',
    },
    kind: 'functionapp',
    tags,
  })

  // Application Insights for monitoring
  const appInsights = new azure.insights.Component(`${projectName}-insights`, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    applicationType: 'web',
    kind: 'web',
    tags,
  })

  // Get storage account keys
  const storageAccountKeys = pulumi
    .all([resourceGroup.name, storageAccount.name])
    .apply(([rgName, saName]) =>
      azure.storage.listStorageAccountKeys({
        resourceGroupName: rgName,
        accountName: saName,
      })
    )

  const primaryStorageKey = storageAccountKeys.apply((keys) => keys.keys[0].value)

  // Connection string for storage
  const storageConnectionString = pulumi.interpolate`DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${primaryStorageKey};EndpointSuffix=core.windows.net`

  // Function App
  const functionApp = new azure.web.WebApp(`${projectName}-func`, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    serverFarmId: appServicePlan.id,
    kind: 'functionapp',
    httpsOnly: true,
    siteConfig: {
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' },
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' },
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' },
        { name: 'AzureWebJobsStorage', value: storageConnectionString },
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: storageConnectionString },
        { name: 'WEBSITE_CONTENTSHARE', value: `${projectName}-content` },
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY', value: appInsights.instrumentationKey },
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.connectionString },
        { name: 'NODE_ENV', value: environment },
        { name: 'ESM_DO_ENV', value: environment },
      ],
      nodeVersion: '~20',
      http20Enabled: true,
      minTlsVersion: '1.2',
      cors: {
        allowedOrigins: ['*'],
      },
    },
    tags,
  })

  return {
    functionAppUrl: pulumi.interpolate`https://${functionApp.defaultHostName}`,
    functionAppName: functionApp.name,
    resourceGroupName: resourceGroup.name,
  }
}

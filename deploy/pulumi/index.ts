import * as pulumi from '@pulumi/pulumi'

// Import cloud-specific stacks
import { createAwsStack, AwsStackOutputs } from './stacks/aws'
import { createGcpStack, GcpStackOutputs } from './stacks/gcp'
import { createAzureStack, AzureStackOutputs } from './stacks/azure'
import { createCloudflareStack, CloudflareStackOutputs } from './stacks/cloudflare'
import { createKubernetesStack, KubernetesStackOutputs } from './stacks/kubernetes'

// Configuration
const config = new pulumi.Config()
const projectName = config.get('projectName') || 'esm-do'
const environment = pulumi.getStack()

// Feature flags for which stacks to deploy
const enableAws = config.getBoolean('enableAws') ?? false
const enableGcp = config.getBoolean('enableGcp') ?? false
const enableAzure = config.getBoolean('enableAzure') ?? false
const enableCloudflare = config.getBoolean('enableCloudflare') ?? true
const enableKubernetes = config.getBoolean('enableKubernetes') ?? false

// Common tags for all resources
const commonTags = {
  project: projectName,
  environment: environment,
  managedBy: 'pulumi',
}

// Stack outputs
interface StackOutputs {
  aws?: AwsStackOutputs
  gcp?: GcpStackOutputs
  azure?: AzureStackOutputs
  cloudflare?: CloudflareStackOutputs
  kubernetes?: KubernetesStackOutputs
}

const outputs: StackOutputs = {}

// Deploy AWS Lambda + API Gateway
if (enableAws) {
  outputs.aws = createAwsStack({
    projectName,
    environment,
    tags: commonTags,
  })
}

// Deploy GCP Cloud Run
if (enableGcp) {
  outputs.gcp = createGcpStack({
    projectName,
    environment,
    labels: commonTags,
  })
}

// Deploy Azure Functions
if (enableAzure) {
  outputs.azure = createAzureStack({
    projectName,
    environment,
    tags: commonTags,
  })
}

// Deploy Cloudflare Workers (default)
if (enableCloudflare) {
  outputs.cloudflare = createCloudflareStack({
    projectName,
    environment,
  })
}

// Deploy Kubernetes
if (enableKubernetes) {
  outputs.kubernetes = createKubernetesStack({
    projectName,
    environment,
    labels: commonTags,
  })
}

// Export all outputs
export const aws = outputs.aws
export const gcp = outputs.gcp
export const azure = outputs.azure
export const cloudflare = outputs.cloudflare
export const kubernetes = outputs.kubernetes
export const project = projectName
export const env = environment

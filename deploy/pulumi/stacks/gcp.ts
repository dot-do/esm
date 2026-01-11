import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'

export interface GcpStackConfig {
  projectName: string
  environment: string
  labels: Record<string, string>
}

export interface GcpStackOutputs {
  serviceUrl: pulumi.Output<string>
  serviceName: pulumi.Output<string>
  revision: pulumi.Output<string>
}

export function createGcpStack(config: GcpStackConfig): GcpStackOutputs {
  const { projectName, environment, labels } = config
  const gcpConfig = new pulumi.Config('gcp')
  const region = gcpConfig.get('region') || 'us-central1'
  const projectId = gcpConfig.require('project')

  // Sanitize labels for GCP (lowercase, alphanumeric, dashes, underscores only)
  const gcpLabels = Object.fromEntries(
    Object.entries(labels).map(([k, v]) => [
      k.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      v.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    ])
  )

  // Enable required APIs
  const cloudRunApi = new gcp.projects.Service(`${projectName}-cloudrun-api`, {
    service: 'run.googleapis.com',
    disableOnDestroy: false,
  })

  const containerRegistryApi = new gcp.projects.Service(`${projectName}-gcr-api`, {
    service: 'containerregistry.googleapis.com',
    disableOnDestroy: false,
  })

  // Cloud Run Service
  const service = new gcp.cloudrun.Service(
    `${projectName}-service`,
    {
      location: region,
      template: {
        spec: {
          containers: [
            {
              // Use a placeholder image - replace with actual esm.do container
              image: 'gcr.io/cloudrun/hello',
              ports: [{ containerPort: 8080 }],
              resources: {
                limits: {
                  memory: '256Mi',
                  cpu: '1',
                },
              },
              envs: [
                { name: 'NODE_ENV', value: environment },
                { name: 'ESM_DO_ENV', value: environment },
                { name: 'PORT', value: '8080' },
              ],
            },
          ],
          containerConcurrency: 80,
          timeoutSeconds: 30,
        },
        metadata: {
          labels: gcpLabels,
          annotations: {
            'autoscaling.knative.dev/minScale': environment === 'prod' ? '1' : '0',
            'autoscaling.knative.dev/maxScale': environment === 'prod' ? '100' : '10',
          },
        },
      },
      traffics: [
        {
          percent: 100,
          latestRevision: true,
        },
      ],
      metadata: {
        labels: gcpLabels,
      },
    },
    { dependsOn: [cloudRunApi, containerRegistryApi] }
  )

  // IAM binding to allow unauthenticated access (public API)
  const iamBinding = new gcp.cloudrun.IamMember(`${projectName}-invoker`, {
    service: service.name,
    location: region,
    role: 'roles/run.invoker',
    member: 'allUsers',
  })

  // Custom domain mapping (optional - configure via config)
  const customDomain = new pulumi.Config().get('gcpCustomDomain')
  if (customDomain) {
    new gcp.cloudrun.DomainMapping(`${projectName}-domain`, {
      location: region,
      name: customDomain,
      metadata: {
        namespace: projectId,
      },
      spec: {
        routeName: service.name,
      },
    })
  }

  return {
    serviceUrl: service.statuses.apply((s) => s[0]?.url || ''),
    serviceName: service.name,
    revision: service.statuses.apply((s) => s[0]?.latestReadyRevisionName || ''),
  }
}

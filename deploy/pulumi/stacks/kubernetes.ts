import * as pulumi from '@pulumi/pulumi'
import * as k8s from '@pulumi/kubernetes'

export interface KubernetesStackConfig {
  projectName: string
  environment: string
  labels: Record<string, string>
}

export interface KubernetesStackOutputs {
  deploymentName: pulumi.Output<string>
  serviceName: pulumi.Output<string>
  serviceEndpoint: pulumi.Output<string>
  namespace: pulumi.Output<string>
}

export function createKubernetesStack(config: KubernetesStackConfig): KubernetesStackOutputs {
  const { projectName, environment, labels } = config
  const k8sConfig = new pulumi.Config('kubernetes')

  // Namespace for isolation
  const namespace = new k8s.core.v1.Namespace(`${projectName}-ns`, {
    metadata: {
      name: `${projectName}-${environment}`,
      labels: {
        ...labels,
        app: projectName,
      },
    },
  })

  // ConfigMap for environment configuration
  const configMap = new k8s.core.v1.ConfigMap(`${projectName}-config`, {
    metadata: {
      name: `${projectName}-config`,
      namespace: namespace.metadata.name,
      labels,
    },
    data: {
      NODE_ENV: environment,
      ESM_DO_ENV: environment,
      LOG_LEVEL: environment === 'prod' ? 'info' : 'debug',
    },
  })

  // Deployment configuration
  const replicas = environment === 'prod' ? 3 : 1
  const image = k8sConfig.get('image') || 'ghcr.io/dot-do/esm:latest'

  const deployment = new k8s.apps.v1.Deployment(`${projectName}-deployment`, {
    metadata: {
      name: projectName,
      namespace: namespace.metadata.name,
      labels,
    },
    spec: {
      replicas,
      selector: {
        matchLabels: {
          app: projectName,
        },
      },
      template: {
        metadata: {
          labels: {
            ...labels,
            app: projectName,
          },
        },
        spec: {
          containers: [
            {
              name: 'esm-do',
              image,
              ports: [{ containerPort: 8080, name: 'http' }],
              envFrom: [
                {
                  configMapRef: {
                    name: configMap.metadata.name,
                  },
                },
              ],
              resources: {
                requests: {
                  cpu: '100m',
                  memory: '128Mi',
                },
                limits: {
                  cpu: '500m',
                  memory: '256Mi',
                },
              },
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 'http',
                },
                initialDelaySeconds: 10,
                periodSeconds: 10,
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 'http',
                },
                initialDelaySeconds: 5,
                periodSeconds: 5,
              },
            },
          ],
        },
      },
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxUnavailable: 0,
          maxSurge: 1,
        },
      },
    },
  })

  // Service to expose the deployment
  const service = new k8s.core.v1.Service(`${projectName}-service`, {
    metadata: {
      name: projectName,
      namespace: namespace.metadata.name,
      labels,
    },
    spec: {
      type: 'ClusterIP',
      ports: [
        {
          port: 80,
          targetPort: 8080,
          protocol: 'TCP',
          name: 'http',
        },
      ],
      selector: {
        app: projectName,
      },
    },
  })

  // Ingress for external access (optional)
  const ingressHost = new pulumi.Config().get('k8sIngressHost')
  if (ingressHost) {
    new k8s.networking.v1.Ingress(`${projectName}-ingress`, {
      metadata: {
        name: projectName,
        namespace: namespace.metadata.name,
        labels,
        annotations: {
          'kubernetes.io/ingress.class': 'nginx',
          'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
        },
      },
      spec: {
        tls: [
          {
            hosts: [ingressHost],
            secretName: `${projectName}-tls`,
          },
        ],
        rules: [
          {
            host: ingressHost,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: service.metadata.name,
                      port: { number: 80 },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    })
  }

  // Horizontal Pod Autoscaler for production
  if (environment === 'prod') {
    new k8s.autoscaling.v2.HorizontalPodAutoscaler(`${projectName}-hpa`, {
      metadata: {
        name: projectName,
        namespace: namespace.metadata.name,
        labels,
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: deployment.metadata.name,
        },
        minReplicas: 3,
        maxReplicas: 10,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 70,
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: {
                type: 'Utilization',
                averageUtilization: 80,
              },
            },
          },
        ],
      },
    })
  }

  // PodDisruptionBudget for production
  if (environment === 'prod') {
    new k8s.policy.v1.PodDisruptionBudget(`${projectName}-pdb`, {
      metadata: {
        name: projectName,
        namespace: namespace.metadata.name,
        labels,
      },
      spec: {
        minAvailable: 2,
        selector: {
          matchLabels: {
            app: projectName,
          },
        },
      },
    })
  }

  return {
    deploymentName: deployment.metadata.name,
    serviceName: service.metadata.name,
    serviceEndpoint: pulumi.interpolate`${service.metadata.name}.${namespace.metadata.name}.svc.cluster.local`,
    namespace: namespace.metadata.name,
  }
}

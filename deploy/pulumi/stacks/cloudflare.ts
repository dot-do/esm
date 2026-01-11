import * as pulumi from '@pulumi/pulumi'
import * as cloudflare from '@pulumi/cloudflare'

export interface CloudflareStackConfig {
  projectName: string
  environment: string
}

export interface CloudflareStackOutputs {
  workerUrl: pulumi.Output<string>
  workerName: pulumi.Output<string>
  routePattern: pulumi.Output<string> | undefined
}

export function createCloudflareStack(config: CloudflareStackConfig): CloudflareStackOutputs {
  const { projectName, environment } = config
  const cfConfig = new pulumi.Config('cloudflare')
  const accountId = cfConfig.require('accountId')

  // Worker name includes environment for isolation
  const workerName = `${projectName}-${environment}`

  // Placeholder worker script - in production, this would be the bundled esm.do worker
  const workerScript = `
    export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);

        return new Response(JSON.stringify({
          message: 'esm.do worker',
          environment: '${environment}',
          path: url.pathname,
          timestamp: new Date().toISOString(),
        }), {
          headers: {
            'Content-Type': 'application/json',
            'X-ESM-DO-Env': '${environment}',
          },
        });
      },
    };
  `

  // Worker Script
  const worker = new cloudflare.WorkerScript(workerName, {
    accountId,
    name: workerName,
    content: workerScript,
    module: true,
    compatibilityDate: '2024-01-01',
    compatibilityFlags: ['nodejs_compat'],
    // Bindings for the esm.do worker
    plainTextBindings: [
      { name: 'ENVIRONMENT', text: environment },
    ],
    // KV namespaces for caching (optional)
    // kvNamespaceBindings: [
    //   { name: 'ESM_CACHE', namespaceId: kvNamespace.id },
    // ],
  })

  // Optional: Custom domain route
  const customDomain = new pulumi.Config().get('cloudflareCustomDomain')
  const zoneId = new pulumi.Config().get('cloudflareZoneId')

  let routePattern: pulumi.Output<string> | undefined

  if (customDomain && zoneId) {
    const route = new cloudflare.WorkerRoute(`${workerName}-route`, {
      zoneId,
      pattern: `${customDomain}/*`,
      scriptName: worker.name,
    })
    routePattern = route.pattern
  }

  // Workers.dev subdomain (enabled by default)
  const workersDomain = new cloudflare.WorkerDomain(`${workerName}-domain`, {
    accountId,
    hostname: `${workerName}.workers.dev`,
    service: worker.name,
    zoneId: zoneId,
  })

  return {
    workerUrl: pulumi.interpolate`https://${workerName}.workers.dev`,
    workerName: worker.name,
    routePattern,
  }
}

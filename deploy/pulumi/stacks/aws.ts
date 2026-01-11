import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

export interface AwsStackConfig {
  projectName: string
  environment: string
  tags: Record<string, string>
}

export interface AwsStackOutputs {
  lambdaArn: pulumi.Output<string>
  apiGatewayUrl: pulumi.Output<string>
  functionName: pulumi.Output<string>
}

export function createAwsStack(config: AwsStackConfig): AwsStackOutputs {
  const { projectName, environment, tags } = config
  const awsConfig = new pulumi.Config('aws')
  const region = awsConfig.get('region') || 'us-east-1'

  // IAM Role for Lambda
  const lambdaRole = new aws.iam.Role(`${projectName}-lambda-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
          Effect: 'Allow',
        },
      ],
    }),
    tags,
  })

  // Attach basic Lambda execution policy
  new aws.iam.RolePolicyAttachment(`${projectName}-lambda-policy`, {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
  })

  // Lambda function for esm.do worker
  const lambdaFunction = new aws.lambda.Function(`${projectName}-function`, {
    runtime: aws.lambda.Runtime.NodeJS20dX,
    handler: 'index.handler',
    role: lambdaRole.arn,
    timeout: 30,
    memorySize: 256,
    environment: {
      variables: {
        NODE_ENV: environment,
        ESM_DO_ENV: environment,
      },
    },
    // Code will be deployed from CI/CD or manually
    code: new pulumi.asset.AssetArchive({
      'index.js': new pulumi.asset.StringAsset(`
        // Placeholder - deploy actual esm.do bundle
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'esm.do worker', environment: '${environment}' })
          };
        };
      `),
    }),
    tags,
  })

  // API Gateway REST API
  const api = new aws.apigateway.RestApi(`${projectName}-api`, {
    description: `esm.do API Gateway for ${environment}`,
    tags,
  })

  // API Gateway Resource (proxy for all paths)
  const proxyResource = new aws.apigateway.Resource(`${projectName}-proxy`, {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: '{proxy+}',
  })

  // ANY method for proxy resource
  const proxyMethod = new aws.apigateway.Method(`${projectName}-proxy-method`, {
    restApi: api.id,
    resourceId: proxyResource.id,
    httpMethod: 'ANY',
    authorization: 'NONE',
  })

  // Lambda integration
  const integration = new aws.apigateway.Integration(`${projectName}-integration`, {
    restApi: api.id,
    resourceId: proxyResource.id,
    httpMethod: proxyMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: lambdaFunction.invokeArn,
  })

  // Root method (for base path)
  const rootMethod = new aws.apigateway.Method(`${projectName}-root-method`, {
    restApi: api.id,
    resourceId: api.rootResourceId,
    httpMethod: 'ANY',
    authorization: 'NONE',
  })

  // Root integration
  const rootIntegration = new aws.apigateway.Integration(`${projectName}-root-integration`, {
    restApi: api.id,
    resourceId: api.rootResourceId,
    httpMethod: rootMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: lambdaFunction.invokeArn,
  })

  // API Gateway Deployment
  const deployment = new aws.apigateway.Deployment(
    `${projectName}-deployment`,
    {
      restApi: api.id,
      stageName: environment,
    },
    { dependsOn: [integration, rootIntegration] }
  )

  // Lambda permission for API Gateway
  new aws.lambda.Permission(`${projectName}-api-permission`, {
    action: 'lambda:InvokeFunction',
    function: lambdaFunction.name,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
  })

  return {
    lambdaArn: lambdaFunction.arn,
    apiGatewayUrl: pulumi.interpolate`https://${api.id}.execute-api.${region}.amazonaws.com/${environment}`,
    functionName: lambdaFunction.name,
  }
}

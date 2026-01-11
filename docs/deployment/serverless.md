# Serverless Deployment

> Deploy esm.do on serverless platforms for automatic scaling and pay-per-use pricing.

## AWS Lambda

### Prerequisites

- AWS Account with appropriate permissions
- [AWS CLI](https://aws.amazon.com/cli/) configured
- [Serverless Framework](https://www.serverless.com/) or [AWS SAM](https://aws.amazon.com/serverless/sam/)
- Node.js 18+

### Quick Start with Serverless Framework

```bash
# Navigate to AWS deployment directory
cd deploy/aws

# Install dependencies
npm install

# Deploy to development
npx serverless deploy --stage dev

# Deploy to production
npx serverless deploy --stage production
```

### serverless.yml Configuration

```yaml
service: esm-do
frameworkVersion: "3"

provider:
  name: aws
  runtime: nodejs20.x
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'us-east-1'}
  memorySize: 512
  timeout: 30
  architecture: arm64

  environment:
    NODE_ENV: ${self:provider.stage}
    ESM_STORAGE_TYPE: ${env:ESM_STORAGE_TYPE, 's3'}
    ESM_S3_BUCKET: ${self:custom.s3Bucket}
    ESM_DYNAMODB_TABLE: ${self:custom.dynamoTable}

  httpApi:
    cors:
      allowedOrigins:
        - '*'
      allowedHeaders:
        - Content-Type
        - Authorization
      allowedMethods:
        - GET
        - POST
        - DELETE
      maxAge: 86400

  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - s3:GetObject
            - s3:PutObject
            - s3:DeleteObject
            - s3:ListBucket
          Resource:
            - arn:aws:s3:::${self:custom.s3Bucket}
            - arn:aws:s3:::${self:custom.s3Bucket}/*
        - Effect: Allow
          Action:
            - dynamodb:GetItem
            - dynamodb:PutItem
            - dynamodb:DeleteItem
            - dynamodb:Query
            - dynamodb:Scan
          Resource:
            - arn:aws:dynamodb:${self:provider.region}:*:table/${self:custom.dynamoTable}
            - arn:aws:dynamodb:${self:provider.region}:*:table/${self:custom.dynamoTable}/index/*

custom:
  s3Bucket: esm-do-modules-${self:provider.stage}
  dynamoTable: esm-do-metadata-${self:provider.stage}

  esbuild:
    bundle: true
    minify: true
    sourcemap: true
    target: node20
    platform: node
    format: esm

plugins:
  - serverless-esbuild
  - serverless-offline

functions:
  api:
    handler: handler.handler
    events:
      - httpApi:
          method: GET
          path: /{proxy+}
      - httpApi:
          method: POST
          path: /{proxy+}
      - httpApi:
          method: DELETE
          path: /{proxy+}

resources:
  Resources:
    ModuleStorageBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:custom.s3Bucket}
        VersioningConfiguration:
          Status: Enabled
        BucketEncryption:
          ServerSideEncryptionConfiguration:
            - ServerSideEncryptionByDefault:
                SSEAlgorithm: AES256

    ModuleMetadataTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:custom.dynamoTable}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: pk
            AttributeType: S
          - AttributeName: sk
            AttributeType: S
        KeySchema:
          - AttributeName: pk
            KeyType: HASH
          - AttributeName: sk
            KeyType: RANGE
```

### Lambda Handler

```typescript
// deploy/aws/handler.ts
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createApp } from '../../src/app';

const app = createApp({
  storage: {
    type: 's3',
    bucket: process.env.ESM_S3_BUCKET!,
    prefix: process.env.ESM_S3_PREFIX || 'modules/',
  },
  metadata: {
    type: 'dynamodb',
    tableName: process.env.ESM_DYNAMODB_TABLE!,
  },
});

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const { requestContext, body, headers, rawPath, rawQueryString } = event;

  const request = new Request(
    `https://${requestContext.domainName}${rawPath}${rawQueryString ? `?${rawQueryString}` : ''}`,
    {
      method: requestContext.http.method,
      headers: new Headers(headers as Record<string, string>),
      body: body && requestContext.http.method !== 'GET' ? body : undefined,
    }
  );

  const response = await app.fetch(request);

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: await response.text(),
    isBase64Encoded: false,
  };
}
```

### AWS SAM Alternative

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: esm.do - Living ESM module system

Globals:
  Function:
    Timeout: 30
    MemorySize: 512
    Runtime: nodejs20.x
    Architectures:
      - arm64

Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - staging
      - production

Resources:
  EsmDoFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: dist/handler.handler
      CodeUri: .
      Environment:
        Variables:
          NODE_ENV: !Ref Environment
          ESM_S3_BUCKET: !Ref ModuleStorageBucket
          ESM_DYNAMODB_TABLE: !Ref ModuleMetadataTable
      Events:
        ApiGateway:
          Type: HttpApi
          Properties:
            Path: /{proxy+}
            Method: ANY
      Policies:
        - S3CrudPolicy:
            BucketName: !Ref ModuleStorageBucket
        - DynamoDBCrudPolicy:
            TableName: !Ref ModuleMetadataTable

  ModuleStorageBucket:
    Type: AWS::S3::Bucket
    Properties:
      VersioningConfiguration:
        Status: Enabled

  ModuleMetadataTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: pk
          AttributeType: S
        - AttributeName: sk
          AttributeType: S
      KeySchema:
        - AttributeName: pk
          KeyType: HASH
        - AttributeName: sk
          KeyType: RANGE

Outputs:
  ApiUrl:
    Description: API Gateway endpoint URL
    Value: !Sub "https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
```

### Cold Start Optimization

```yaml
# Use Provisioned Concurrency
functions:
  api:
    handler: handler.handler
    provisionedConcurrency: 5
    events:
      - httpApi: '*'

# Or use Lambda SnapStart (Java) or optimization techniques
provider:
  # Keep functions warm
  tracing:
    lambda: true
```

---

## Google Cloud Run

### Prerequisites

- Google Cloud account
- [gcloud CLI](https://cloud.google.com/sdk/gcloud) configured
- Docker installed
- Project with Cloud Run API enabled

### Quick Start

```bash
# Navigate to GCP deployment directory
cd deploy/gcp

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Deploy using Cloud Build
gcloud builds submit --config cloudbuild.yaml

# Or deploy directly
gcloud run deploy esm-do \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### cloudbuild.yaml

```yaml
substitutions:
  _REGION: us-central1
  _SERVICE_NAME: esm-do
  _MAX_INSTANCES: "10"
  _MIN_INSTANCES: "0"
  _MEMORY: "512Mi"
  _CPU: "1"
  _CONCURRENCY: "80"

steps:
  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_SERVICE_NAME}/${_SERVICE_NAME}:${SHORT_SHA}'
      - '-f'
      - 'deploy/gcp/Dockerfile'
      - '.'

  # Push to Artifact Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_SERVICE_NAME}/${_SERVICE_NAME}:${SHORT_SHA}'

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args:
      - 'run'
      - 'deploy'
      - '${_SERVICE_NAME}'
      - '--image'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_SERVICE_NAME}/${_SERVICE_NAME}:${SHORT_SHA}'
      - '--region'
      - '${_REGION}'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--memory'
      - '${_MEMORY}'
      - '--cpu'
      - '${_CPU}'
      - '--min-instances'
      - '${_MIN_INSTANCES}'
      - '--max-instances'
      - '${_MAX_INSTANCES}'
      - '--concurrency'
      - '${_CONCURRENCY}'

images:
  - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_SERVICE_NAME}/${_SERVICE_NAME}:${SHORT_SHA}'
```

### Cloud Run Service Configuration

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: esm-do
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "100"
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
        - image: gcr.io/PROJECT_ID/esm-do:latest
          ports:
            - containerPort: 8080
          resources:
            limits:
              cpu: "2"
              memory: 1Gi
          env:
            - name: NODE_ENV
              value: production
            - name: GCS_BUCKET
              value: esm-do-modules
          startupProbe:
            httpGet:
              path: /health
            initialDelaySeconds: 0
            timeoutSeconds: 3
            periodSeconds: 3
            failureThreshold: 10
          livenessProbe:
            httpGet:
              path: /health
            periodSeconds: 15
```

### Deploy with Custom Domain

```bash
# Map custom domain
gcloud run domain-mappings create \
  --service esm-do \
  --domain esm.do \
  --region us-central1

# Verify domain ownership and update DNS
gcloud run domain-mappings describe \
  --domain esm.do \
  --region us-central1
```

### Using Cloud Storage for Modules

```typescript
// deploy/gcp/storage.ts
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);

export async function storeModule(name: string, content: string) {
  const file = bucket.file(`modules/${name}`);
  await file.save(content, {
    contentType: 'application/javascript',
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });
}

export async function getModule(name: string): Promise<string | null> {
  const file = bucket.file(`modules/${name}`);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [content] = await file.download();
  return content.toString();
}
```

---

## Azure Functions

### Prerequisites

- Azure account
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- [Azure Functions Core Tools](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- Node.js 18+

### Quick Start

```bash
# Navigate to Azure deployment directory
cd deploy/azure

# Install dependencies
npm install

# Create resources and deploy
./deploy.sh

# Or deploy manually
func azure functionapp publish esm-do
```

### host.json Configuration

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      }
    },
    "logLevel": {
      "default": "Information",
      "Host.Results": "Error",
      "Function": "Information"
    }
  },
  "extensions": {
    "http": {
      "routePrefix": "",
      "maxOutstandingRequests": 200,
      "maxConcurrentRequests": 100,
      "dynamicThrottlesEnabled": true
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  },
  "functionTimeout": "00:05:00"
}
```

### Function Configuration

```json
// api/function.json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get", "post", "delete"],
      "route": "{*segments}"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

### Azure Function Handler

```typescript
// deploy/azure/api/index.ts
import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { createApp } from '../../../src/app';

const app = createApp({
  storage: {
    type: 'azure-blob',
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
    containerName: 'modules',
  },
});

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const url = `https://${req.headers.host}${req.url}`;

  const request = new Request(url, {
    method: req.method || 'GET',
    headers: new Headers(req.headers as Record<string, string>),
    body: req.body && req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
  });

  const response = await app.fetch(request);

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  context.res = {
    status: response.status,
    headers,
    body: await response.text(),
  };
};

export default httpTrigger;
```

### Deploy Script

```bash
#!/bin/bash
# deploy/azure/deploy.sh

set -e

RESOURCE_GROUP="esm-do-rg"
LOCATION="eastus"
STORAGE_ACCOUNT="esmdo$(openssl rand -hex 4)"
FUNCTION_APP="esm-do"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --location $LOCATION \
  --resource-group $RESOURCE_GROUP \
  --sku Standard_LRS

# Create function app
az functionapp create \
  --resource-group $RESOURCE_GROUP \
  --consumption-plan-location $LOCATION \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name $FUNCTION_APP \
  --storage-account $STORAGE_ACCOUNT

# Configure settings
az functionapp config appsettings set \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --settings \
    NODE_ENV=production \
    AZURE_STORAGE_CONNECTION_STRING="$(az storage account show-connection-string -n $STORAGE_ACCOUNT -g $RESOURCE_GROUP --query connectionString -o tsv)"

# Deploy
func azure functionapp publish $FUNCTION_APP

echo "Deployed to: https://${FUNCTION_APP}.azurewebsites.net"
```

### Premium Plan for Better Performance

```bash
# Create premium plan for faster cold starts
az functionapp plan create \
  --name esm-do-premium \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku EP1

# Create function app on premium plan
az functionapp create \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --plan esm-do-premium \
  --storage-account $STORAGE_ACCOUNT \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4
```

---

## Comparison Table

| Feature | AWS Lambda | Cloud Run | Azure Functions |
|---------|------------|-----------|-----------------|
| **Cold Start** | 100-500ms | 0-2s | 100-500ms |
| **Max Timeout** | 15 minutes | 60 minutes | 10 minutes |
| **Max Memory** | 10GB | 32GB | 14GB |
| **Pricing Model** | Per request + duration | Per request + CPU/memory | Per execution + duration |
| **Container Support** | Yes (via ECR) | Native | Yes |
| **Min Instances** | Provisioned Concurrency | Yes (min-instances) | Premium Plan |
| **Auto-scaling** | Automatic | Automatic | Automatic |
| **Custom Domains** | Via API Gateway | Native | Yes |
| **VPC Support** | Yes | VPC Connector | VNet Integration |
| **Best For** | AWS ecosystem, high throughput | Simple deployment, containers | Azure ecosystem |

## Common Serverless Patterns

### Warm-up Strategy

```typescript
// Keep functions warm with scheduled pings
export async function warmup(event: any) {
  if (event.source === 'serverless-plugin-warmup') {
    console.log('Warmup request');
    return { statusCode: 200 };
  }
  // Normal handler logic
}
```

### Connection Pooling

```typescript
// Reuse database connections across invocations
let dbPool: Pool | null = null;

function getPool() {
  if (!dbPool) {
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1, // Limit connections in serverless
    });
  }
  return dbPool;
}
```

### Async Processing with Queues

```typescript
// Offload heavy work to queues
export async function handler(event: APIGatewayEvent) {
  // Quick response
  await sqs.sendMessage({
    QueueUrl: process.env.QUEUE_URL!,
    MessageBody: JSON.stringify(event.body),
  }).promise();

  return { statusCode: 202, body: 'Accepted' };
}
```

## Troubleshooting

### Cold Start Issues

1. **Use provisioned concurrency** (AWS)
2. **Set min-instances** (Cloud Run)
3. **Use Premium Plan** (Azure)
4. **Optimize bundle size**
5. **Use lightweight frameworks**

### Timeout Issues

1. Increase timeout limits
2. Use async patterns with queues
3. Break down into smaller functions
4. Use streaming responses where supported

### Memory Issues

1. Monitor actual memory usage
2. Increase memory allocation
3. Optimize code for memory efficiency
4. Use lazy loading for dependencies

## Next Steps

1. Set up [Monitoring](./monitoring.md) for serverless observability
2. Configure CI/CD for automated deployments
3. Implement [Edge deployment](./edge.md) for lower latency
4. Review cost optimization strategies

## Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Azure Functions Documentation](https://docs.microsoft.com/en-us/azure/azure-functions/)
- [Serverless Framework](https://www.serverless.com/framework/docs)

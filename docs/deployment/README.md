# Deployment Guide

> Comprehensive deployment documentation for esm.do - the living ESM module system for AI agents.

## Quick Start

Choose the fastest path based on your infrastructure:

| Platform | Command | Time to Deploy |
|----------|---------|----------------|
| **Cloudflare Workers** | `npx wrangler deploy` | ~30 seconds |
| **Docker** | `docker compose up` | ~2 minutes |
| **Fly.io** | `fly deploy` | ~3 minutes |
| **Railway** | Connect repo in dashboard | ~2 minutes |
| **AWS Lambda** | `npx serverless deploy` | ~5 minutes |

## Platform Comparison

| Feature | Cloudflare | Docker/K8s | Fly.io | AWS Lambda | GCP Cloud Run |
|---------|------------|------------|--------|------------|---------------|
| **Cold Start** | ~5ms | N/A | ~100ms | ~200ms | ~100ms |
| **Global Edge** | 300+ locations | Manual | 30+ regions | Regional | Regional |
| **Scaling** | Automatic | Manual/HPA | Automatic | Automatic | Automatic |
| **Cost Model** | Per request | Per resource | Per VM | Per request | Per request |
| **Max Timeout** | 30s (free), 15m (paid) | Unlimited | 5m | 15m | 60m |
| **Native Workers** | Yes | Miniflare | Miniflare | Adapted | Adapted |
| **Persistent Storage** | Durable Objects, R2, KV | External | External | S3, DynamoDB | Cloud Storage |
| **Best For** | Production, Edge | Self-hosted, Full control | Easy global deploy | AWS ecosystem | GCP ecosystem |

## Architecture Overview

```
                                 esm.do Deployment Architecture

    ┌─────────────────────────────────────────────────────────────────────────────┐
    │                              Client Layer                                    │
    │                                                                              │
    │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
    │   │   Browser    │    │   CLI/SDK    │    │  AI Agents   │                  │
    │   │  (esm.do/*)  │    │ (npm, MCP)   │    │   (Claude)   │                  │
    │   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
    │          │                   │                   │                          │
    └──────────┼───────────────────┼───────────────────┼──────────────────────────┘
               │                   │                   │
               └───────────────────┼───────────────────┘
                                   │
    ┌──────────────────────────────┼──────────────────────────────────────────────┐
    │                              │     Edge/CDN Layer                           │
    │                              ▼                                              │
    │   ┌────────────────────────────────────────────────────────────────────┐   │
    │   │                      Load Balancer / CDN                           │   │
    │   │           (Cloudflare, CloudFront, Cloud CDN, Fastly)              │   │
    │   └────────────────────────────────────────────────────────────────────┘   │
    │                              │                                              │
    └──────────────────────────────┼──────────────────────────────────────────────┘
                                   │
    ┌──────────────────────────────┼──────────────────────────────────────────────┐
    │                              │     Compute Layer                            │
    │                              ▼                                              │
    │   ┌─────────────────────────────────────────────────────────────────────┐  │
    │   │                                                                      │  │
    │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
    │   │  │   Worker    │  │   Worker    │  │   Worker    │  │   Worker    │ │  │
    │   │  │  Instance   │  │  Instance   │  │  Instance   │  │  Instance   │ │  │
    │   │  │   (IAD)     │  │   (SFO)     │  │   (AMS)     │  │   (SIN)     │ │  │
    │   │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │  │
    │   │         │                │                │                │        │  │
    │   │  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐ │  │
    │   │  │                    esm.do Application                          │ │  │
    │   │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐               │ │  │
    │   │  │  │   Router   │──│  Executor  │──│   Cache    │               │ │  │
    │   │  │  └────────────┘  └────────────┘  └────────────┘               │ │  │
    │   │  │                                                                │ │  │
    │   │  │  ┌────────────────────────────────────────────────────────┐   │ │  │
    │   │  │  │              ai-evaluate Sandbox                        │   │ │  │
    │   │  │  │   - V8 Isolates      - Test Runner                     │   │ │  │
    │   │  │  │   - Module Loader    - Script Executor                 │   │ │  │
    │   │  │  └────────────────────────────────────────────────────────┘   │ │  │
    │   │  └────────────────────────────────────────────────────────────────┘ │  │
    │   │                                                                      │  │
    │   └─────────────────────────────────────────────────────────────────────┘  │
    │                              │                                              │
    └──────────────────────────────┼──────────────────────────────────────────────┘
                                   │
    ┌──────────────────────────────┼──────────────────────────────────────────────┐
    │                              │     Storage Layer                            │
    │                              ▼                                              │
    │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
    │   │   Module DB    │  │  Blob Storage  │  │     Cache      │               │
    │   │  (D1, SQLite,  │  │  (R2, S3,     │  │  (KV, Redis,   │               │
    │   │   PostgreSQL)  │  │   GCS, Blob)   │  │   Memcached)   │               │
    │   └────────────────┘  └────────────────┘  └────────────────┘               │
    │                                                                              │
    └──────────────────────────────────────────────────────────────────────────────┘
```

## Choosing the Right Platform

### Use Cloudflare Workers When...

- You want the lowest latency with 300+ edge locations
- Native Workers API compatibility is important
- You need Durable Objects for stateful applications
- Cost efficiency at scale is a priority
- You want zero cold starts

### Use Docker/Kubernetes When...

- You need full control over the infrastructure
- Compliance requires on-premises or private cloud
- You have existing container orchestration
- Custom runtime requirements exist
- You need to integrate with internal services

### Use Serverless (AWS/GCP/Azure) When...

- You are already in that cloud ecosystem
- You need deep integration with cloud-native services
- Managed scaling and operations are priorities
- You prefer pay-per-use pricing
- Regional deployment is sufficient

### Use Edge Platforms (Fly.io, Vercel) When...

- You want global distribution with minimal config
- Simple deployment from git is desired
- You need a balance of control and convenience
- PostgreSQL or other managed databases are needed
- You want preview environments for PRs

## Environment Variables

All deployment methods support these configuration options:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `production` | No |
| `PORT` | HTTP server port | `8787` | No |
| `LOG_LEVEL` | Logging verbosity | `info` | No |
| `ESM_STORAGE_TYPE` | Storage backend | `memory` | No |
| `ESM_MAX_EXECUTION_TIME` | Script timeout (ms) | `30000` | No |
| `ESM_MAX_BODY_SIZE` | Max request body | `10mb` | No |
| `CORS_ORIGINS` | Allowed origins | `*` | No |
| `METRICS_ENABLED` | Enable Prometheus | `true` | No |
| `METRICS_PORT` | Metrics endpoint port | `9090` | No |

## Health Checks

All deployments expose a health endpoint:

```bash
# Check service health
curl https://your-deployment.example.com/health

# Response
{
  "status": "healthy",
  "version": "0.0.1",
  "uptime": 3600,
  "checks": {
    "storage": "ok",
    "sandbox": "ok"
  }
}
```

## Deployment Guides

| Guide | Description |
|-------|-------------|
| [Cloudflare Workers](./cloudflare.md) | Native Workers deployment with Durable Objects |
| [Docker](./docker.md) | Container-based deployment with Docker Compose |
| [Kubernetes](./kubernetes.md) | Production Kubernetes with Helm charts |
| [Serverless](./serverless.md) | AWS Lambda, GCP Cloud Run, Azure Functions |
| [Edge Platforms](./edge.md) | Fly.io, Vercel, Netlify, Render |
| [Monitoring](./monitoring.md) | Prometheus, Grafana, alerting |

## Security Considerations

1. **Network Security**
   - Always use HTTPS in production
   - Configure CORS appropriately
   - Use API keys or OAuth for sensitive operations

2. **Runtime Security**
   - Module code runs in sandboxed V8 isolates
   - Network access is restricted by default
   - Timeouts prevent infinite loops

3. **Access Control**
   - Implement authentication for write operations
   - Use rate limiting to prevent abuse
   - Monitor for suspicious patterns

## Performance Optimization

1. **Caching Strategy**
   - Enable module caching for frequently accessed modules
   - Use CDN caching for static module files
   - Configure appropriate TTLs

2. **Resource Allocation**
   - Start with recommended defaults
   - Monitor memory and CPU usage
   - Scale based on actual traffic patterns

3. **Cold Start Mitigation**
   - Use warm-up requests for serverless
   - Configure minimum instances where available
   - Consider edge caching for read-heavy workloads

## Next Steps

1. Choose a deployment platform based on your requirements
2. Follow the specific deployment guide
3. Configure monitoring and alerting
4. Set up CI/CD for automated deployments
5. Review security best practices

For support, visit [github.com/dot-do/esm/issues](https://github.com/dot-do/esm/issues).

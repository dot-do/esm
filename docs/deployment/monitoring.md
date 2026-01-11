# Monitoring and Observability

> Comprehensive monitoring setup for esm.do including metrics, logging, tracing, and alerting.

## Overview

The esm.do monitoring stack provides:

- **Metrics**: Prometheus-compatible metrics for performance tracking
- **Logging**: Structured JSON logging with multiple output targets
- **Tracing**: Distributed tracing for request flow analysis
- **Alerting**: Proactive alerting for issues before they impact users

```
                           Monitoring Architecture

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         esm.do Application                              │
    │                                                                          │
    │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
    │   │     Metrics     │  │     Logging     │  │     Tracing     │         │
    │   │   /metrics      │  │   JSON stdout   │  │    OpenTelemetry│         │
    │   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
    │            │                    │                    │                   │
    └────────────┼────────────────────┼────────────────────┼───────────────────┘
                 │                    │                    │
    ┌────────────┼────────────────────┼────────────────────┼───────────────────┐
    │            ▼                    ▼                    ▼                   │
    │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
    │   │   Prometheus    │  │    Loki/ELK     │  │     Jaeger      │         │
    │   │   (Scraping)    │  │  (Aggregation)  │  │   (Tracing)     │         │
    │   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
    │            │                    │                    │                   │
    │            └────────────────────┼────────────────────┘                   │
    │                                 │                                        │
    │                                 ▼                                        │
    │                        ┌─────────────────┐                              │
    │                        │     Grafana     │                              │
    │                        │  (Dashboards)   │                              │
    │                        └────────┬────────┘                              │
    │                                 │                                        │
    │                                 ▼                                        │
    │                        ┌─────────────────┐                              │
    │                        │   Alertmanager  │                              │
    │                        │   (Alerting)    │                              │
    │                        └─────────────────┘                              │
    │                                                                          │
    │                          Monitoring Stack                                │
    └──────────────────────────────────────────────────────────────────────────┘
```

## Metrics

### Prometheus Configuration

```yaml
# deploy/monitoring/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    service: esm-do
    environment: production

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

rule_files:
  - "alerts.yml"

scrape_configs:
  # Prometheus self-monitoring
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]

  # ESM.do application metrics
  - job_name: "esm-do"
    metrics_path: /metrics
    scheme: http
    static_configs:
      - targets: ["esm-do:8787"]
        labels:
          app: esm-do
          tier: api
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: "esm-do-${1}"

  # Kubernetes service discovery
  - job_name: "esm-do-kubernetes"
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
            - esm-do
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: replace
        target_label: app
```

### Available Metrics

#### HTTP Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `esm_http_requests_total` | Counter | Total HTTP requests by method, path, status |
| `esm_http_request_duration_seconds` | Histogram | Request duration in seconds |
| `esm_http_request_size_bytes` | Histogram | Request body size |
| `esm_http_response_size_bytes` | Histogram | Response body size |
| `esm_active_connections` | Gauge | Current active connections |

#### Module Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `esm_module_executions_total` | Counter | Module executions by name, status |
| `esm_module_execution_duration_seconds` | Histogram | Execution time per module |
| `esm_module_cache_hits_total` | Counter | Cache hits |
| `esm_module_cache_misses_total` | Counter | Cache misses |
| `esm_modules_total` | Gauge | Total modules registered |

#### Sandbox Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `esm_sandbox_violations_total` | Counter | Security violations detected |
| `esm_sandbox_memory_bytes` | Gauge | Sandbox memory usage |
| `esm_sandbox_cpu_time_seconds` | Counter | CPU time used by sandbox |

#### Test Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `esm_test_runs_total` | Counter | Test runs by module, status |
| `esm_test_duration_seconds` | Histogram | Test execution duration |
| `esm_tests_passed_total` | Counter | Passed tests |
| `esm_tests_failed_total` | Counter | Failed tests |

### Metrics Implementation

```typescript
// src/metrics.ts
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export const registry = new Registry();

// HTTP metrics
export const httpRequestsTotal = new Counter({
  name: 'esm_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'esm_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [registry],
});

export const activeConnections = new Gauge({
  name: 'esm_active_connections',
  help: 'Number of active connections',
  registers: [registry],
});

// Module metrics
export const moduleExecutions = new Counter({
  name: 'esm_module_executions_total',
  help: 'Total module executions',
  labelNames: ['module', 'status'],
  registers: [registry],
});

export const moduleExecutionDuration = new Histogram({
  name: 'esm_module_execution_duration_seconds',
  help: 'Module execution duration',
  labelNames: ['module'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [registry],
});

// Metrics middleware
export function metricsMiddleware(handler: Handler): Handler {
  return async (request) => {
    const start = Date.now();
    const path = new URL(request.url).pathname;
    const method = request.method;

    activeConnections.inc();

    try {
      const response = await handler(request);
      const duration = (Date.now() - start) / 1000;
      const status = response.status.toString();

      httpRequestsTotal.labels(method, path, status).inc();
      httpRequestDuration.labels(method, path, status).observe(duration);

      return response;
    } finally {
      activeConnections.dec();
    }
  };
}

// Metrics endpoint handler
export async function handleMetrics(): Promise<Response> {
  const metrics = await registry.metrics();
  return new Response(metrics, {
    headers: { 'Content-Type': registry.contentType },
  });
}
```

## Alerting

### Alert Rules

```yaml
# deploy/monitoring/prometheus/alerts.yml
groups:
  - name: esm-do-service-health
    interval: 30s
    rules:
      # Service down
      - alert: EsmDoServiceDown
        expr: up{job="esm-do"} == 0
        for: 1m
        labels:
          severity: critical
          service: esm-do
        annotations:
          summary: "esm.do service is down"
          description: "The esm.do service at {{ $labels.instance }} has been down for more than 1 minute."
          runbook_url: "https://docs.esm.do/runbooks/service-down"

      # High error rate
      - alert: EsmDoHighErrorRate
        expr: |
          (
            sum(rate(esm_http_requests_total{status=~"5.."}[5m]))
            / sum(rate(esm_http_requests_total[5m]))
          ) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

  - name: esm-do-latency
    rules:
      # High P95 latency
      - alert: EsmDoHighP95Latency
        expr: |
          histogram_quantile(0.95, sum(rate(esm_http_request_duration_seconds_bucket[5m])) by (le))
          > 2.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency is high"
          description: "P95 latency is {{ $value | humanizeDuration }}"

      # Critical P99 latency
      - alert: EsmDoHighP99Latency
        expr: |
          histogram_quantile(0.99, sum(rate(esm_http_request_duration_seconds_bucket[5m])) by (le))
          > 5.0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "P99 latency is critically high"

  - name: esm-do-modules
    rules:
      # Module execution failures
      - alert: EsmDoModuleExecutionErrors
        expr: |
          (
            sum(rate(esm_module_executions_total{status="error"}[5m]))
            / sum(rate(esm_module_executions_total[5m]))
          ) > 0.10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High module execution error rate"

      # Sandbox violations
      - alert: EsmDoSandboxViolation
        expr: increase(esm_sandbox_violations_total[5m]) > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Sandbox violation detected"
          description: "{{ $value }} sandbox violations in the last 5 minutes"

  - name: esm-do-resources
    rules:
      # High memory usage
      - alert: EsmDoHighMemoryUsage
        expr: |
          (container_memory_usage_bytes{container="esm-do"}
          / container_spec_memory_limit_bytes{container="esm-do"}) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"

      # High CPU usage
      - alert: EsmDoHighCPUUsage
        expr: |
          rate(container_cpu_usage_seconds_total{container="esm-do"}[5m]) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
```

### Alertmanager Configuration

```yaml
# deploy/monitoring/alertmanager/alertmanager.yml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true
    - match:
        severity: critical
      receiver: 'slack-critical'
    - match:
        severity: warning
      receiver: 'slack-warning'

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts'
        send_resolved: true

  - name: 'slack-critical'
    slack_configs:
      - channel: '#alerts-critical'
        send_resolved: true
        title: '{{ .Status | toUpper }}: {{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'

  - name: 'slack-warning'
    slack_configs:
      - channel: '#alerts-warning'
        send_resolved: true

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
        severity: critical

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname']
```

## Logging

### Structured Logging

```typescript
// src/logger.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  version: string;
  [key: string]: unknown;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private level: LogLevel;
  private service: string;
  private version: string;

  constructor(options: { level?: LogLevel; service?: string; version?: string } = {}) {
    this.level = options.level || (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.service = options.service || 'esm-do';
    this.version = options.version || process.env.VERSION || 'unknown';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.level];
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      version: this.version,
      ...data,
    };

    console.log(JSON.stringify(entry));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('error', message, {
      ...data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }

  // Create child logger with additional context
  child(context: Record<string, unknown>): Logger {
    const child = new Logger({
      level: this.level,
      service: this.service,
      version: this.version,
    });
    // Add context to all logs
    return child;
  }
}

export const logger = new Logger();
```

### Request Logging Middleware

```typescript
// src/middleware/logging.ts
import { logger } from '../logger';
import { v4 as uuidv4 } from 'uuid';

export function loggingMiddleware(handler: Handler): Handler {
  return async (request) => {
    const requestId = request.headers.get('x-request-id') || uuidv4();
    const start = Date.now();
    const url = new URL(request.url);

    logger.info('Request started', {
      requestId,
      method: request.method,
      path: url.pathname,
      query: url.search,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for'),
    });

    try {
      const response = await handler(request);
      const duration = Date.now() - start;

      logger.info('Request completed', {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration,
      });

      // Add request ID to response
      const headers = new Headers(response.headers);
      headers.set('x-request-id', requestId);

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      const duration = Date.now() - start;

      logger.error('Request failed', error as Error, {
        requestId,
        method: request.method,
        path: url.pathname,
        duration,
      });

      throw error;
    }
  };
}
```

### Loki Configuration (for log aggregation)

```yaml
# deploy/monitoring/loki/loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://alertmanager:9093

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
```

### Promtail Configuration

```yaml
# deploy/monitoring/promtail/promtail-config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: containers
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_label_service']
        target_label: 'service'
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: message
            requestId: requestId
      - labels:
          level:
          requestId:
```

## Distributed Tracing

### OpenTelemetry Setup

```typescript
// src/tracing.ts
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'esm-do',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.VERSION || '0.0.1',
  }),
});

const exporter = new JaegerExporter({
  endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger:14268/api/traces',
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

export const tracer = trace.getTracer('esm-do');

// Tracing middleware
export function tracingMiddleware(handler: Handler): Handler {
  return async (request) => {
    const url = new URL(request.url);

    return tracer.startActiveSpan(
      `${request.method} ${url.pathname}`,
      async (span) => {
        try {
          span.setAttributes({
            'http.method': request.method,
            'http.url': request.url,
            'http.route': url.pathname,
          });

          const response = await handler(request);

          span.setAttributes({
            'http.status_code': response.status,
          });

          if (response.status >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status}`,
            });
          }

          return response;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  };
}

// Trace module execution
export async function traceModuleExecution<T>(
  moduleName: string,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`module.execute.${moduleName}`, async (span) => {
    try {
      span.setAttributes({
        'esm.module.name': moduleName,
      });

      const result = await fn();

      span.setAttributes({
        'esm.module.status': 'success',
      });

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.setAttributes({
        'esm.module.status': 'error',
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Jaeger Configuration

```yaml
# deploy/monitoring/jaeger/docker-compose.yml
version: "3.8"

services:
  jaeger:
    image: jaegertracing/all-in-one:1.50
    container_name: jaeger
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"  # UI
      - "14268:14268"  # HTTP collector
      - "14250:14250"  # gRPC collector
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
    networks:
      - monitoring
```

## Grafana Dashboards

### Docker Compose for Full Stack

```yaml
# deploy/monitoring/docker-compose.yml
version: "3.8"

services:
  prometheus:
    image: prom/prometheus:v2.47.0
    container_name: prometheus
    volumes:
      - ./prometheus:/etc/prometheus
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:10.1.0
    container_name: grafana
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    ports:
      - "3000:3000"
    depends_on:
      - prometheus
      - loki
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:v0.26.0
    container_name: alertmanager
    volumes:
      - ./alertmanager:/etc/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
    ports:
      - "9093:9093"
    networks:
      - monitoring

  loki:
    image: grafana/loki:2.9.0
    container_name: loki
    volumes:
      - ./loki:/etc/loki
      - loki-data:/loki
    command: -config.file=/etc/loki/loki-config.yml
    ports:
      - "3100:3100"
    networks:
      - monitoring

  promtail:
    image: grafana/promtail:2.9.0
    container_name: promtail
    volumes:
      - ./promtail:/etc/promtail
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/promtail-config.yml
    networks:
      - monitoring

  jaeger:
    image: jaegertracing/all-in-one:1.50
    container_name: jaeger
    ports:
      - "16686:16686"
      - "14268:14268"
    networks:
      - monitoring

networks:
  monitoring:
    driver: bridge

volumes:
  prometheus-data:
  grafana-data:
  loki-data:
```

### ESM.do Dashboard JSON

```json
{
  "dashboard": {
    "title": "esm.do Overview",
    "tags": ["esm-do"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
        "targets": [
          {
            "expr": "sum(rate(esm_http_requests_total[5m])) by (status)",
            "legendFormat": "{{status}}"
          }
        ]
      },
      {
        "title": "Latency (P50, P95, P99)",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(esm_http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "P50"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(esm_http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "P95"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(esm_http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "P99"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "gauge",
        "gridPos": {"h": 4, "w": 6, "x": 0, "y": 8},
        "targets": [
          {
            "expr": "sum(rate(esm_http_requests_total{status=~\"5..\"}[5m])) / sum(rate(esm_http_requests_total[5m])) * 100"
          }
        ],
        "options": {
          "thresholds": {
            "steps": [
              {"value": 0, "color": "green"},
              {"value": 1, "color": "yellow"},
              {"value": 5, "color": "red"}
            ]
          }
        }
      },
      {
        "title": "Module Executions",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 12},
        "targets": [
          {
            "expr": "sum(rate(esm_module_executions_total[5m])) by (status)",
            "legendFormat": "{{status}}"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "type": "gauge",
        "gridPos": {"h": 4, "w": 6, "x": 6, "y": 8},
        "targets": [
          {
            "expr": "sum(rate(esm_module_cache_hits_total[5m])) / (sum(rate(esm_module_cache_hits_total[5m])) + sum(rate(esm_module_cache_misses_total[5m]))) * 100"
          }
        ]
      }
    ]
  }
}
```

## Cloud Provider Monitoring

### Cloudflare Analytics

```typescript
// For Cloudflare Workers, use Analytics Engine
export async function logToAnalytics(
  env: Env,
  event: {
    method: string;
    path: string;
    status: number;
    duration: number;
  }
) {
  env.ANALYTICS.writeDataPoint({
    blobs: [event.method, event.path],
    doubles: [event.duration],
    indexes: [event.status.toString()],
  });
}
```

### AWS CloudWatch

```typescript
// deploy/aws/cloudwatch.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({});

export async function putMetric(
  name: string,
  value: number,
  unit: string,
  dimensions: { Name: string; Value: string }[]
) {
  await cloudwatch.putMetricData({
    Namespace: 'ESM.do',
    MetricData: [
      {
        MetricName: name,
        Value: value,
        Unit: unit,
        Dimensions: dimensions,
      },
    ],
  });
}
```

## Health Checks

### Health Endpoint

```typescript
// src/health.ts
interface HealthCheck {
  name: string;
  check: () => Promise<{ status: 'ok' | 'degraded' | 'error'; message?: string }>;
}

const healthChecks: HealthCheck[] = [
  {
    name: 'storage',
    check: async () => {
      // Check storage connectivity
      try {
        await storage.ping();
        return { status: 'ok' };
      } catch (error) {
        return { status: 'error', message: (error as Error).message };
      }
    },
  },
  {
    name: 'sandbox',
    check: async () => {
      // Check sandbox is working
      try {
        await sandbox.evaluate('1 + 1');
        return { status: 'ok' };
      } catch (error) {
        return { status: 'error', message: (error as Error).message };
      }
    },
  },
];

export async function handleHealth(): Promise<Response> {
  const results = await Promise.all(
    healthChecks.map(async (check) => ({
      name: check.name,
      ...(await check.check()),
    }))
  );

  const overallStatus = results.every((r) => r.status === 'ok')
    ? 'healthy'
    : results.some((r) => r.status === 'error')
    ? 'unhealthy'
    : 'degraded';

  const response = {
    status: overallStatus,
    version: process.env.VERSION || '0.0.1',
    uptime: process.uptime(),
    checks: Object.fromEntries(
      results.map((r) => [r.name, r.status])
    ),
  };

  return new Response(JSON.stringify(response), {
    status: overallStatus === 'unhealthy' ? 503 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Troubleshooting

### Common Issues

1. **Metrics not appearing**: Check Prometheus targets at `/targets`
2. **Missing logs**: Verify Promtail configuration and container labels
3. **Traces not connecting**: Ensure trace context propagation headers

### Debug Commands

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=up'

# Check Loki logs
curl -G -s 'http://localhost:3100/loki/api/v1/query_range' \
  --data-urlencode 'query={service="esm-do"}'

# Test alertmanager
curl -X POST http://localhost:9093/api/v1/alerts \
  -d '[{"labels":{"alertname":"test"}}]'
```

## Next Steps

1. Set up on-call rotations with PagerDuty
2. Create runbooks for common alerts
3. Implement SLO tracking
4. Set up synthetic monitoring

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)

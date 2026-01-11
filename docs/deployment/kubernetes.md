# Kubernetes Deployment

> Deploy esm.do on Kubernetes for production-grade orchestration, auto-scaling, and high availability.

## Prerequisites

- Kubernetes cluster (1.25+)
- kubectl configured
- Helm 3.x installed
- Container registry access

## Quick Start

```bash
# Add the esm-do Helm repository (when published)
helm repo add esm-do https://charts.esm.do
helm repo update

# Install with default values
helm install esm-do esm-do/esm-do

# Or install from local chart
helm install esm-do ./deploy/k8s/helm/esm-do
```

## Helm Chart

### Chart Structure

```
deploy/k8s/helm/esm-do/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── pdb.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── serviceaccount.yaml
│   └── NOTES.txt
└── .helmignore
```

### Chart.yaml

```yaml
apiVersion: v2
name: esm-do
description: A Helm chart for esm.do - Living ESM module system for AI agents
type: application
version: 0.1.0
appVersion: "0.0.1"

home: https://esm.do
sources:
  - https://github.com/dot-do/esm

keywords:
  - esm
  - modules
  - ai
  - cloudflare
  - workers
  - typescript

maintainers:
  - name: dot-do
    url: https://github.com/dot-do
```

## Configuration Options

### Basic Configuration

```yaml
# values.yaml - Basic configuration
replicaCount: 2

image:
  repository: ghcr.io/dot-do/esm
  pullPolicy: IfNotPresent
  tag: ""  # Defaults to Chart appVersion

service:
  type: ClusterIP
  port: 80
  targetPort: 8787

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: esm.do
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: esm-do-tls
      hosts:
        - esm.do
```

### Complete values.yaml Reference

```yaml
# Number of replicas
replicaCount: 2

image:
  repository: ghcr.io/dot-do/esm
  pullPolicy: IfNotPresent
  tag: ""

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

# Service Account
serviceAccount:
  create: true
  automount: true
  annotations: {}
  name: ""

# Pod settings
podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "9090"
  prometheus.io/path: "/metrics"

podLabels: {}

podSecurityContext:
  fsGroup: 1000
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 1000
  seccompProfile:
    type: RuntimeDefault

# Service configuration
service:
  type: ClusterIP
  port: 80
  targetPort: 8787
  nodePort: ""
  annotations: {}

# Ingress configuration
ingress:
  enabled: false
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
  hosts:
    - host: esm.do
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: esm-do-tls
      hosts:
        - esm.do

# Resource limits
resources:
  limits:
    cpu: 1000m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

# Probes
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 10
  periodSeconds: 15
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 30

# Autoscaling
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max

# Pod Disruption Budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1

# Scheduling
nodeSelector: {}
tolerations: []
affinity: {}

topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: esm-do

# Application configuration
config:
  logLevel: "info"
  devMode: false
  maxBodySize: "10mb"
  requestTimeout: 30000
  metricsEnabled: true
  metricsPort: 9090
  corsEnabled: true
  corsOrigins: "*"
  nodejsCompat: true

# Secrets
secrets:
  create: false
  existingSecret: ""
  values: {}

# Environment variables
env: []
envFrom: []

# Volumes
volumes: []
volumeMounts: []

# Extra containers
initContainers: []
extraContainers: []

# Lifecycle hooks
lifecycle:
  preStop:
    exec:
      command: ["/bin/sh", "-c", "sleep 10"]

# Network Policy
networkPolicy:
  enabled: false
  ingress: []
  egress: []

terminationGracePeriodSeconds: 30
```

## Installation Methods

### Method 1: Helm Install

```bash
# Create namespace
kubectl create namespace esm-do

# Install with custom values
helm install esm-do ./deploy/k8s/helm/esm-do \
  --namespace esm-do \
  --values custom-values.yaml

# Upgrade existing installation
helm upgrade esm-do ./deploy/k8s/helm/esm-do \
  --namespace esm-do \
  --values custom-values.yaml

# Uninstall
helm uninstall esm-do --namespace esm-do
```

### Method 2: Helm with Inline Values

```bash
helm install esm-do ./deploy/k8s/helm/esm-do \
  --namespace esm-do \
  --create-namespace \
  --set replicaCount=3 \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=esm.do \
  --set autoscaling.enabled=true \
  --set autoscaling.maxReplicas=20
```

### Method 3: kubectl Apply

```bash
# Render templates and apply
helm template esm-do ./deploy/k8s/helm/esm-do \
  --namespace esm-do \
  --values custom-values.yaml | kubectl apply -f -
```

## Scaling Strategies

### Horizontal Pod Autoscaler

The chart includes HPA configuration:

```yaml
# templates/hpa.yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "esm-do.fullname" . }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "esm-do.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
  behavior:
    {{- toYaml .Values.autoscaling.behavior | nindent 4 }}
{{- end }}
```

### Custom Metrics Scaling

```yaml
# values-custom-metrics.yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 50
  customMetrics:
    - type: Pods
      pods:
        metric:
          name: esm_http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
    - type: External
      external:
        metric:
          name: queue_depth
          selector:
            matchLabels:
              queue: esm-modules
        target:
          type: AverageValue
          averageValue: "30"
```

### Vertical Pod Autoscaler

```yaml
# vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: esm-do-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: esm-do
  updatePolicy:
    updateMode: Auto
  resourcePolicy:
    containerPolicies:
      - containerName: esm-do
        minAllowed:
          cpu: 100m
          memory: 128Mi
        maxAllowed:
          cpu: 4
          memory: 4Gi
        controlledResources: ["cpu", "memory"]
```

## High Availability Configuration

### Multi-Zone Deployment

```yaml
# values-ha.yaml
replicaCount: 6

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values:
                  - esm-do
          topologyKey: topology.kubernetes.io/zone

topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: esm-do
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: esm-do

podDisruptionBudget:
  enabled: true
  minAvailable: 4
```

### Rolling Update Strategy

```yaml
# In deployment.yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 0
```

## Ingress Configuration

### Nginx Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: esm.do
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: esm-do-tls
      hosts:
        - esm.do
```

### Traefik Ingress

```yaml
ingress:
  enabled: true
  className: traefik
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.middlewares: esm-do-ratelimit@kubernetescrd
  hosts:
    - host: esm.do
      paths:
        - path: /
          pathType: Prefix
```

### AWS ALB Ingress

```yaml
ingress:
  enabled: true
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
```

## Secret Management

### Using External Secrets Operator

```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: esm-do-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: aws-secrets-manager
  target:
    name: esm-do-secrets
    creationPolicy: Owner
  data:
    - secretKey: API_KEY
      remoteRef:
        key: esm-do/production
        property: api_key
    - secretKey: DATABASE_URL
      remoteRef:
        key: esm-do/production
        property: database_url
```

### Using Sealed Secrets

```bash
# Create sealed secret
kubeseal --format yaml < secret.yaml > sealed-secret.yaml
kubectl apply -f sealed-secret.yaml
```

## Monitoring Integration

### ServiceMonitor for Prometheus

```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: esm-do
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: esm-do
  endpoints:
    - port: metrics
      interval: 15s
      path: /metrics
      scheme: http
```

### PrometheusRule for Alerts

```yaml
# prometheusrule.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: esm-do-alerts
spec:
  groups:
    - name: esm-do
      rules:
        - alert: EsmDoHighErrorRate
          expr: |
            sum(rate(esm_http_requests_total{status=~"5.."}[5m]))
            / sum(rate(esm_http_requests_total[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: High error rate detected
```

## Troubleshooting

### Check Pod Status

```bash
# List pods
kubectl get pods -n esm-do -l app.kubernetes.io/name=esm-do

# Describe pod
kubectl describe pod -n esm-do esm-do-xxxxx

# Check logs
kubectl logs -n esm-do esm-do-xxxxx --tail=100 -f

# Check previous container logs (if crashed)
kubectl logs -n esm-do esm-do-xxxxx --previous
```

### Debug Networking

```bash
# Test service connectivity
kubectl run test --rm -it --image=curlimages/curl -- /bin/sh
# Inside pod: curl http://esm-do.esm-do.svc.cluster.local/health

# Check endpoints
kubectl get endpoints -n esm-do esm-do

# Check service
kubectl describe service -n esm-do esm-do
```

### Common Issues

#### 1. Pods Not Starting

```bash
# Check events
kubectl get events -n esm-do --sort-by='.lastTimestamp'

# Check resource quotas
kubectl describe resourcequota -n esm-do
```

#### 2. Image Pull Errors

```bash
# Check image pull secrets
kubectl get secrets -n esm-do

# Create image pull secret
kubectl create secret docker-registry regcred \
  --docker-server=ghcr.io \
  --docker-username=USERNAME \
  --docker-password=TOKEN \
  -n esm-do
```

#### 3. Ingress Not Working

```bash
# Check ingress status
kubectl describe ingress -n esm-do esm-do

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```

## Production Checklist

- [ ] Configure resource requests and limits
- [ ] Enable Pod Disruption Budget
- [ ] Set up Horizontal Pod Autoscaler
- [ ] Configure topology spread constraints
- [ ] Enable network policies
- [ ] Set up pod security context
- [ ] Configure proper probes
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Enable TLS termination
- [ ] Set up backup procedures
- [ ] Document runbooks

## Next Steps

1. Set up [Monitoring](./monitoring.md) with Prometheus and Grafana
2. Configure CI/CD for automated Helm deployments
3. Implement GitOps with ArgoCD or Flux
4. Set up disaster recovery procedures

## Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Pod Disruption Budgets](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)

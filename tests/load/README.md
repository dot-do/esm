# Load Testing for esm.do

This directory contains load testing infrastructure for the esm.do API using both k6 and Artillery.

## Overview

The load testing suite provides:

- **k6**: Modern load testing tool with JavaScript scripting
- **Artillery**: Node.js-based load testing with YAML configuration
- **Docker infrastructure**: InfluxDB + Grafana for metrics visualization

## Prerequisites

### For k6 (recommended)

Install k6 locally:

```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

### For Artillery

```bash
npm install -g artillery
# Or use npx
npx artillery
```

### For Docker infrastructure

```bash
docker-compose --version  # Docker Compose v2+
```

## Quick Start

### Run smoke test with k6

```bash
# From project root
npm run test:load

# Or directly
k6 run tests/load/k6/api.js
```

### Run with specific parameters

```bash
# Custom VUs and duration
k6 run --vus 50 --duration 5m tests/load/k6/api.js

# Against production
BASE_URL=https://esm.do k6 run tests/load/k6/api.js
```

## k6 Test Files

### `k6/api.js` - Main API Load Test

Tests all API operations under configurable load:

- Read operations (health, list modules, get module)
- Write operations (create, update, delete modules)
- Execution operations (execute module, batch execution)

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:8787` | Target API URL |
| `VUS` | `10` | Number of virtual users |
| `DURATION` | `30s` | Test duration |

**Usage:**

```bash
# Basic run
k6 run tests/load/k6/api.js

# Custom configuration
VUS=50 DURATION=5m BASE_URL=https://esm.do k6 run tests/load/k6/api.js
```

### `k6/scenarios.js` - Scenario-Based Testing

Provides different load testing scenarios:

| Scenario | VUs | Duration | Purpose |
|----------|-----|----------|---------|
| `smoke` | 1 | 1 minute | Verify basic functionality |
| `load` | 0-50 | 5 minutes | Normal expected load |
| `stress` | 100-500 | ~30 minutes | Push system limits |
| `spike` | 100-1000 | ~8 minutes | Sudden traffic burst |
| `soak` | 50 | 1 hour | Memory leaks, stability |
| `breakpoint` | variable | ~12 minutes | Find breaking point |

**Usage:**

```bash
# Run smoke test
k6 run --env SCENARIO=smoke tests/load/k6/scenarios.js

# Run stress test
k6 run --env SCENARIO=stress tests/load/k6/scenarios.js

# Run spike test against production
BASE_URL=https://esm.do k6 run --env SCENARIO=spike tests/load/k6/scenarios.js
```

## Artillery Tests

### `artillery/config.yml` - Main Configuration

Multi-phase load test with custom scenarios.

**Environments:**

- `local` - Local development testing
- `staging` - Staging environment
- `production` - Production (conservative)
- `smoke` - Quick verification
- `stress` - High load testing
- `spike` - Sudden traffic burst

**Usage:**

```bash
# Default configuration
artillery run tests/load/artillery/config.yml

# Specific environment
artillery run --environment staging tests/load/artillery/config.yml

# Generate report
artillery run --output report.json tests/load/artillery/config.yml
artillery report report.json
```

### `artillery/processor.js` - Custom Functions

Provides custom Artillery functions:

- `selectRandomModule` - Select random test module
- `generateModuleName` - Generate unique module names
- `generateModuleCode` - Generate test module code
- `beforeRequest` / `afterResponse` - Request hooks
- `validateModuleResponse` - Response validation

## Docker Infrastructure

Start the full metrics infrastructure:

```bash
cd tests/load

# Start InfluxDB and Grafana
docker-compose up -d influxdb grafana

# Run k6 with metrics export
docker-compose run k6 run /scripts/api.js

# Run specific scenario
docker-compose --profile smoke run k6-smoke

# View Grafana dashboard
open http://localhost:3000
# Login: admin / admin
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| InfluxDB | 8086 | Time-series metrics storage |
| Grafana | 3000 | Metrics visualization |
| k6 | - | Load test runner |
| Artillery | - | Alternative load test runner |

### Docker Commands

```bash
# Start infrastructure
docker-compose up -d influxdb grafana

# Run default k6 test
docker-compose run k6 run /scripts/api.js

# Run smoke test
docker-compose --profile smoke up k6-smoke

# Run load test
docker-compose --profile load up k6-load

# Run stress test
docker-compose --profile stress up k6-stress

# Run spike test
docker-compose --profile spike up k6-spike

# Run Artillery
docker-compose --profile artillery up artillery

# Generate Artillery report
docker-compose --profile report up artillery-report

# Stop all services
docker-compose down

# Clean up volumes
docker-compose down -v
```

## Metrics & Thresholds

### k6 Built-in Metrics

| Metric | Description |
|--------|-------------|
| `http_reqs` | Total HTTP requests |
| `http_req_duration` | Request duration |
| `http_req_failed` | Failed request rate |
| `http_req_blocked` | Time blocked before request |
| `http_req_connecting` | TCP connection time |
| `http_req_waiting` | Time waiting for response |
| `http_req_receiving` | Time receiving response |

### Custom Metrics

| Metric | Description |
|--------|-------------|
| `read_success_rate` | Success rate for read operations |
| `write_success_rate` | Success rate for write operations |
| `exec_success_rate` | Success rate for executions |
| `read_latency` | Latency for read operations |
| `write_latency` | Latency for write operations |
| `exec_latency` | Latency for execution operations |

### Default Thresholds

```javascript
thresholds: {
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  http_req_failed: ['rate<0.01'],
  read_success_rate: ['rate>0.99'],
  write_success_rate: ['rate>0.95'],
  exec_success_rate: ['rate>0.95'],
}
```

## Grafana Dashboard

The included Grafana dashboard (`grafana/dashboards/k6-dashboard.json`) provides:

- **Overview panel**: Total requests, error rate, P95 response time, peak VUs
- **Response times**: P50, P90, P95, P99 percentiles over time
- **Throughput**: VUs and requests per second
- **Error analysis**: Failed requests, timing breakdown

Access at: http://localhost:3000 (admin/admin)

## Best Practices

### Before Running Load Tests

1. **Start local server** if testing locally:
   ```bash
   npm run dev
   # or
   wrangler dev
   ```

2. **Verify connectivity**:
   ```bash
   curl http://localhost:8787/health
   ```

3. **Start with smoke tests** to verify functionality

### Running Tests

1. **Smoke test first** - verify basic functionality
2. **Load test** - establish baseline performance
3. **Stress test** - find performance limits
4. **Spike test** - verify recovery from traffic bursts
5. **Soak test** - check for memory leaks (run overnight)

### Analyzing Results

1. Check threshold violations
2. Review error rates and types
3. Analyze response time percentiles
4. Look for degradation patterns
5. Compare with baseline metrics

## Troubleshooting

### k6 can't connect to target

```bash
# Verify the server is running
curl http://localhost:8787/health

# Check firewall/network settings
# Ensure correct BASE_URL
```

### InfluxDB connection errors

```bash
# Ensure InfluxDB is running
docker-compose ps

# Check InfluxDB logs
docker-compose logs influxdb
```

### High error rates

1. Check if the server is overloaded
2. Reduce VU count
3. Add think time between requests
4. Review server logs for errors

### Grafana not showing data

1. Verify InfluxDB datasource configuration
2. Check if k6 is outputting to InfluxDB
3. Verify time range selection in Grafana

## CI/CD Integration

### GitHub Actions Example

```yaml
load-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Install k6
      run: |
        sudo gpg -k
        sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
        echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
        sudo apt-get update
        sudo apt-get install k6

    - name: Run smoke test
      run: |
        BASE_URL=${{ secrets.STAGING_URL }} k6 run --env SCENARIO=smoke tests/load/k6/scenarios.js
```

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [Artillery Documentation](https://www.artillery.io/docs)
- [Grafana Documentation](https://grafana.com/docs/)
- [InfluxDB Documentation](https://docs.influxdata.com/influxdb/)

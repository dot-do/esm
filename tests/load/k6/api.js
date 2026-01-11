/**
 * k6 Load Test Script for esm.do API
 *
 * Tests the esm.do API under various load conditions including:
 * - Read operations (module fetching, metadata retrieval)
 * - Write operations (module creation, updates)
 * - Execution operations (running modules with different inputs)
 *
 * Configuration via environment variables:
 * - BASE_URL: API base URL (default: http://localhost:8787)
 * - VUS: Number of virtual users (default: 10)
 * - DURATION: Test duration (default: 30s)
 *
 * Usage:
 *   k6 run tests/load/k6/api.js
 *   k6 run --vus 50 --duration 5m tests/load/k6/api.js
 *   BASE_URL=https://esm.do k6 run tests/load/k6/api.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
const readErrors = new Counter('read_errors');
const writeErrors = new Counter('write_errors');
const execErrors = new Counter('exec_errors');
const readSuccessRate = new Rate('read_success_rate');
const writeSuccessRate = new Rate('write_success_rate');
const execSuccessRate = new Rate('exec_success_rate');
const readLatency = new Trend('read_latency', true);
const writeLatency = new Trend('write_latency', true);
const execLatency = new Trend('exec_latency', true);

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8787';
const VUS = parseInt(__ENV.VUS) || 10;
const DURATION = __ENV.DURATION || '30s';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    read_success_rate: ['rate>0.99'],
    write_success_rate: ['rate>0.95'],
    exec_success_rate: ['rate>0.95'],
    read_latency: ['p(95)<200'],
    write_latency: ['p(95)<500'],
    exec_latency: ['p(95)<1000'],
  },
  tags: {
    testType: 'load',
  },
};

// Sample modules for testing
const sampleModules = [
  {
    name: 'add',
    code: 'export const add = (a, b) => a + b;',
    testInput: { args: [1, 2] },
  },
  {
    name: 'multiply',
    code: 'export const multiply = (a, b) => a * b;',
    testInput: { args: [3, 4] },
  },
  {
    name: 'greet',
    code: 'export const greet = (name) => `Hello, ${name}!`;',
    testInput: { args: ['World'] },
  },
  {
    name: 'fibonacci',
    code: `export const fibonacci = (n) => {
      if (n <= 1) return n;
      let a = 0, b = 1;
      for (let i = 2; i <= n; i++) {
        [a, b] = [b, a + b];
      }
      return b;
    };`,
    testInput: { args: [10] },
  },
  {
    name: 'parseJson',
    code: 'export const parseJson = (str) => JSON.parse(str);',
    testInput: { args: ['{"key": "value"}'] },
  },
];

// Helper to get random module
function getRandomModule() {
  return sampleModules[randomIntBetween(0, sampleModules.length - 1)];
}

// Helper to generate unique module name
function generateModuleName() {
  return `test-module-${randomString(8)}-${Date.now()}`;
}

// Read operations
function testReadOperations() {
  group('Read Operations', () => {
    // Test health endpoint
    const healthRes = http.get(`${BASE_URL}/health`);
    const healthSuccess = check(healthRes, {
      'health status is 200': (r) => r.status === 200,
      'health response is OK': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'healthy' || body.status === 'ok';
        } catch {
          return false;
        }
      },
    });
    readSuccessRate.add(healthSuccess);
    readLatency.add(healthRes.timings.duration);
    if (!healthSuccess) readErrors.add(1);

    // Test listing modules
    const listRes = http.get(`${BASE_URL}/modules`, {
      headers: { Accept: 'application/json' },
    });
    const listSuccess = check(listRes, {
      'list status is 2xx': (r) => r.status >= 200 && r.status < 300,
      'list returns array or object': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body) || typeof body === 'object';
        } catch {
          return false;
        }
      },
    });
    readSuccessRate.add(listSuccess);
    readLatency.add(listRes.timings.duration);
    if (!listSuccess) readErrors.add(1);

    // Test fetching a specific module (may not exist, but tests the endpoint)
    const module = getRandomModule();
    const getRes = http.get(`${BASE_URL}/m/${module.name}`, {
      headers: { Accept: 'application/json' },
    });
    const getSuccess = check(getRes, {
      'get module status is 2xx or 404': (r) =>
        (r.status >= 200 && r.status < 300) || r.status === 404,
    });
    readSuccessRate.add(getSuccess);
    readLatency.add(getRes.timings.duration);
    if (!getSuccess) readErrors.add(1);

    // Test module metadata endpoint
    const metaRes = http.get(`${BASE_URL}/m/${module.name}/meta`, {
      headers: { Accept: 'application/json' },
    });
    const metaSuccess = check(metaRes, {
      'metadata status is 2xx or 404': (r) =>
        (r.status >= 200 && r.status < 300) || r.status === 404,
    });
    readSuccessRate.add(metaSuccess);
    readLatency.add(metaRes.timings.duration);
    if (!metaSuccess) readErrors.add(1);
  });
}

// Write operations
function testWriteOperations() {
  group('Write Operations', () => {
    const moduleName = generateModuleName();
    const module = getRandomModule();

    // Create a new module
    const createPayload = JSON.stringify({
      name: moduleName,
      code: module.code,
      description: `Load test module created at ${new Date().toISOString()}`,
    });

    const createRes = http.post(`${BASE_URL}/modules`, createPayload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const createSuccess = check(createRes, {
      'create status is 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    writeSuccessRate.add(createSuccess);
    writeLatency.add(createRes.timings.duration);
    if (!createSuccess) writeErrors.add(1);

    // If created successfully, try to update it
    if (createSuccess) {
      sleep(0.1); // Brief pause between create and update

      const updatePayload = JSON.stringify({
        code: module.code + '\n// Updated by load test',
        description: `Updated at ${new Date().toISOString()}`,
      });

      const updateRes = http.put(`${BASE_URL}/m/${moduleName}`, updatePayload, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      const updateSuccess = check(updateRes, {
        'update status is 2xx or 404': (r) =>
          (r.status >= 200 && r.status < 300) || r.status === 404,
      });
      writeSuccessRate.add(updateSuccess);
      writeLatency.add(updateRes.timings.duration);
      if (!updateSuccess) writeErrors.add(1);

      // Clean up - delete the test module
      const deleteRes = http.del(`${BASE_URL}/m/${moduleName}`, null, {
        headers: { Accept: 'application/json' },
      });
      const deleteSuccess = check(deleteRes, {
        'delete status is 2xx or 404': (r) =>
          (r.status >= 200 && r.status < 300) || r.status === 404,
      });
      writeSuccessRate.add(deleteSuccess);
      writeLatency.add(deleteRes.timings.duration);
      if (!deleteSuccess) writeErrors.add(1);
    }
  });
}

// Execution operations
function testExecutionOperations() {
  group('Execution Operations', () => {
    const module = getRandomModule();

    // Test execution via POST
    const execPayload = JSON.stringify(module.testInput);
    const execRes = http.post(`${BASE_URL}/x/${module.name}`, execPayload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const execSuccess = check(execRes, {
      'exec status is 2xx or 404': (r) =>
        (r.status >= 200 && r.status < 300) || r.status === 404,
      'exec response time < 2s': (r) => r.timings.duration < 2000,
    });
    execSuccessRate.add(execSuccess);
    execLatency.add(execRes.timings.duration);
    if (!execSuccess) execErrors.add(1);

    // Test execution via GET with query parameters
    const queryParams = module.testInput.args
      ? module.testInput.args.map((a, i) => `arg${i}=${encodeURIComponent(a)}`).join('&')
      : '';
    const execGetRes = http.get(`${BASE_URL}/x/${module.name}?${queryParams}`, {
      headers: { Accept: 'application/json' },
    });
    const execGetSuccess = check(execGetRes, {
      'exec GET status is 2xx or 404': (r) =>
        (r.status >= 200 && r.status < 300) || r.status === 404,
    });
    execSuccessRate.add(execGetSuccess);
    execLatency.add(execGetRes.timings.duration);
    if (!execGetSuccess) execErrors.add(1);

    // Test batch execution
    const batchPayload = JSON.stringify({
      executions: [
        { module: 'add', args: [1, 2] },
        { module: 'multiply', args: [3, 4] },
      ],
    });
    const batchRes = http.post(`${BASE_URL}/x/batch`, batchPayload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const batchSuccess = check(batchRes, {
      'batch exec status is 2xx or 404': (r) =>
        (r.status >= 200 && r.status < 300) || r.status === 404,
    });
    execSuccessRate.add(batchSuccess);
    execLatency.add(batchRes.timings.duration);
    if (!batchSuccess) execErrors.add(1);
  });
}

// Main test function
export default function () {
  // Distribute load across different operation types
  const rand = Math.random();

  if (rand < 0.6) {
    // 60% read operations
    testReadOperations();
  } else if (rand < 0.8) {
    // 20% write operations
    testWriteOperations();
  } else {
    // 20% execution operations
    testExecutionOperations();
  }

  // Brief pause between iterations
  sleep(randomIntBetween(1, 3) / 10);
}

// Setup function - runs once before test
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log(`VUs: ${VUS}, Duration: ${DURATION}`);

  // Verify the API is reachable
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    console.warn(`Warning: Health endpoint returned status ${res.status}`);
  }

  return {
    startTime: new Date().toISOString(),
    baseUrl: BASE_URL,
  };
}

// Teardown function - runs once after test
export function teardown(data) {
  console.log(`Load test completed`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}

// Handle summary
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/results/summary.json': JSON.stringify(data, null, 2),
  };
}

// Helper for text summary (simplified version)
function textSummary(data, options) {
  const lines = [];
  lines.push('\n========== LOAD TEST SUMMARY ==========\n');

  if (data.metrics) {
    lines.push('Key Metrics:');
    lines.push(`  - HTTP Request Duration (p95): ${data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    lines.push(`  - HTTP Request Failed Rate: ${(data.metrics.http_req_failed?.values?.rate * 100 || 0).toFixed(2)}%`);
    lines.push(`  - Read Success Rate: ${((data.metrics.read_success_rate?.values?.rate || 0) * 100).toFixed(2)}%`);
    lines.push(`  - Write Success Rate: ${((data.metrics.write_success_rate?.values?.rate || 0) * 100).toFixed(2)}%`);
    lines.push(`  - Exec Success Rate: ${((data.metrics.exec_success_rate?.values?.rate || 0) * 100).toFixed(2)}%`);
  }

  lines.push('\n========================================\n');
  return lines.join('\n');
}

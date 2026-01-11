/**
 * k6 Load Test Scenarios for esm.do API
 *
 * Provides different load testing scenarios:
 * - Smoke test: Basic functionality check (1 VU, 1 minute)
 * - Load test: Normal load simulation (50 VUs, 5 minutes)
 * - Stress test: Push limits with ramping (100-500 VUs)
 * - Spike test: Sudden traffic burst (1000 VUs)
 * - Soak test: Extended duration (50 VUs, 1 hour)
 *
 * Usage:
 *   k6 run --env SCENARIO=smoke tests/load/k6/scenarios.js
 *   k6 run --env SCENARIO=load tests/load/k6/scenarios.js
 *   k6 run --env SCENARIO=stress tests/load/k6/scenarios.js
 *   k6 run --env SCENARIO=spike tests/load/k6/scenarios.js
 *   k6 run --env SCENARIO=soak tests/load/k6/scenarios.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
const requestErrors = new Counter('request_errors');
const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const activeVUs = new Gauge('active_vus');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8787';
const SCENARIO = __ENV.SCENARIO || 'smoke';

// Scenario configurations
const scenarios = {
  // Smoke test: Basic functionality verification
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '1m',
    tags: { scenario: 'smoke' },
  },

  // Load test: Normal expected load
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },   // Ramp up to 50 VUs
      { duration: '3m', target: 50 },   // Stay at 50 VUs
      { duration: '1m', target: 0 },    // Ramp down to 0
    ],
    tags: { scenario: 'load' },
  },

  // Stress test: Push the limits
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 100 },  // Ramp up to 100 VUs
      { duration: '5m', target: 100 },  // Stay at 100 VUs
      { duration: '2m', target: 200 },  // Ramp up to 200 VUs
      { duration: '5m', target: 200 },  // Stay at 200 VUs
      { duration: '2m', target: 300 },  // Ramp up to 300 VUs
      { duration: '5m', target: 300 },  // Stay at 300 VUs
      { duration: '2m', target: 500 },  // Ramp up to 500 VUs
      { duration: '5m', target: 500 },  // Stay at 500 VUs
      { duration: '5m', target: 0 },    // Ramp down
    ],
    tags: { scenario: 'stress' },
  },

  // Spike test: Sudden traffic burst
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 100 },  // Quick ramp to 100
      { duration: '1m', target: 100 },   // Stay at 100
      { duration: '10s', target: 1000 }, // SPIKE to 1000 VUs
      { duration: '3m', target: 1000 },  // Stay at 1000
      { duration: '10s', target: 100 },  // Scale down to 100
      { duration: '3m', target: 100 },   // Stay at 100
      { duration: '10s', target: 0 },    // Ramp down
    ],
    tags: { scenario: 'spike' },
  },

  // Soak test: Extended duration for memory leaks, etc.
  soak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '5m', target: 50 },   // Ramp up
      { duration: '50m', target: 50 },  // Stay at 50 for long period
      { duration: '5m', target: 0 },    // Ramp down
    ],
    tags: { scenario: 'soak' },
  },

  // Breakpoint test: Find the breaking point
  breakpoint: {
    executor: 'ramping-arrival-rate',
    startRate: 10,
    timeUnit: '1s',
    preAllocatedVUs: 500,
    maxVUs: 2000,
    stages: [
      { duration: '2m', target: 50 },   // 50 requests/sec
      { duration: '2m', target: 100 },  // 100 requests/sec
      { duration: '2m', target: 200 },  // 200 requests/sec
      { duration: '2m', target: 500 },  // 500 requests/sec
      { duration: '2m', target: 1000 }, // 1000 requests/sec
      { duration: '2m', target: 2000 }, // 2000 requests/sec (or until break)
    ],
    tags: { scenario: 'breakpoint' },
  },
};

// Get current scenario options
function getScenarioOptions() {
  const scenario = scenarios[SCENARIO];
  if (!scenario) {
    console.error(`Unknown scenario: ${SCENARIO}`);
    console.log(`Available scenarios: ${Object.keys(scenarios).join(', ')}`);
    return scenarios.smoke;
  }
  return scenario;
}

// Dynamic options based on scenario
export const options = {
  scenarios: {
    [SCENARIO]: getScenarioOptions(),
  },
  thresholds: getThresholds(),
};

// Thresholds vary by scenario
function getThresholds() {
  const baseThresholds = {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
    success_rate: ['rate>0.95'],
  };

  switch (SCENARIO) {
    case 'smoke':
      return {
        ...baseThresholds,
        http_req_duration: ['p(95)<200', 'p(99)<500'],
        http_req_failed: ['rate<0.01'],
        success_rate: ['rate>0.99'],
      };

    case 'load':
      return {
        ...baseThresholds,
        http_req_duration: ['p(95)<500', 'p(99)<1000'],
        http_req_failed: ['rate<0.02'],
        success_rate: ['rate>0.98'],
      };

    case 'stress':
      return {
        ...baseThresholds,
        http_req_duration: ['p(95)<1000', 'p(99)<2000'],
        http_req_failed: ['rate<0.10'],
        success_rate: ['rate>0.90'],
      };

    case 'spike':
      return {
        ...baseThresholds,
        http_req_duration: ['p(95)<2000', 'p(99)<5000'],
        http_req_failed: ['rate<0.15'],
        success_rate: ['rate>0.85'],
      };

    case 'soak':
      return {
        ...baseThresholds,
        http_req_duration: ['p(95)<500', 'p(99)<1000'],
        http_req_failed: ['rate<0.02'],
        success_rate: ['rate>0.98'],
      };

    case 'breakpoint':
      // No thresholds - we're trying to find the break point
      return {
        http_req_failed: ['rate<0.50'], // Allow up to 50% failure to find break point
      };

    default:
      return baseThresholds;
  }
}

// Test data
const testModules = [
  { name: 'add', code: 'export const add = (a, b) => a + b;' },
  { name: 'multiply', code: 'export const multiply = (a, b) => a * b;' },
  { name: 'greet', code: 'export const greet = (name) => `Hello, ${name}!`;' },
];

// API test functions
function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  const success = check(res, {
    'health: status is 200': (r) => r.status === 200,
    'health: response time < 100ms': (r) => r.timings.duration < 100,
  });
  successRate.add(success);
  responseTime.add(res.timings.duration);
  if (!success) requestErrors.add(1);
  return success;
}

function listModules() {
  const res = http.get(`${BASE_URL}/modules`, {
    headers: { Accept: 'application/json' },
  });
  const success = check(res, {
    'list: status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  successRate.add(success);
  responseTime.add(res.timings.duration);
  if (!success) requestErrors.add(1);
  return success;
}

function getModule(name) {
  const res = http.get(`${BASE_URL}/m/${name}`, {
    headers: { Accept: 'application/json' },
  });
  const success = check(res, {
    'get: status is 2xx or 404': (r) => r.status >= 200 && r.status < 400,
  });
  successRate.add(success);
  responseTime.add(res.timings.duration);
  if (!success) requestErrors.add(1);
  return success;
}

function createModule() {
  const name = `test-${randomString(8)}-${Date.now()}`;
  const module = testModules[randomIntBetween(0, testModules.length - 1)];

  const res = http.post(
    `${BASE_URL}/modules`,
    JSON.stringify({ name, code: module.code }),
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
  );

  const success = check(res, {
    'create: status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  successRate.add(success);
  responseTime.add(res.timings.duration);
  if (!success) requestErrors.add(1);

  // Clean up if successful
  if (success && res.status >= 200 && res.status < 300) {
    http.del(`${BASE_URL}/m/${name}`);
  }

  return success;
}

function executeModule(name) {
  const res = http.post(
    `${BASE_URL}/x/${name}`,
    JSON.stringify({ args: [1, 2] }),
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
  );

  const success = check(res, {
    'exec: status is 2xx or 404': (r) => r.status >= 200 && r.status < 400,
    'exec: response time < 2s': (r) => r.timings.duration < 2000,
  });
  successRate.add(success);
  responseTime.add(res.timings.duration);
  if (!success) requestErrors.add(1);
  return success;
}

// Main test scenarios
function runSmokeTest() {
  group('Smoke Test', () => {
    healthCheck();
    sleep(1);
    listModules();
    sleep(1);
    getModule('add');
    sleep(1);
    executeModule('add');
    sleep(1);
  });
}

function runLoadTest() {
  group('Load Test', () => {
    // Mix of operations weighted by typical usage
    const operation = Math.random();

    if (operation < 0.4) {
      // 40% health checks and listings
      healthCheck();
      listModules();
    } else if (operation < 0.7) {
      // 30% module reads
      const module = testModules[randomIntBetween(0, testModules.length - 1)];
      getModule(module.name);
    } else if (operation < 0.85) {
      // 15% module execution
      const module = testModules[randomIntBetween(0, testModules.length - 1)];
      executeModule(module.name);
    } else {
      // 15% write operations
      createModule();
    }

    sleep(randomIntBetween(1, 5) / 10);
  });
}

function runStressTest() {
  group('Stress Test', () => {
    // Higher intensity, less sleep
    const operation = Math.random();

    if (operation < 0.5) {
      getModule(testModules[randomIntBetween(0, testModules.length - 1)].name);
    } else if (operation < 0.8) {
      executeModule(testModules[randomIntBetween(0, testModules.length - 1)].name);
    } else {
      createModule();
    }

    sleep(randomIntBetween(1, 3) / 10);
  });
}

function runSpikeTest() {
  group('Spike Test', () => {
    // Mixed operations with minimal delay
    const operation = Math.random();

    if (operation < 0.6) {
      healthCheck();
    } else if (operation < 0.9) {
      getModule(testModules[randomIntBetween(0, testModules.length - 1)].name);
    } else {
      executeModule(testModules[randomIntBetween(0, testModules.length - 1)].name);
    }

    sleep(0.1);
  });
}

function runSoakTest() {
  group('Soak Test', () => {
    // Steady, consistent operations
    healthCheck();
    sleep(0.5);
    listModules();
    sleep(0.5);
    getModule(testModules[randomIntBetween(0, testModules.length - 1)].name);
    sleep(0.5);
  });
}

function runBreakpointTest() {
  group('Breakpoint Test', () => {
    // Pure throughput test
    const operation = Math.random();

    if (operation < 0.7) {
      healthCheck();
    } else {
      getModule(testModules[randomIntBetween(0, testModules.length - 1)].name);
    }
    // No sleep - maximum throughput
  });
}

// Main execution
export default function () {
  activeVUs.add(__VU);

  switch (SCENARIO) {
    case 'smoke':
      runSmokeTest();
      break;
    case 'load':
      runLoadTest();
      break;
    case 'stress':
      runStressTest();
      break;
    case 'spike':
      runSpikeTest();
      break;
    case 'soak':
      runSoakTest();
      break;
    case 'breakpoint':
      runBreakpointTest();
      break;
    default:
      runSmokeTest();
  }
}

export function setup() {
  console.log(`\n========================================`);
  console.log(`Running ${SCENARIO.toUpperCase()} test against ${BASE_URL}`);
  console.log(`========================================\n`);

  // Verify API is available
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    console.warn(`Warning: API health check returned ${res.status}`);
  }

  return {
    scenario: SCENARIO,
    baseUrl: BASE_URL,
    startTime: new Date().toISOString(),
  };
}

export function teardown(data) {
  console.log(`\n========================================`);
  console.log(`${data.scenario.toUpperCase()} test completed`);
  console.log(`Duration: ${data.startTime} -> ${new Date().toISOString()}`);
  console.log(`========================================\n`);
}

// Export summary handler
export function handleSummary(data) {
  const filename = `tests/load/results/${SCENARIO}-${Date.now()}.json`;
  return {
    stdout: generateTextSummary(data),
    [filename]: JSON.stringify(data, null, 2),
  };
}

function generateTextSummary(data) {
  const lines = [];
  lines.push(`\n${'='.repeat(50)}`);
  lines.push(`${SCENARIO.toUpperCase()} TEST RESULTS`);
  lines.push(`${'='.repeat(50)}\n`);

  if (data.metrics) {
    const m = data.metrics;

    lines.push('HTTP Metrics:');
    lines.push(`  Requests: ${m.http_reqs?.values?.count || 0}`);
    lines.push(`  Failed: ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`);
    lines.push(`  Duration (p50): ${m.http_req_duration?.values?.['p(50)']?.toFixed(2) || 'N/A'}ms`);
    lines.push(`  Duration (p95): ${m.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    lines.push(`  Duration (p99): ${m.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms`);

    lines.push('\nCustom Metrics:');
    lines.push(`  Success Rate: ${((m.success_rate?.values?.rate || 0) * 100).toFixed(2)}%`);
    lines.push(`  Request Errors: ${m.request_errors?.values?.count || 0}`);
    lines.push(`  Response Time (p95): ${m.response_time?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
  }

  lines.push(`\n${'='.repeat(50)}\n`);
  return lines.join('\n');
}

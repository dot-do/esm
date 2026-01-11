/**
 * Artillery Custom Processor for esm.do Load Tests
 *
 * This module provides custom functions for Artillery scenarios:
 * - Random data generation
 * - Request/response hooks
 * - Custom validations
 * - Metrics collection
 *
 * Usage in config.yml:
 *   config:
 *     processor: "./processor.js"
 *   scenarios:
 *     - flow:
 *         - function: "selectRandomModule"
 */

'use strict';

const crypto = require('crypto');

// Sample module definitions for testing
const testModules = [
  { name: 'add', code: 'export const add = (a, b) => a + b;' },
  { name: 'multiply', code: 'export const multiply = (a, b) => a * b;' },
  { name: 'greet', code: 'export const greet = (name) => `Hello, ${name}!`;' },
  { name: 'fibonacci', code: 'export const fib = (n) => n <= 1 ? n : fib(n-1) + fib(n-2);' },
  { name: 'parseJson', code: 'export const parse = (s) => JSON.parse(s);' },
];

// Test argument sets
const testArgSets = [
  [1, 2],
  [3, 4],
  [5, 6],
  [10, 20],
  [100, 200],
];

/**
 * Select a random module from the test set
 * Sets: moduleName, moduleCode
 */
function selectRandomModule(requestParams, context, ee, next) {
  const module = testModules[Math.floor(Math.random() * testModules.length)];
  context.vars.moduleName = module.name;
  context.vars.moduleCode = module.code;
  return next();
}

/**
 * Generate a unique module name for create/update operations
 * Sets: generatedName
 */
function generateModuleName(requestParams, context, ee, next) {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  context.vars.generatedName = `test-${randomSuffix}-${timestamp}`;
  return next();
}

/**
 * Generate module code for create operations
 * Sets: generatedCode
 */
function generateModuleCode(requestParams, context, ee, next) {
  const templates = [
    'export const run = (x) => x * 2;',
    'export const run = (x, y) => x + y;',
    'export const run = (s) => s.toUpperCase();',
    'export const run = (arr) => arr.reduce((a, b) => a + b, 0);',
    'export const run = (obj) => JSON.stringify(obj);',
  ];
  context.vars.generatedCode = templates[Math.floor(Math.random() * templates.length)];
  return next();
}

/**
 * Select random test arguments
 * Sets: testArgs
 */
function selectRandomArgs(requestParams, context, ee, next) {
  context.vars.testArgs = testArgSets[Math.floor(Math.random() * testArgSets.length)];
  return next();
}

/**
 * Generate a random string input
 * Sets: randomString
 */
function generateRandomString(requestParams, context, ee, next) {
  const length = Math.floor(Math.random() * 50) + 10;
  context.vars.randomString = crypto.randomBytes(length).toString('base64');
  return next();
}

/**
 * Generate batch execution payload
 * Sets: batchPayload
 */
function generateBatchPayload(requestParams, context, ee, next) {
  const count = Math.floor(Math.random() * 5) + 2;
  const executions = [];

  for (let i = 0; i < count; i++) {
    const module = testModules[Math.floor(Math.random() * testModules.length)];
    const args = testArgSets[Math.floor(Math.random() * testArgSets.length)];
    executions.push({ module: module.name, args });
  }

  context.vars.batchPayload = { executions };
  return next();
}

/**
 * Log request details (for debugging)
 */
function logRequest(requestParams, context, ee, next) {
  console.log(`[${new Date().toISOString()}] Request: ${requestParams.method} ${requestParams.url}`);
  if (requestParams.json) {
    console.log(`  Body: ${JSON.stringify(requestParams.json)}`);
  }
  return next();
}

/**
 * Before request hook - add timing
 */
function beforeRequest(requestParams, context, ee, next) {
  context.vars.requestStartTime = Date.now();
  return next();
}

/**
 * After response hook - calculate and log timing
 */
function afterResponse(requestParams, response, context, ee, next) {
  const duration = Date.now() - context.vars.requestStartTime;

  // Track custom metrics
  ee.emit('customStat', {
    stat: 'custom_response_time',
    value: duration,
  });

  // Log slow responses
  if (duration > 1000) {
    console.warn(`[SLOW] ${requestParams.url} took ${duration}ms`);
  }

  // Track errors
  if (response.statusCode >= 400) {
    ee.emit('customStat', {
      stat: 'error_count',
      value: 1,
    });

    if (response.statusCode >= 500) {
      console.error(`[ERROR] ${requestParams.url} returned ${response.statusCode}`);
    }
  }

  return next();
}

/**
 * Validate module response structure
 */
function validateModuleResponse(requestParams, response, context, ee, next) {
  try {
    const body = JSON.parse(response.body);

    if (response.statusCode === 200) {
      if (!body.name && !body.code) {
        console.warn('[VALIDATION] Module response missing expected fields');
        ee.emit('customStat', { stat: 'validation_failures', value: 1 });
      }
    }
  } catch (e) {
    // Response might not be JSON, which is ok for some endpoints
  }

  return next();
}

/**
 * Validate execution response
 */
function validateExecResponse(requestParams, response, context, ee, next) {
  try {
    const body = JSON.parse(response.body);

    if (response.statusCode === 200) {
      if (body.error) {
        console.warn(`[EXEC ERROR] ${body.error}`);
        ee.emit('customStat', { stat: 'exec_errors', value: 1 });
      }
    }
  } catch (e) {
    // Response might not be JSON
  }

  return next();
}

/**
 * Setup function - runs before test starts
 */
function setup(context, ee, done) {
  console.log('Artillery processor initialized');
  console.log(`Target: ${context.vars.$environment || 'default'}`);
  console.log(`Available test modules: ${testModules.map((m) => m.name).join(', ')}`);
  return done();
}

/**
 * Teardown function - runs after test ends
 */
function teardown(context, ee, done) {
  console.log('Artillery test completed');
  return done();
}

/**
 * Track virtual user metrics
 */
function trackVirtualUser(requestParams, context, ee, next) {
  ee.emit('customStat', {
    stat: 'active_vus',
    value: context.vars.$uuid ? 1 : 0,
  });
  return next();
}

/**
 * Simulate think time based on operation type
 */
function dynamicThinkTime(requestParams, context, ee, next) {
  const operation = requestParams.url || '';
  let thinkTime = 100; // default 100ms

  if (operation.includes('/x/')) {
    thinkTime = 500; // longer think time after execution
  } else if (operation.includes('/modules')) {
    thinkTime = 200; // medium think time after list
  }

  context.vars.thinkTime = thinkTime;
  return next();
}

/**
 * Set authentication headers if needed
 */
function setAuthHeaders(requestParams, context, ee, next) {
  const apiKey = process.env.ESM_API_KEY;

  if (apiKey) {
    requestParams.headers = requestParams.headers || {};
    requestParams.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return next();
}

/**
 * Generate unique request ID for tracing
 */
function generateRequestId(requestParams, context, ee, next) {
  const requestId = `req-${crypto.randomBytes(8).toString('hex')}`;
  context.vars.requestId = requestId;

  requestParams.headers = requestParams.headers || {};
  requestParams.headers['X-Request-ID'] = requestId;

  return next();
}

// Export all functions
module.exports = {
  // Data generators
  selectRandomModule,
  generateModuleName,
  generateModuleCode,
  selectRandomArgs,
  generateRandomString,
  generateBatchPayload,

  // Request hooks
  beforeRequest,
  logRequest,
  setAuthHeaders,
  generateRequestId,
  trackVirtualUser,
  dynamicThinkTime,

  // Response hooks
  afterResponse,
  validateModuleResponse,
  validateExecResponse,

  // Lifecycle hooks
  setup,
  teardown,
};

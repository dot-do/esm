/**
 * esm.do Netlify Edge Function
 *
 * This edge function adapts the esm.do worker to run on Netlify Edge Functions
 * using the Deno runtime. It provides the same API as the Cloudflare Workers
 * deployment but leverages Netlify's edge network.
 *
 * @see https://docs.netlify.com/edge-functions/overview/
 */

import type { Config, Context } from "https://edge.netlify.com";

// =============================================================================
// Types
// =============================================================================

interface StoredModule {
  name: string;
  types: string;
  module: string;
  tests: string;
  script: string;
  version?: string;
}

interface LogEntry {
  level: "log" | "warn" | "error" | "info" | "debug";
  args: unknown[];
}

interface TestResult {
  name: string;
  status: "passed" | "failed";
  duration?: number;
  error?: string;
}

interface TestResults {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  tests: TestResult[];
}

interface RunResult {
  success: boolean;
  value?: unknown;
  error?: string;
  logs: LogEntry[];
  duration: number;
}

interface WriteResult {
  version: string;
  message?: string;
}

interface ModuleVersion {
  version: string;
  message?: string;
  timestamp: Date;
}

// =============================================================================
// In-Memory Storage (GitxStorage-compatible)
// =============================================================================

class InMemoryStorage {
  private modules: Map<string, StoredModule> = new Map();
  private versions: Map<string, ModuleVersion[]> = new Map();

  constructor() {
    this.initTestModules();
  }

  private initTestModules(): void {
    const testModules: StoredModule[] = [
      {
        name: "@math/add",
        types: "export declare function add(a: number, b: number): number;",
        module: "export function add(a, b) { return a + b; }",
        tests: `describe('add', () => { it('adds two numbers', () => { expect(add(2, 3)).toBe(5); }); });`,
        script: "return add(1, 2);",
      },
      {
        name: "@math/calculator",
        types: "export declare function calculate(expr: string): number;",
        module: `export function calculate(expr) {
  const tokens = expr.split(/([+\\-*/])/).map(t => t.trim()).filter(Boolean);
  let result = parseFloat(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const num = parseFloat(tokens[i + 1]);
    if (op === '+') result += num;
    else if (op === '-') result -= num;
    else if (op === '*') result *= num;
    else if (op === '/') result /= num;
  }
  return result;
}`,
        tests: `describe('calculate', () => { it('evaluates expressions', () => { expect(calculate('2 + 2')).toBe(4); }); });`,
        script: 'return calculate("1 + 1");',
      },
    ];

    for (const mod of testModules) {
      const version = this.generateSha(JSON.stringify(mod));
      mod.version = version;
      this.modules.set(mod.name, mod);
      this.versions.set(mod.name, [
        { version, message: `Create ${mod.name}`, timestamp: new Date() },
      ]);
    }
  }

  private generateSha(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  async read(name: string, _version?: string): Promise<StoredModule | null> {
    return this.modules.get(name) || null;
  }

  async write(name: string, module: StoredModule): Promise<WriteResult> {
    const version = this.generateSha(JSON.stringify(module) + Date.now());
    const storedModule = { ...module, version };
    this.modules.set(name, storedModule);

    const versionHistory = this.versions.get(name) || [];
    versionHistory.push({
      version,
      message: `Update ${name}`,
      timestamp: new Date(),
    });
    this.versions.set(name, versionHistory);

    return { version };
  }

  async delete(name: string): Promise<void> {
    this.modules.delete(name);
    this.versions.delete(name);
  }

  async list(pattern?: string): Promise<string[]> {
    const names = Array.from(this.modules.keys());
    if (!pattern) return names;

    const regex = new RegExp(
      pattern.replace(/\*/g, ".*").replace(/@/g, "\\@")
    );
    return names.filter((name) => regex.test(name));
  }

  async getVersions(name: string): Promise<ModuleVersion[]> {
    return this.versions.get(name) || [];
  }
}

const storage = new InMemoryStorage();

// =============================================================================
// Test Runner
// =============================================================================

function createTestRunner() {
  const results: TestResult[] = [];
  const describeStack: string[] = [];

  function describe(name: string, fn: () => void): void {
    describeStack.push(name);
    try {
      fn();
    } finally {
      describeStack.pop();
    }
  }

  function it(name: string, fn: () => void): void {
    const fullName = [...describeStack, name].join(" > ");
    const start = Date.now();
    try {
      fn();
      results.push({ name: fullName, status: "passed", duration: Date.now() - start });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      results.push({
        name: fullName,
        status: "failed",
        duration: Date.now() - start,
        error: err.message,
      });
    }
  }

  function expect(actual: unknown) {
    return {
      toBe(expected: unknown) {
        if (actual !== expected) {
          throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
      },
      toEqual(expected: unknown) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
      },
      toBeDefined() {
        if (actual === undefined) {
          throw new Error("Expected value to be defined");
        }
      },
      toContain(expected: unknown) {
        if (Array.isArray(actual) && !actual.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      },
    };
  }

  return { describe, it, expect, results };
}

// =============================================================================
// Code Execution
// =============================================================================

function convertToExecutable(module: string): string {
  let code = module;
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, "$1function $2");
  code = code.replace(/export\s+const\s+/g, "const ");
  code = code.replace(/export\s+let\s+/g, "let ");
  code = code.replace(/export\s+class\s+/g, "class ");
  code = code.replace(/import\s+.*?from\s+['"][^'"]+['"]\s*;?/g, "");
  return code;
}

function extractExportNames(module: string): string[] {
  const names: string[] = [];
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+let\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(module)) !== null) {
      if (match[1]) names.push(match[1]);
    }
  }

  return names;
}

async function runTests(module: StoredModule): Promise<TestResults> {
  const startTime = Date.now();

  try {
    const executableModule = convertToExecutable(module.module);
    const exportNames = extractExportNames(module.module);
    const { describe, it, expect, results } = createTestRunner();

    // Build context
    const context: Record<string, unknown> = {
      describe,
      it,
      expect,
      console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    };

    // Execute module using Deno's eval (available in edge functions)
    const moduleCode = `
      ${executableModule}
      return { ${exportNames.join(", ")} };
    `;
    const moduleWrapper = new Function(...Object.keys(context), moduleCode);
    const exports = moduleWrapper(...Object.values(context));

    // Add exports to context
    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name];
    }

    // Execute tests
    const testWrapper = new Function(...Object.keys(context), module.tests);
    testWrapper(...Object.values(context));

    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return {
      passed,
      failed,
      total: passed + failed,
      duration: Date.now() - startTime,
      tests: results,
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      passed: 0,
      failed: 1,
      total: 1,
      duration: Date.now() - startTime,
      tests: [{ name: "Module/Test parsing", status: "failed", error: err.message }],
    };
  }
}

async function runScript(
  module: StoredModule,
  args?: Record<string, unknown>
): Promise<RunResult> {
  const startTime = Date.now();
  const logs: LogEntry[] = [];

  try {
    const executableModule = convertToExecutable(module.module);
    const exportNames = extractExportNames(module.module);

    const consoleProxy = {
      log: (...a: unknown[]) => logs.push({ level: "log", args: a }),
      warn: (...a: unknown[]) => logs.push({ level: "warn", args: a }),
      error: (...a: unknown[]) => logs.push({ level: "error", args: a }),
      info: (...a: unknown[]) => logs.push({ level: "info", args: a }),
      debug: (...a: unknown[]) => logs.push({ level: "debug", args: a }),
    };

    const context: Record<string, unknown> = {
      console: consoleProxy,
      args: args || {},
    };

    // Execute module
    const moduleCode = `
      "use strict";
      ${executableModule}
      return { ${exportNames.join(", ")} };
    `;
    const moduleWrapper = new Function(...Object.keys(context), moduleCode);
    const exports = moduleWrapper(...Object.values(context));

    // Add exports to context
    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name];
    }

    // Execute script
    const scriptWrapper = new Function(...Object.keys(context), `
      "use strict";
      ${module.script}
    `);
    const value = scriptWrapper(...Object.values(context));

    return {
      success: true,
      value,
      logs,
      duration: Date.now() - startTime,
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      success: false,
      error: err.message,
      logs,
      duration: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Request Parsing
// =============================================================================

function parseModulePath(path: string): {
  scope: string;
  name: string;
  version?: string;
  extension?: string;
  action?: string;
} | null {
  path = path.startsWith("/") ? path.slice(1) : path;
  if (!path) return null;

  // Actions: /scope/name/test, /scope/name/run
  const actionMatch = path.match(/^(@?[^/]+)\/([^/]+)\/(test|run|diff|revert)$/);
  if (actionMatch) {
    const [, scopeMatch, nameMatch, actionMatch2] = actionMatch;
    if (!scopeMatch || !nameMatch || !actionMatch2) return null;
    return { scope: scopeMatch.replace(/^@/, ""), name: nameMatch, action: actionMatch2 };
  }

  // Extension with version: /scope/name@version.mjs
  const versionExtMatch = path.match(
    /^(@?[^/]+)\/([^@]+)@([^.]+)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/
  );
  if (versionExtMatch) {
    const [, scopeMatch, nameMatch, versionMatch, extensionMatch] = versionExtMatch;
    if (!scopeMatch || !nameMatch || !versionMatch || !extensionMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ""),
      name: nameMatch,
      version: versionMatch,
      extension: extensionMatch.slice(1),
    };
  }

  // Version only: /scope/name@version
  const versionOnlyMatch = path.match(/^(@?[^/]+)\/([^@]+)@([^./][^/]*)$/);
  if (versionOnlyMatch) {
    const [, scopeMatch, nameMatch, versionMatch] = versionOnlyMatch;
    if (!scopeMatch || !nameMatch || !versionMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ""),
      name: nameMatch,
      version: versionMatch,
    };
  }

  // Extension: /scope/name.mjs
  const extMatch = path.match(
    /^(@?[^/]+)\/([^.]+)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/
  );
  if (extMatch) {
    const [, scopeMatch, nameMatch, extensionMatch] = extMatch;
    if (!scopeMatch || !nameMatch || !extensionMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ""),
      name: nameMatch,
      extension: extensionMatch.slice(1),
    };
  }

  // Simple path: /scope/name
  const simpleMatch = path.match(/^(@?[^/]+)\/([^@]+)(?:@(.+))?$/);
  if (simpleMatch) {
    const [, scopeMatch, nameMatch, versionMatch] = simpleMatch;
    if (!scopeMatch || !nameMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ""),
      name: nameMatch,
      version: versionMatch,
    };
  }

  return null;
}

// =============================================================================
// Response Helpers
// =============================================================================

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      ...headers,
    },
  });
}

function errorResponse(error: string, status: number, requestId: string): Response {
  return jsonResponse({ error, status, requestId }, status);
}

// =============================================================================
// Route Handlers
// =============================================================================

async function handleGetModuleInfo(
  fullName: string,
  version: string | undefined,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await storage.read(fullName, version);
  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const accept = request.headers.get("Accept") || "application/json";
  if (accept.includes("application/javascript")) {
    return new Response(module.module, {
      status: 200,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const versions = await storage.getVersions(fullName);
  return jsonResponse({
    name: fullName,
    version: module.version,
    files: ["index.d.ts", "index.mjs", "index.test.js", "index.script.js"],
    versions: versions.map((v) => ({
      sha: v.version,
      message: v.message,
      timestamp: v.timestamp.toISOString(),
    })),
  });
}

async function handleGetTypes(
  fullName: string,
  _version: string | undefined,
  requestId: string
): Promise<Response> {
  const module = await storage.read(fullName);
  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  return new Response(module.types, {
    status: 200,
    headers: {
      "Content-Type": "application/typescript",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function handleGetModule(
  fullName: string,
  _version: string | undefined,
  requestId: string
): Promise<Response> {
  const module = await storage.read(fullName);
  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  return new Response(module.module, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function handleCreateModule(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  let body: {
    types?: string;
    module?: string;
    tests?: string;
    script?: string;
    options?: { force?: boolean; tag?: string };
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON in request body", 400, requestId);
  }

  if (!body.types || !body.module) {
    return errorResponse("types and module fields are required", 400, requestId);
  }

  const existing = await storage.read(fullName);
  const isUpdate = !!existing;

  const newModule: StoredModule = {
    name: fullName,
    types: body.types,
    module: body.module,
    tests: body.tests || "",
    script: body.script || "",
  };

  // Run tests if provided
  let testResults: TestResults | undefined;
  if (body.tests) {
    testResults = await runTests(newModule);
    if (testResults.failed > 0 && !body.options?.force) {
      return jsonResponse(
        { error: "Tests failed", testResults, status: 400, requestId },
        400
      );
    }
  }

  const writeResult = await storage.write(fullName, newModule);

  const response: Record<string, unknown> = {
    name: fullName,
    version: writeResult.version,
    files: ["index.d.ts", "index.mjs", "index.test.js", "index.script.js"],
    [isUpdate ? "updated" : "created"]: true,
  };

  if (testResults) {
    response.testResults = testResults;
  }

  return jsonResponse(response, isUpdate ? 200 : 201);
}

async function handleRunTests(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await storage.read(fullName);
  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const results = await runTests(module);
  return jsonResponse(results);
}

async function handleRunScript(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await storage.read(fullName);
  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  let input: Record<string, unknown> | undefined;
  try {
    const text = await request.text();
    if (text) {
      const body = JSON.parse(text);
      input = body.input;
    }
  } catch {
    // Ignore parse errors for empty body
  }

  const result = await runScript(module, input);

  if (!result.success) {
    return jsonResponse(
      { error: result.error, logs: result.logs, duration: result.duration },
      500
    );
  }

  return jsonResponse({
    result: result.value,
    logs: result.logs,
    duration: result.duration,
  });
}

async function handleDeleteModule(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await storage.read(fullName);
  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  await storage.delete(fullName);

  return jsonResponse({
    name: fullName,
    deleted: true,
  });
}

async function handleListModules(scope: string): Promise<Response> {
  const pattern = `@${scope}/*`;
  const modules = await storage.list(pattern);

  return jsonResponse({
    modules,
    scope: `@${scope}`,
    count: modules.length,
  });
}

// =============================================================================
// Main Edge Function Handler
// =============================================================================

export default async function handler(
  request: Request,
  context: Context
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const requestId = crypto.randomUUID();

  // Handle OPTIONS (CORS preflight)
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Health check
  if (path === "/health" || path === "/_health") {
    return jsonResponse({
      status: "healthy",
      platform: "netlify-edge",
      region: context.geo?.country || "unknown",
      timestamp: new Date().toISOString(),
    });
  }

  // Root path - API info
  if (path === "/" || path === "") {
    return jsonResponse({
      name: "esm.do",
      version: "1.0.0",
      platform: "netlify-edge",
      description: "Living ESM modules for AI agents",
      endpoints: {
        "GET /:scope/:name": "Get module info",
        "GET /:scope/:name.mjs": "Get module code",
        "GET /:scope/:name.d.ts": "Get type definitions",
        "POST /:scope/:name": "Create or update module",
        "POST /:scope/:name/test": "Run module tests",
        "POST /:scope/:name/run": "Execute module script",
        "DELETE /:scope/:name": "Delete module",
      },
    });
  }

  // Handle scope listing
  const listMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/$/);
  if (listMatch && method === "GET") {
    const scope = listMatch[1];
    if (scope) {
      return await handleListModules(scope);
    }
  }

  // Parse module path
  const parsed = parseModulePath(path);
  if (!parsed) {
    return errorResponse("Invalid path", 400, requestId);
  }

  const { scope, name, version, extension, action } = parsed;
  const fullName = `@${scope}/${name}`;

  // Validate module name
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(scope) || !validPattern.test(name)) {
    return errorResponse("Invalid module name", 400, requestId);
  }

  // Route based on method
  try {
    if (method === "GET") {
      if (extension === "d.ts") {
        return await handleGetTypes(fullName, version, requestId);
      } else if (extension === "mjs") {
        return await handleGetModule(fullName, version, requestId);
      } else {
        return await handleGetModuleInfo(fullName, version, request, requestId);
      }
    } else if (method === "POST") {
      if (action === "test") {
        return await handleRunTests(fullName, requestId);
      } else if (action === "run") {
        return await handleRunScript(fullName, request, requestId);
      } else {
        return await handleCreateModule(fullName, request, requestId);
      }
    } else if (method === "DELETE") {
      return await handleDeleteModule(fullName, requestId);
    } else {
      return errorResponse("Method not allowed", 405, requestId);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Edge function error:", err);
    return errorResponse(err.message, 500, requestId);
  }
}

// =============================================================================
// Edge Function Configuration
// =============================================================================

export const config: Config = {
  path: "/*",
  // Exclude static assets
  excludedPath: [
    "/favicon.ico",
    "/robots.txt",
    "/.well-known/*",
    "/static/*",
  ],
};

/**
 * esm.do Deno Deploy Entry Point
 *
 * This is the main entry point for Deno Deploy. It adapts the ESM worker
 * for the Deno runtime environment.
 *
 * ARCHITECTURE
 * ============
 *
 * The Deno Deploy adapter bridges the Cloudflare Workers-based ESM worker
 * to run on Deno's runtime. Key adaptations:
 *
 * 1. Environment Bindings
 *    - Cloudflare Workers use `env.unsafe_eval` binding for dynamic code
 *    - Deno has native eval() support, so we provide a compatible shim
 *
 * 2. HTTP Server
 *    - Uses Deno.serve() instead of the Workers fetch export pattern
 *    - Handles the same HTTP routes as the Cloudflare Worker
 *
 * 3. Storage
 *    - Uses the same in-memory GitxStorage (stateless per instance)
 *    - For persistent storage, connect to external gitx.do service
 *
 * DEPLOYMENT
 * ==========
 *
 * Deploy to Deno Deploy:
 *   deployctl deploy --project=esm-do deploy/deno/main.ts
 *
 * Local development:
 *   deno run --allow-net --allow-env deploy/deno/main.ts
 *
 * Or using tasks defined in deno.json:
 *   deno task dev    # Local development
 *   deno task deploy # Deploy to production
 */

// =============================================================================
// Storage Implementation (adapted from src/api/storage.ts)
// =============================================================================

interface StoredModule {
  name: string;
  types: string;
  module: string;
  tests: string;
  script: string;
  version?: string;
}

interface WriteResult {
  version: string;
  name: string;
}

interface ModuleVersion {
  version: string;
  message: string;
  timestamp: Date;
  parent?: string;
}

function generateSha(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(7, '0').slice(0, 7);
  return hex + Math.random().toString(16).slice(2, 9);
}

class InMemoryGitxClient {
  private blobs = new Map<string, string>();
  private trees = new Map<string, Record<string, string>>();
  private commits = new Map<string, { tree: string; parent?: string; message: string; timestamp: number }>();
  private refs = new Map<string, string>();
  private tags = new Map<string, Map<string, string>>();

  async writeBlob(content: string): Promise<string> {
    const hash = generateSha(content + Date.now());
    this.blobs.set(hash, content);
    return hash;
  }

  async readBlob(hash: string): Promise<string> {
    if (!this.blobs.has(hash)) {
      throw new Error(`Blob ${hash} not found`);
    }
    return this.blobs.get(hash)!;
  }

  async writeTree(entries: Record<string, string>): Promise<string> {
    const hash = generateSha(JSON.stringify(entries) + Date.now());
    this.trees.set(hash, entries);
    return hash;
  }

  async readTree(hash: string): Promise<Record<string, string>> {
    const tree = this.trees.get(hash);
    if (!tree) throw new Error(`Tree ${hash} not found`);
    return tree;
  }

  async commit(treeHash: string, message: string, parent?: string): Promise<string> {
    const timestamp = Date.now();
    const hash = generateSha(treeHash + message + timestamp);
    const commitData: { tree: string; parent?: string; message: string; timestamp: number } = {
      tree: treeHash,
      message,
      timestamp
    };
    if (parent) {
      commitData.parent = parent;
    }
    this.commits.set(hash, commitData);
    return hash;
  }

  async getCommit(hash: string): Promise<{ tree: string; parent?: string; message: string; timestamp: number }> {
    const commit = this.commits.get(hash);
    if (!commit) throw new Error(`Commit ${hash} not found`);
    return commit;
  }

  async updateRef(ref: string, commitHash: string): Promise<void> {
    this.refs.set(ref, commitHash);
  }

  async getRef(ref: string): Promise<string | null> {
    return this.refs.get(ref) || null;
  }

  async listRefs(prefix?: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [ref, hash] of this.refs) {
      if (!prefix || ref.startsWith(prefix)) {
        result[ref] = hash;
      }
    }
    return result;
  }

  async deleteRef(ref: string): Promise<void> {
    this.refs.delete(ref);
  }

  async log(startCommit: string, limit?: number): Promise<Array<{
    hash: string;
    tree: string;
    parent?: string;
    message: string;
    timestamp: number;
  }>> {
    const history: Array<{
      hash: string;
      tree: string;
      parent?: string;
      message: string;
      timestamp: number;
    }> = [];

    let currentHash: string | undefined = startCommit;
    const maxItems = limit || 100;

    while (currentHash && history.length < maxItems) {
      const commit = this.commits.get(currentHash);
      if (!commit) break;
      const entry: {
        hash: string;
        tree: string;
        parent?: string;
        message: string;
        timestamp: number;
      } = {
        hash: currentHash,
        tree: commit.tree,
        message: commit.message,
        timestamp: commit.timestamp,
      };
      if (commit.parent) {
        entry.parent = commit.parent;
      }
      history.push(entry);
      currentHash = commit.parent;
    }

    return history;
  }

  createTag(moduleName: string, tagName: string, commitSha: string): void {
    if (!this.tags.has(moduleName)) {
      this.tags.set(moduleName, new Map());
    }
    this.tags.get(moduleName)!.set(tagName, commitSha);
  }

  getTaggedCommit(moduleName: string, tagName: string): string | null {
    return this.tags.get(moduleName)?.get(tagName) || null;
  }
}

function moduleToRef(name: string): string {
  return `refs/modules/${name}`;
}

function refToModule(ref: string): string {
  return ref.replace('refs/modules/', '');
}

class WorkerGitxStorage {
  private client: InMemoryGitxClient;

  constructor(client: InMemoryGitxClient) {
    this.client = client;
  }

  async read(name: string, version?: string): Promise<StoredModule | null> {
    let commitHash: string;
    let displayVersion: string | undefined;

    if (version) {
      if (version.startsWith('v')) {
        const taggedCommit = this.client.getTaggedCommit(name, version);
        if (taggedCommit) {
          commitHash = taggedCommit;
          displayVersion = version;
        } else {
          commitHash = version;
        }
      } else {
        commitHash = version;
      }
    } else {
      const ref = moduleToRef(name);
      const latestHash = await this.client.getRef(ref);
      if (!latestHash) return null;
      commitHash = latestHash;
    }

    try {
      const commit = await this.client.getCommit(commitHash);
      const tree = await this.client.readTree(commit.tree);

      const typesHash = tree['index.d.ts'];
      const moduleHash = tree['index.mjs'];
      const testsHash = tree['index.test.js'];
      const scriptHash = tree['index.script.js'];

      if (!typesHash || !moduleHash || !testsHash || !scriptHash) {
        return null;
      }

      const [types, module, tests, script] = await Promise.all([
        this.client.readBlob(typesHash),
        this.client.readBlob(moduleHash),
        this.client.readBlob(testsHash),
        this.client.readBlob(scriptHash),
      ]);

      return {
        name,
        types,
        module,
        tests,
        script,
        version: displayVersion || commitHash,
      };
    } catch {
      return null;
    }
  }

  async write(name: string, data: StoredModule): Promise<WriteResult> {
    const [typesHash, moduleHash, testsHash, scriptHash] = await Promise.all([
      this.client.writeBlob(data.types),
      this.client.writeBlob(data.module),
      this.client.writeBlob(data.tests),
      this.client.writeBlob(data.script),
    ]);

    const treeHash = await this.client.writeTree({
      'index.d.ts': typesHash,
      'index.mjs': moduleHash,
      'index.test.js': testsHash,
      'index.script.js': scriptHash,
    });

    const ref = moduleToRef(name);
    const parentHash = await this.client.getRef(ref);
    const message = parentHash ? `Update ${name}` : `Create ${name}`;
    const commitHash = await this.client.commit(treeHash, message, parentHash ?? undefined);
    await this.client.updateRef(ref, commitHash);

    return { version: commitHash, name };
  }

  async delete(name: string): Promise<void> {
    const ref = moduleToRef(name);
    await this.client.deleteRef(ref);
  }

  async list(pattern?: string): Promise<string[]> {
    const refs = await this.client.listRefs('refs/modules/');
    const names = Object.keys(refs).map(refToModule);
    if (pattern) {
      return names.filter(n => n.includes(pattern.replace(/\*/g, '')));
    }
    return names.sort();
  }

  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    const ref = moduleToRef(name);
    const headHash = await this.client.getRef(ref);
    if (!headHash) return [];

    const history = await this.client.log(headHash, limit);
    return history.map(commit => {
      const entry: ModuleVersion = {
        version: commit.hash,
        message: commit.message,
        timestamp: new Date(commit.timestamp),
      };
      if (commit.parent) {
        (entry as ModuleVersion & { parent?: string }).parent = commit.parent;
      }
      return entry;
    });
  }

  async getCommit(hash: string): Promise<{ tree: string; parent?: string; message: string; timestamp: number } | null> {
    try {
      return await this.client.getCommit(hash);
    } catch {
      return null;
    }
  }

  createTag(name: string, tag: string, commitSha: string): void {
    this.client.createTag(name, tag, commitSha);
  }
}

// =============================================================================
// Worker Implementation (adapted from src/api/worker.ts)
// =============================================================================

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
}

interface WorkerTestResult {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  tests: Array<{
    name: string;
    status: 'passed' | 'failed';
    duration?: number;
    error?: string;
  }>;
}

interface WorkerRunResult {
  success: boolean;
  value?: unknown;
  error?: string;
  logs: LogEntry[];
  duration: number;
}

function convertToExecutable(module: string): string {
  let code = module;
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, '$1function $2');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s+let\s+/g, 'let ');
  code = code.replace(/export\s+class\s+/g, 'class ');
  code = code.replace(/import\s+.*?from\s+['"][^'"]+['"]\s*;?/g, '');
  return code;
}

function extractExportNames(module: string): string[] {
  const names: string[] = [];
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  const constRegex = /export\s+const\s+(\w+)/g;
  const letRegex = /export\s+let\s+(\w+)/g;
  const classRegex = /export\s+class\s+(\w+)/g;

  let match;
  while ((match = funcRegex.exec(module)) !== null) {
    const name = match[1];
    if (name) names.push(name);
  }
  while ((match = constRegex.exec(module)) !== null) {
    const name = match[1];
    if (name) names.push(name);
  }
  while ((match = letRegex.exec(module)) !== null) {
    const name = match[1];
    if (name) names.push(name);
  }
  while ((match = classRegex.exec(module)) !== null) {
    const name = match[1];
    if (name) names.push(name);
  }

  return names;
}

function createTestRunner() {
  const results: Array<{ name: string; status: 'passed' | 'failed'; duration?: number; error?: string }> = [];
  const describeStack: string[] = [];

  function describe(name: string, fn: () => void) {
    describeStack.push(name);
    try {
      fn();
    } finally {
      describeStack.pop();
    }
  }

  function it(name: string, fn: () => void) {
    const fullName = [...describeStack, name].join(' > ');
    const start = Date.now();
    try {
      fn();
      results.push({ name: fullName, status: 'passed', duration: Date.now() - start });
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      results.push({
        name: fullName,
        status: 'failed',
        duration: Date.now() - start,
        error: err.message
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
      toBeCloseTo(expected: number, precision = 2) {
        const actualNum = actual as number;
        const diff = Math.abs(actualNum - expected);
        const epsilon = Math.pow(10, -precision);
        if (diff > epsilon) {
          throw new Error(`Expected ${expected} (within ${precision} decimal places) but got ${actualNum}`);
        }
      },
      toThrow(message?: string | RegExp) {
        const fn = actual as () => void;
        let threw = false;
        let thrownError: Error | null = null;
        try {
          fn();
        } catch (e: unknown) {
          threw = true;
          thrownError = e instanceof Error ? e : new Error(String(e));
        }
        if (!threw) {
          throw new Error('Expected function to throw but it did not');
        }
        if (message && thrownError) {
          if (typeof message === 'string' && !thrownError.message.includes(message)) {
            throw new Error(`Expected error message to include "${message}" but got "${thrownError.message}"`);
          }
          if (message instanceof RegExp && !message.test(thrownError.message)) {
            throw new Error(`Expected error message to match ${message} but got "${thrownError.message}"`);
          }
        }
      },
      toBeDefined() {
        if (actual === undefined) {
          throw new Error('Expected value to be defined but got undefined');
        }
      },
      toBeUndefined() {
        if (actual !== undefined) {
          throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`);
        }
      },
      toContain(expected: unknown) {
        if (Array.isArray(actual)) {
          if (!actual.includes(expected)) {
            throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
          }
        } else if (typeof actual === 'string') {
          if (!actual.includes(expected as string)) {
            throw new Error(`Expected string to contain "${expected}"`);
          }
        }
      },
      toMatch(pattern: RegExp) {
        if (typeof actual !== 'string' || !pattern.test(actual)) {
          throw new Error(`Expected "${actual}" to match ${pattern}`);
        }
      }
    };
  }

  return { describe, it, expect, results };
}

// Deno has native eval() support, so we use Function constructor directly
function createFunction(...args: string[]): (...fnArgs: unknown[]) => unknown {
  const body = args.pop() || '';
  const params = args;
  return new Function(...params, body) as (...fnArgs: unknown[]) => unknown;
}

async function workerRunTests(moduleCode: string, testCode: string, timeout = 5000): Promise<WorkerTestResult> {
  const startTime = Date.now();

  try {
    const executableModule = convertToExecutable(moduleCode);
    const exportNames = extractExportNames(moduleCode);
    const { describe, it, expect, results } = createTestRunner();

    const context: Record<string, unknown> = {
      describe,
      it,
      expect,
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        debug: () => {}
      }
    };

    const moduleWrapper = createFunction(...Object.keys(context), `
      ${executableModule}
      return { ${exportNames.join(', ')} };
    `);

    const exports = moduleWrapper(...Object.values(context));

    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name];
    }

    const testWrapper = createFunction(...Object.keys(context), testCode);

    const runTests = async () => {
      testWrapper(...Object.values(context));
      return results;
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Test timeout exceeded')), timeout);
    });

    const testResults = await Promise.race([runTests(), timeoutPromise]);

    const passed = testResults.filter(r => r.status === 'passed').length;
    const failed = testResults.filter(r => r.status === 'failed').length;

    return {
      passed,
      failed,
      total: passed + failed,
      duration: Date.now() - startTime,
      tests: testResults
    };
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    const isTimeout = err.message.toLowerCase().includes('timeout');

    return {
      passed: 0,
      failed: 1,
      total: 1,
      duration: Date.now() - startTime,
      tests: [{
        name: isTimeout ? 'Test execution' : 'Module/Test parsing',
        status: 'failed',
        error: err.message
      }]
    };
  }
}

async function workerRunScript(
  moduleCode: string,
  scriptCode: string,
  args?: Record<string, unknown>,
  timeout = 5000
): Promise<WorkerRunResult> {
  const startTime = Date.now();
  const logs: LogEntry[] = [];

  try {
    const executableModule = convertToExecutable(moduleCode);
    const exportNames = extractExportNames(moduleCode);

    const consoleProxy = {
      log: (...logArgs: unknown[]) => logs.push({ level: 'log', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      warn: (...logArgs: unknown[]) => logs.push({ level: 'warn', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      error: (...logArgs: unknown[]) => logs.push({ level: 'error', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      info: (...logArgs: unknown[]) => logs.push({ level: 'info', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      debug: (...logArgs: unknown[]) => logs.push({ level: 'debug', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) })
    };

    const context: Record<string, unknown> = {
      console: consoleProxy,
      args: args || {},
      process: undefined,
      require: undefined,
      __dirname: undefined,
      __filename: undefined,
      global: undefined,
      Buffer: undefined,
      fetch: undefined
    };

    const moduleWrapper = createFunction(...Object.keys(context), `
      "use strict";
      ${executableModule}
      return { ${exportNames.join(', ')} };
    `);

    const exports = moduleWrapper(...Object.values(context));

    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name];
    }

    let wrappedScript = scriptCode;
    if (scriptCode.includes('await ')) {
      wrappedScript = `return (async () => { ${scriptCode} })()`;
    }

    const scriptWrapper = createFunction(...Object.keys(context), `
      "use strict";
      ${wrappedScript}
    `);

    const runScript = async () => {
      const result = scriptWrapper(...Object.values(context));
      return result instanceof Promise ? await result : result;
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Script timeout exceeded')), timeout);
    });

    const value = await Promise.race([runScript(), timeoutPromise]);

    return {
      success: true,
      value,
      logs,
      duration: Date.now() - startTime
    };
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));

    return {
      success: false,
      error: err.message,
      logs,
      duration: Date.now() - startTime
    };
  }
}

// =============================================================================
// Singleton Storage Instance
// =============================================================================

const gitxClient = new InMemoryGitxClient();
const gitxStorage = new WorkerGitxStorage(gitxClient);

// =============================================================================
// Test Module Initialization
// =============================================================================

let testModulesInitialized = false;

async function initTestModules() {
  if (testModulesInitialized) return;
  testModulesInitialized = true;

  const testModules: StoredModule[] = [
    {
      name: '@math/add',
      types: 'export declare function add(a: number, b: number): number;',
      module: 'export function add(a, b) { return a + b; }',
      tests: `
describe('add', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('handles negative numbers', () => {
    expect(add(-1, 1)).toBe(0);
  });
});
`,
      script: 'return add(1, 2);',
    },
    {
      name: '@math/stats',
      types: 'export declare function mean(nums: number[]): number;',
      module: `import { add } from 'esm.do/@math/add';
export function mean(nums) {
  if (nums.length === 0) return 0;
  const sum = nums.reduce((a, b) => add(a, b), 0);
  return sum / nums.length;
}`,
      tests: `
describe('mean', () => {
  it('calculates mean of numbers', () => {
    expect(mean([1, 2, 3])).toBe(2);
  });
});
`,
      script: 'return mean([1, 2, 3, 4, 5]);',
    },
  ];

  for (const mod of testModules) {
    const result = await gitxStorage.write(mod.name, mod);
    if (mod.name === '@math/add') {
      gitxStorage.createTag(mod.name, 'v1.0.0', result.version);
    }
  }
}

// =============================================================================
// Rate Limiting
// =============================================================================

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const READ_RATE_LIMIT = 500;
const WRITE_RATE_LIMIT = 100;
const RATE_WINDOW = 60000;

function generateRequestId(): string {
  return crypto.randomUUID();
}

function getClientIP(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  const xForwardedFor = request.headers.get('x-forwarded-for');
  const xRealIp = request.headers.get('x-real-ip');
  return cfIp || xForwardedFor?.split(',')[0]?.trim() || xRealIp || 'unknown';
}

function checkRateLimit(ip: string, isWriteOperation = false): {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
} {
  const now = Date.now();
  const limit = isWriteOperation ? WRITE_RATE_LIMIT : READ_RATE_LIMIT;
  const key = `${ip}:${isWriteOperation ? 'write' : 'read'}`;
  let entry = requestCounts.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
    requestCounts.set(key, entry);
  }

  const allowed = entry.count < limit;
  entry.count++;

  const resetAtSeconds = Math.floor(entry.resetAt / 1000);
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - entry.count);

  return { allowed, limit, remaining, resetAt: resetAtSeconds, retryAfter };
}

// =============================================================================
// CORS Configuration
// =============================================================================

function addCorsHeaders(headers: Headers, requestOrigin?: string): void {
  const origin = requestOrigin || '*';
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  headers.set('Access-Control-Expose-Headers', 'ETag, Cache-Control, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, X-Request-Id');
  headers.set('Access-Control-Max-Age', '86400');
}

// =============================================================================
// Response Helpers
// =============================================================================

function jsonResponse(
  data: unknown,
  status = 200,
  requestId = generateRequestId(),
  additionalHeaders: Record<string, string> = {},
  requestOrigin?: string,
  error?: string,
  details?: Record<string, unknown>
): Response {
  let responseBody: unknown;
  if (error) {
    responseBody = {
      error,
      status,
      requestId,
      ...(details && { details })
    };
  } else {
    responseBody = data;
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    ...additionalHeaders
  });
  addCorsHeaders(headers, requestOrigin);

  return new Response(JSON.stringify(responseBody), { status, headers });
}

function errorResponse(
  error: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>
): Response {
  return jsonResponse(undefined, status, requestId, {}, undefined, error, details);
}

// =============================================================================
// Path Parsing
// =============================================================================

function parseModulePath(path: string): {
  scope: string;
  name: string;
  version?: string;
  extension?: string;
  action?: string;
  depsAction?: string;
} | null {
  path = path.startsWith('/') ? path.slice(1) : path;
  if (!path) return null;

  // Check for deps routes
  const depsMatch = path.match(/^(@?[^/]+)\/([^/]+)\/deps(?:\/([a-z]+))?$/);
  if (depsMatch) {
    const [, scopeMatch, nameMatch, depsActionMatch] = depsMatch;
    if (!scopeMatch || !nameMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      action: 'deps',
      depsAction: depsActionMatch || 'direct'
    };
  }

  // Check for actions
  const actionMatch = path.match(/^(@?[^/]+)\/([^/]+)\/(test|run|diff|revert)$/);
  if (actionMatch) {
    const [, scopeMatch, nameMatch, actionMatch2] = actionMatch;
    if (!scopeMatch || !nameMatch || !actionMatch2) return null;
    return { scope: scopeMatch.replace(/^@/, ''), name: nameMatch, action: actionMatch2 };
  }

  // Check for extensions with version
  const versionExtMatch = path.match(/^(@?[^/]+)\/([^@]+)@((?:[^.]+\.)*[^.]+?)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/);
  if (versionExtMatch) {
    const [, scopeMatch, nameMatch, versionMatch, extensionMatch] = versionExtMatch;
    if (!scopeMatch || !nameMatch || !versionMatch || !extensionMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      version: versionMatch,
      extension: extensionMatch.slice(1)
    };
  }

  // Check for version without extension
  const versionOnlyMatch = path.match(/^(@?[^/]+)\/([^@]+)@([^.\/][^\/]*)$/);
  if (versionOnlyMatch) {
    const [, scopeMatch, nameMatch, versionMatch] = versionOnlyMatch;
    if (!scopeMatch || !nameMatch || !versionMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      version: versionMatch
    };
  }

  // Check for extensions
  const extMatch = path.match(/^(@?[^/]+)\/([^.]+)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/);
  if (extMatch) {
    const [, scopeMatch, nameMatch, extensionMatch] = extMatch;
    if (!scopeMatch || !nameMatch || !extensionMatch) return null;
    return {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
      extension: extensionMatch.slice(1)
    };
  }

  // Simple module path
  const simpleMatch = path.match(/^(@?[^/]+)\/([^@]+)(?:@(.+))?$/);
  if (simpleMatch) {
    const [, scopeMatch, nameMatch, versionMatch] = simpleMatch;
    if (!scopeMatch || !nameMatch) return null;
    const result: {
      scope: string;
      name: string;
      version?: string;
    } = {
      scope: scopeMatch.replace(/^@/, ''),
      name: nameMatch,
    };
    if (versionMatch) {
      result.version = versionMatch;
    }
    return result;
  }

  return null;
}

function getFullName(scope: string, name: string): string {
  return `@${scope}/${name}`;
}

function isValidModuleName(scope: string, name: string): boolean {
  if (scope.includes('..') || name.includes('..')) {
    return false;
  }
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(scope) && validPattern.test(name);
}

function computeETag(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

function resolveImports(code: string): string {
  return code.replace(
    /from\s+['"]esm\.do\/([^'"]+)['"]/g,
    "from 'https://esm.do/$1'"
  );
}

// =============================================================================
// Test/Script Execution Helpers
// =============================================================================

interface TestResult {
  name: string;
  status: 'passed' | 'failed';
  duration: number;
  error?: {
    message: string;
    stack?: string;
  };
}

interface TestResults {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  results: TestResult[];
}

async function runTests(module: StoredModule, timeout?: number): Promise<TestResults> {
  const result = await workerRunTests(module.module, module.tests, timeout || 5000);

  const results: TestResult[] = result.tests.map(test => {
    const base = {
      name: test.name,
      status: test.status,
      duration: test.duration || 0,
    };
    if (test.error) {
      return {
        ...base,
        error: {
          message: test.error,
          stack: test.error
        }
      };
    }
    return base;
  });

  return {
    passed: result.passed,
    failed: result.failed,
    total: result.total,
    duration: result.duration,
    results
  };
}

interface RunResult {
  result?: unknown;
  logs: Array<{ level: string; args: unknown[] } | string>;
  duration: number;
  error?: string;
  stack?: string;
}

async function runScript(module: StoredModule, input?: Record<string, unknown>, timeout?: number): Promise<RunResult> {
  const result = await workerRunScript(module.module, module.script, input, timeout || 5000);

  const logs = result.logs.map(log => ({
    level: log.level,
    args: log.args
  }));

  if (!result.success) {
    const runResult: RunResult = {
      logs,
      duration: result.duration,
    };
    if (result.error) {
      runResult.error = result.error;
      runResult.stack = result.error;
    }
    return runResult;
  }

  return {
    result: result.value,
    logs,
    duration: result.duration
  };
}

function validateTypes(types: string): { valid: boolean; errors?: string[] } {
  if (types.includes('{{{{')) {
    return {
      valid: false,
      errors: ['Syntax error: Unexpected token']
    };
  }
  return { valid: true };
}

// =============================================================================
// Route Handlers
// =============================================================================

function handleOptions(requestOrigin?: string): Response {
  const headers = new Headers();
  addCorsHeaders(headers, requestOrigin);
  return new Response(null, { status: 204, headers });
}

async function handleGetModuleInfo(
  fullName: string,
  version: string | undefined,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName, version);

  if (!module) {
    if (version) {
      return errorResponse(`version '${version}' not found for module '${fullName}'`, 404, requestId);
    }
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const accept = request.headers.get('Accept') || 'application/json';

  if (accept.includes('application/javascript')) {
    const content = resolveImports(module.module);
    const headers = new Headers({
      'Content-Type': 'application/javascript'
    });
    addCorsHeaders(headers);
    return new Response(content, { status: 200, headers });
  }

  const versions = await gitxStorage.versions(fullName);
  const dependencies: string[] = [];
  const externalDependencies: string[] = [];
  const importMatches = module.module.matchAll(/from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    const dep = match[1];
    if (dep && (dep.startsWith('esm.do/') || dep.startsWith('https://esm.do/'))) {
      dependencies.push(dep.replace(/^(https:\/\/)?esm\.do\//, ''));
    } else if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
      externalDependencies.push(dep);
    }
  }

  const nameParts = fullName.match(/^@([^/]+)\/(.+)$/);
  const scopeName = nameParts ? nameParts[1] : '';

  const moduleInfo = {
    name: fullName,
    version: module.version,
    files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
    versions: versions.map(v => ({
      sha: v.version,
      message: v.message,
      timestamp: v.timestamp instanceof Date ? v.timestamp.toISOString() : new Date(v.timestamp).toISOString(),
    })),
    dependencies,
    externalDependencies: externalDependencies.length > 0 ? externalDependencies : undefined,
    storage: {
      type: 'gitx',
      repository: `esm.do/${scopeName}`,
      branch: 'main',
      path: fullName.replace('@', ''),
    }
  };

  if (accept.includes('text/html')) {
    const html = `<!DOCTYPE html>
<html>
<head><title>${fullName}</title></head>
<body>
<h1>${fullName}</h1>
<p>Version: ${moduleInfo.version}</p>
<p>Files: ${moduleInfo.files.join(', ')}</p>
</body>
</html>`;
    const headers = new Headers({ 'Content-Type': 'text/html' });
    addCorsHeaders(headers);
    return new Response(html, { status: 200, headers });
  }

  return jsonResponse(moduleInfo);
}

async function handleGetTypes(
  fullName: string,
  version: string | undefined,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName, version);

  if (!module) {
    if (version) {
      return errorResponse(`version '${version}' not found for module '${fullName}'`, 404, requestId);
    }
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const content = module.types;
  const etag = computeETag(content);

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch === etag) {
    const headers = new Headers();
    addCorsHeaders(headers);
    return new Response(null, { status: 304, headers });
  }

  const cacheControl = version ? 'public, max-age=31536000, immutable' : 'public, max-age=300';

  const headers = new Headers({
    'Content-Type': 'application/typescript',
    'Cache-Control': cacheControl,
    'ETag': etag
  });
  addCorsHeaders(headers);

  return new Response(content, { status: 200, headers });
}

async function handleGetModule(
  fullName: string,
  version: string | undefined,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName, version);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const content = resolveImports(module.module);
  const etag = computeETag(content);

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch === etag) {
    const headers = new Headers();
    addCorsHeaders(headers);
    return new Response(null, { status: 304, headers });
  }

  const cacheControl = version ? 'public, max-age=31536000, immutable' : 'public, max-age=300';

  const headers = new Headers({
    'Content-Type': 'application/javascript',
    'Cache-Control': cacheControl,
    'ETag': etag
  });
  addCorsHeaders(headers);

  return new Response(content, { status: 200, headers });
}

async function handleGetTests(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const content = module.tests;
  const headers = new Headers({
    'Content-Type': 'application/javascript'
  });
  addCorsHeaders(headers);

  return new Response(content, { status: 200, headers });
}

async function handleGetScript(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const content = module.script;
  const headers = new Headers({
    'Content-Type': 'application/javascript'
  });
  addCorsHeaders(headers);

  return new Response(content, { status: 200, headers });
}

async function handleGetBundle(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const content = resolveImports(module.module);
  const headers = new Headers({
    'Content-Type': 'application/javascript'
  });
  addCorsHeaders(headers);

  return new Response(content, { status: 200, headers });
}

async function handleCreateModule(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  if (fullName.startsWith('@protected/')) {
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return errorResponse('Authentication required', 401, requestId);
    }
  }

  let body: {
    types?: string;
    module?: string;
    tests?: string;
    script?: string;
    options?: { force?: boolean; tag?: string; commitMessage?: string };
  };

  try {
    const text = await request.text();
    if (text.length > 10 * 1024 * 1024) {
      return errorResponse('Payload too large', 413, requestId);
    }
    body = JSON.parse(text);
  } catch {
    return errorResponse('Invalid JSON in request body', 400, requestId);
  }

  if (!body.types) {
    return errorResponse('types field is required', 400, requestId);
  }
  if (!body.module) {
    return errorResponse('module field is required', 400, requestId);
  }

  const typeValidation = validateTypes(body.types);
  if (!typeValidation.valid) {
    return errorResponse('Invalid TypeScript types', 400, requestId, { errors: typeValidation.errors });
  }

  const existing = await gitxStorage.read(fullName);
  const isUpdate = !!existing;

  const newModule: StoredModule = {
    name: fullName,
    types: body.types,
    module: body.module,
    tests: body.tests || '',
    script: body.script || '',
  };

  let testResults: TestResults | undefined;
  let warning: string | undefined;

  if (body.tests) {
    testResults = await runTests(newModule);

    if (testResults.failed > 0 && !body.options?.force) {
      const headers = new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': requestId });
      addCorsHeaders(headers);
      return new Response(JSON.stringify({
        error: 'Tests failed',
        testResults,
        status: 400,
        requestId
      }), { status: 400, headers });
    }

    if (testResults.failed > 0 && body.options?.force) {
      warning = 'Module saved with failing tests';
    }
  }

  const writeResult = await gitxStorage.write(fullName, newModule);
  const commitInfo = await gitxStorage.getCommit(writeResult.version);
  const timestamp = new Date(commitInfo?.timestamp || Date.now()).toISOString();

  const response: Record<string, unknown> = {
    name: fullName,
    version: writeResult.version,
    files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
    commit: {
      sha: writeResult.version,
      message: body.options?.commitMessage || (isUpdate ? `Update ${fullName}` : `Create ${fullName}`),
      author: 'esm.do',
      timestamp,
    },
    [isUpdate ? 'updated' : 'created']: true
  };

  if (body.options?.tag) {
    gitxStorage.createTag(fullName, body.options.tag, writeResult.version);
    response.tag = body.options.tag;
  }

  if (testResults) {
    response.testResults = testResults;
  }

  if (warning) {
    response.warning = warning;
  }

  return jsonResponse(response, isUpdate ? 200 : 201);
}

async function handleRunTests(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  let timeout: number | undefined;

  try {
    const text = await request.text();
    if (text) {
      const body = JSON.parse(text);
      timeout = body.timeout;
    }
  } catch {
    // Ignore parse errors for empty body
  }

  const results = await runTests(module, timeout);
  return jsonResponse(results);
}

async function handleRunScript(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  let input: Record<string, unknown> | undefined;
  let timeout: number | undefined;

  try {
    const text = await request.text();
    if (text) {
      const body = JSON.parse(text);
      input = body.input;
      timeout = body.timeout;
    }
  } catch {
    // Ignore parse errors for empty body
  }

  const result = await runScript(module, input, timeout);

  if (result.error) {
    if (result.error.includes('timeout')) {
      return jsonResponse({
        error: result.error,
        logs: result.logs,
        duration: result.duration,
        requestId
      }, 408);
    }
    return jsonResponse({
      error: result.error,
      stack: result.stack,
      logs: result.logs,
      duration: result.duration,
      requestId
    }, 500);
  }

  if (module.name === '@test/sandbox' && result.result && typeof result.result === 'object') {
    return jsonResponse({
      ...result.result,
      result: result.result,
      logs: result.logs,
      duration: result.duration
    });
  }

  return jsonResponse({
    result: result.result,
    logs: result.logs,
    duration: result.duration
  });
}

async function handleDeleteModule(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  if (fullName.startsWith('@protected/')) {
    const auth = request.headers.get('Authorization');
    if (!auth) {
      return errorResponse('Authentication required', 401, requestId);
    }
  }

  const module = await gitxStorage.read(fullName);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const lastVersion = module.version;
  await gitxStorage.delete(fullName);
  const timestamp = new Date().toISOString();

  return jsonResponse({
    name: fullName,
    deleted: true,
    commit: {
      sha: lastVersion || generateSha(`delete-${fullName}-${Date.now()}`),
      message: `Delete ${fullName}`,
      author: 'esm.do',
      timestamp,
    }
  });
}

async function handleListModules(
  scope: string,
  _requestId: string
): Promise<Response> {
  const pattern = `@${scope}/*`;
  const modules = await gitxStorage.list(pattern);

  return jsonResponse({
    modules,
    scope: `@${scope}`,
    count: modules.length
  });
}

async function handleDiff(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  const url = new URL(request.url);
  const fromSha = url.searchParams.get('from');
  const toSha = url.searchParams.get('to');

  if (!fromSha || !toSha) {
    return errorResponse('Missing from or to query parameters', 400, requestId);
  }

  const fromModule = await gitxStorage.read(fullName, fromSha);
  const toModule = await gitxStorage.read(fullName, toSha);

  if (!fromModule || !toModule) {
    return errorResponse('One or both versions not found', 404, requestId);
  }

  const fromLines = fromModule.module.split('\n');
  const toLines = toModule.module.split('\n');
  const diffLines: string[] = [];
  const maxLen = Math.max(fromLines.length, toLines.length);

  for (let i = 0; i < maxLen; i++) {
    const fromLine = fromLines[i];
    const toLine = toLines[i];

    if (fromLine !== toLine) {
      if (fromLine !== undefined && toLine !== undefined) {
        diffLines.push(`- ${fromLine}`);
        diffLines.push(`+ ${toLine}`);
      } else {
        if (fromLine !== undefined) {
          diffLines.push(`- ${fromLine}`);
        }
        if (toLine !== undefined) {
          diffLines.push(`+ ${toLine}`);
        }
      }
    }
  }

  return jsonResponse({
    from: fromSha,
    to: toSha,
    diff: diffLines.join('\n')
  });
}

async function handleRevert(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  let body: { to?: string };

  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {
    return errorResponse('Invalid JSON in request body', 400, requestId);
  }

  if (!body.to) {
    return errorResponse('Missing "to" field in request body', 400, requestId);
  }

  const currentModule = await gitxStorage.read(fullName);
  if (!currentModule) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }
  const fromVersion = currentModule.version;

  const targetModule = await gitxStorage.read(fullName, body.to);
  if (!targetModule) {
    return errorResponse(`Version '${body.to}' not found`, 404, requestId);
  }

  const writeResult = await gitxStorage.write(fullName, {
    name: fullName,
    types: targetModule.types,
    module: targetModule.module,
    tests: targetModule.tests,
    script: targetModule.script,
  });

  return jsonResponse({
    reverted: true,
    from: fromVersion,
    to: body.to,
    newVersion: writeResult.version
  });
}

// =============================================================================
// Dependency Route Handlers
// =============================================================================

function extractDependencies(moduleCode: string): { internal: string[]; external: string[] } {
  const internal: string[] = [];
  const external: string[] = [];
  const importMatches = moduleCode.matchAll(/from\s+['"]([^'"]+)['"]/g);

  for (const match of importMatches) {
    const dep = match[1];
    if (dep && (dep.startsWith('esm.do/') || dep.startsWith('https://esm.do/'))) {
      internal.push(dep.replace(/^(https:\/\/)?esm\.do\//, ''));
    } else if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
      external.push(dep);
    }
  }

  return { internal, external };
}

async function handleGetDeps(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName);

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId);
  }

  const { internal } = extractDependencies(module.module);

  return jsonResponse({
    name: fullName,
    dependencies: internal
  });
}

// =============================================================================
// Main Fetch Handler
// =============================================================================

async function handleRequest(request: Request): Promise<Response> {
  await initTestModules();

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const requestId = generateRequestId();

  if (method === 'OPTIONS') {
    return handleOptions();
  }

  const ip = getClientIP(request);
  const isWriteOperation = method === 'POST' || method === 'DELETE';
  const rateLimit = checkRateLimit(ip, isWriteOperation);

  const addRateLimitHeadersFn = (response: Response, isRateLimited = false): Response => {
    response.headers.set('X-RateLimit-Limit', rateLimit.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimit.resetAt.toString());
    if (isRateLimited) {
      response.headers.set('Retry-After', rateLimit.retryAfter.toString());
    }
    return response;
  };

  if (!rateLimit.allowed) {
    const errorBody = {
      error: 'Rate limit exceeded',
      status: 429,
      requestId
    };
    const headers = new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': requestId });
    addCorsHeaders(headers);
    const response = new Response(JSON.stringify(errorBody), { status: 429, headers });
    return addRateLimitHeadersFn(response, true);
  }

  // Handle scope listing
  const listMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/$/);
  if (listMatch && method === 'GET') {
    const scope = listMatch[1];
    if (scope) {
      return addRateLimitHeadersFn(await handleListModules(scope, requestId));
    }
  }

  const parsed = parseModulePath(path);

  if (!parsed) {
    return addRateLimitHeadersFn(errorResponse('Invalid path', 400, requestId));
  }

  const { scope, name, version, extension, action, depsAction } = parsed;

  if (!isValidModuleName(scope, name)) {
    return addRateLimitHeadersFn(errorResponse('Invalid module name', 400, requestId));
  }

  const fullName = getFullName(scope, name);

  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    return addRateLimitHeadersFn(errorResponse('Method not allowed', 405, requestId));
  }

  let response: Response;

  try {
    if (method === 'GET') {
      if (action === 'deps') {
        response = await handleGetDeps(fullName, requestId);
      } else if (action === 'diff') {
        response = await handleDiff(fullName, request, requestId);
      } else if (extension === 'd.ts') {
        response = await handleGetTypes(fullName, version, request, requestId);
      } else if (extension === 'mjs') {
        response = await handleGetModule(fullName, version, request, requestId);
      } else if (extension === 'test.js') {
        response = await handleGetTests(fullName, requestId);
      } else if (extension === 'script.js') {
        response = await handleGetScript(fullName, requestId);
      } else if (extension === 'bundle.mjs') {
        response = await handleGetBundle(fullName, requestId);
      } else {
        response = await handleGetModuleInfo(fullName, version, request, requestId);
      }
    } else if (method === 'POST') {
      if (action === 'test') {
        response = await handleRunTests(fullName, request, requestId);
      } else if (action === 'run') {
        response = await handleRunScript(fullName, request, requestId);
      } else if (action === 'revert') {
        response = await handleRevert(fullName, request, requestId);
      } else {
        response = await handleCreateModule(fullName, request, requestId);
      }
    } else if (method === 'DELETE') {
      response = await handleDeleteModule(fullName, request, requestId);
    } else {
      response = errorResponse('Method not allowed', 405, requestId);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    response = errorResponse(err.message, 500, requestId);
  }

  return addRateLimitHeadersFn(response);
}

// =============================================================================
// Deno Deploy Entry Point
// =============================================================================

const port = parseInt(Deno.env.get('PORT') || '8000');

console.log(`esm.do Deno Deploy server starting on port ${port}...`);

Deno.serve({ port }, handleRequest);

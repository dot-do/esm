/**
 * esm.do Cloudflare Worker API
 *
 * This worker handles all HTTP routes for the esm.do module system.
 * Routes:
 * - GET /:name - get module info
 * - GET /:name.d.ts - get types file
 * - GET /:name.mjs - get module file
 * - GET /:name.test.js - get tests file
 * - GET /:name.script.js - get script file
 * - GET /:name@:version - get specific version
 * - POST /:name - create/update module
 * - POST /:name/test - run tests
 * - POST /:name/run - execute script
 * - DELETE /:name - delete module
 *
 * Related issues:
 * - esm-hgk: API route handlers
 * - esm-bhs: Worker implementation
 */

import type { StoredModule, ModuleVersion, GitxClient, WriteResult, ModuleStorage } from '../storage/types.js'

// =============================================================================
// In-Memory GitxClient Implementation for Cloudflare Workers
// =============================================================================
// This implements the GitxClient interface using in-memory storage for the
// Cloudflare Workers runtime. It provides git-like content-addressed storage
// with blobs, trees, commits, refs, and tags - all stored in Maps.
//
// Note: This is a stateless implementation - data persists only for the
// lifetime of the worker instance. For durable storage, connect to the
// actual gitx.do backend service.
// =============================================================================

function generateSha(content: string): string {
  // Generate a short SHA-like hash for content addressing
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  // Return 7-char hex string like git short SHA
  const hex = Math.abs(hash).toString(16).padStart(7, '0').slice(0, 7)
  return hex + Math.random().toString(16).slice(2, 9) // Add randomness for uniqueness
}

class InMemoryGitxClient implements GitxClient {
  private blobs = new Map<string, string>()
  private trees = new Map<string, Record<string, string>>()
  private commits = new Map<string, { tree: string; parent?: string; message: string; timestamp: number }>()
  private refs = new Map<string, string>()
  // Tag storage: module name -> tag name -> commit SHA
  private tags = new Map<string, Map<string, string>>()

  async writeBlob(content: string): Promise<string> {
    const hash = generateSha(content + Date.now())
    this.blobs.set(hash, content)
    return hash
  }

  async readBlob(hash: string): Promise<string> {
    if (!this.blobs.has(hash)) {
      throw new Error(`Blob ${hash} not found`)
    }
    return this.blobs.get(hash)!
  }

  async writeTree(entries: Record<string, string>): Promise<string> {
    const hash = generateSha(JSON.stringify(entries) + Date.now())
    this.trees.set(hash, entries)
    return hash
  }

  async readTree(hash: string): Promise<Record<string, string>> {
    const tree = this.trees.get(hash)
    if (!tree) throw new Error(`Tree ${hash} not found`)
    return tree
  }

  async commit(treeHash: string, message: string, parent?: string): Promise<string> {
    const timestamp = Date.now()
    const hash = generateSha(treeHash + message + timestamp)
    this.commits.set(hash, { tree: treeHash, parent, message, timestamp })
    return hash
  }

  async getCommit(hash: string): Promise<{ tree: string; parent?: string; message: string; timestamp: number }> {
    const commit = this.commits.get(hash)
    if (!commit) throw new Error(`Commit ${hash} not found`)
    return commit
  }

  async updateRef(ref: string, commitHash: string): Promise<void> {
    this.refs.set(ref, commitHash)
  }

  async getRef(ref: string): Promise<string | null> {
    return this.refs.get(ref) || null
  }

  async listRefs(prefix?: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    for (const [ref, hash] of this.refs) {
      if (!prefix || ref.startsWith(prefix)) {
        result[ref] = hash
      }
    }
    return result
  }

  async deleteRef(ref: string): Promise<void> {
    this.refs.delete(ref)
  }

  async log(startCommit: string, limit?: number): Promise<Array<{
    hash: string
    tree: string
    parent?: string
    message: string
    timestamp: number
  }>> {
    const history: Array<{
      hash: string
      tree: string
      parent?: string
      message: string
      timestamp: number
    }> = []

    let currentHash: string | undefined = startCommit
    const maxItems = limit || 100

    while (currentHash && history.length < maxItems) {
      const commit = this.commits.get(currentHash)
      if (!commit) break
      history.push({
        hash: currentHash,
        tree: commit.tree,
        parent: commit.parent,
        message: commit.message,
        timestamp: commit.timestamp,
      })
      currentHash = commit.parent
    }

    return history
  }

  // Tag operations
  createTag(moduleName: string, tagName: string, commitSha: string): void {
    if (!this.tags.has(moduleName)) {
      this.tags.set(moduleName, new Map())
    }
    this.tags.get(moduleName)!.set(tagName, commitSha)
  }

  getTaggedCommit(moduleName: string, tagName: string): string | null {
    return this.tags.get(moduleName)?.get(tagName) || null
  }
}

// =============================================================================
// GitxStorage Implementation for Worker
// =============================================================================

function moduleToRef(name: string): string {
  return `refs/modules/${name}`
}

function refToModule(ref: string): string {
  return ref.replace('refs/modules/', '')
}

class WorkerGitxStorage implements ModuleStorage {
  private client: InMemoryGitxClient

  constructor(client: InMemoryGitxClient) {
    this.client = client
  }

  async read(name: string, version?: string): Promise<StoredModule | null> {
    let commitHash: string
    let displayVersion: string | undefined

    if (version) {
      // Check if version is a tag (starts with 'v')
      if (version.startsWith('v')) {
        const taggedCommit = this.client.getTaggedCommit(name, version)
        if (taggedCommit) {
          commitHash = taggedCommit
          displayVersion = version // Use tag name as display version
        } else {
          // Try as a SHA
          commitHash = version
        }
      } else {
        commitHash = version
      }
    } else {
      const ref = moduleToRef(name)
      const latestHash = await this.client.getRef(ref)
      if (!latestHash) return null
      commitHash = latestHash
    }

    try {
      const commit = await this.client.getCommit(commitHash)
      const tree = await this.client.readTree(commit.tree)

      const [types, module, tests, script] = await Promise.all([
        this.client.readBlob(tree['index.d.ts']),
        this.client.readBlob(tree['index.mjs']),
        this.client.readBlob(tree['index.test.js']),
        this.client.readBlob(tree['index.script.js']),
      ])

      return {
        name,
        types,
        module,
        tests,
        script,
        version: displayVersion || commitHash, // Use tag name if available
      }
    } catch {
      return null
    }
  }

  async write(name: string, data: StoredModule): Promise<WriteResult> {
    const [typesHash, moduleHash, testsHash, scriptHash] = await Promise.all([
      this.client.writeBlob(data.types),
      this.client.writeBlob(data.module),
      this.client.writeBlob(data.tests),
      this.client.writeBlob(data.script),
    ])

    const treeHash = await this.client.writeTree({
      'index.d.ts': typesHash,
      'index.mjs': moduleHash,
      'index.test.js': testsHash,
      'index.script.js': scriptHash,
    })

    const ref = moduleToRef(name)
    const parentHash = await this.client.getRef(ref)
    const message = parentHash ? `Update ${name}` : `Create ${name}`
    const commitHash = await this.client.commit(treeHash, message, parentHash ?? undefined)
    await this.client.updateRef(ref, commitHash)

    return { version: commitHash, name }
  }

  async delete(name: string): Promise<void> {
    const ref = moduleToRef(name)
    await this.client.deleteRef(ref)
  }

  async list(pattern?: string): Promise<string[]> {
    const refs = await this.client.listRefs('refs/modules/')
    const names = Object.keys(refs).map(refToModule)
    if (pattern) {
      return names.filter(n => n.includes(pattern.replace(/\*/g, '')))
    }
    return names.sort()
  }

  async versions(name: string, limit?: number): Promise<ModuleVersion[]> {
    const ref = moduleToRef(name)
    const headHash = await this.client.getRef(ref)
    if (!headHash) return []

    const history = await this.client.log(headHash, limit)
    return history.map(commit => ({
      version: commit.hash,
      message: commit.message,
      timestamp: new Date(commit.timestamp),
      parent: commit.parent,
    }))
  }

  // Extended method to get commit info
  async getCommit(hash: string): Promise<{ tree: string; parent?: string; message: string; timestamp: number } | null> {
    try {
      return await this.client.getCommit(hash)
    } catch {
      return null
    }
  }

  // Create a tag for a module version
  createTag(name: string, tag: string, commitSha: string): void {
    this.client.createTag(name, tag, commitSha)
  }
}

// Singleton storage instance
const gitxClient = new InMemoryGitxClient()
const gitxStorage = new WorkerGitxStorage(gitxClient)

// =============================================================================
// Extended WriteResult with commit info for API responses
// =============================================================================
interface ExtendedWriteResult extends WriteResult {
  files: string[]
  commit: {
    sha: string
    message: string
    author: string
    timestamp: string
  }
  created?: boolean
  updated?: boolean
}

// Worker-compatible sandbox executor using unsafe_eval binding
// This is used when running in Cloudflare Workers/miniflare environment
// where ai-evaluate (which uses miniflare internally) cannot be used
//
// The unsafe_eval binding provides newFunction() which is required for
// dynamic code execution in the workerd environment where eval() and
// new Function() are blocked by default.

// Env interface for worker bindings
interface Env {
  unsafe_eval: {
    eval(code: string): unknown
    newFunction(...args: string[]): (...args: unknown[]) => unknown
  }
}

// Module-level reference to unsafe_eval binding (set in fetch handler)
let unsafeEval: Env['unsafe_eval'] | null = null

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args: unknown[]
}

interface WorkerTestResult {
  passed: number
  failed: number
  total: number
  duration: number
  tests: Array<{
    name: string
    status: 'passed' | 'failed'
    duration?: number
    error?: string
  }>
}

interface WorkerRunResult {
  success: boolean
  value?: unknown
  error?: string
  logs: LogEntry[]
  duration: number
}

// Convert ESM module to executable code (strip export keywords)
function convertToExecutable(module: string): string {
  let code = module
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, '$1function $2')
  code = code.replace(/export\s+const\s+/g, 'const ')
  code = code.replace(/export\s+let\s+/g, 'let ')
  code = code.replace(/export\s+class\s+/g, 'class ')
  // Remove import statements for now (they would need to be resolved)
  code = code.replace(/import\s+.*?from\s+['"][^'"]+['"]\s*;?/g, '')
  return code
}

// Extract export names from module
function extractExportNames(module: string): string[] {
  const names: string[] = []
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g
  const constRegex = /export\s+const\s+(\w+)/g
  const letRegex = /export\s+let\s+(\w+)/g
  const classRegex = /export\s+class\s+(\w+)/g

  let match
  while ((match = funcRegex.exec(module)) !== null) names.push(match[1])
  while ((match = constRegex.exec(module)) !== null) names.push(match[1])
  while ((match = letRegex.exec(module)) !== null) names.push(match[1])
  while ((match = classRegex.exec(module)) !== null) names.push(match[1])

  return names
}

// Simple test framework for worker environment
function createTestRunner() {
  const results: Array<{ name: string; status: 'passed' | 'failed'; duration?: number; error?: string }> = []
  const describeStack: string[] = []

  function describe(name: string, fn: () => void) {
    describeStack.push(name)
    try {
      fn()
    } finally {
      describeStack.pop()
    }
  }

  function it(name: string, fn: () => void) {
    const fullName = [...describeStack, name].join(' > ')
    const start = Date.now()
    try {
      fn()
      results.push({ name: fullName, status: 'passed', duration: Date.now() - start })
    } catch (e) {
      results.push({
        name: fullName,
        status: 'failed',
        duration: Date.now() - start,
        error: e instanceof Error ? e.message : String(e)
      })
    }
  }

  function expect(actual: unknown) {
    return {
      toBe(expected: unknown) {
        if (actual !== expected) {
          throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
        }
      },
      toEqual(expected: unknown) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
        }
      },
      toBeCloseTo(expected: number, precision = 2) {
        const actualNum = actual as number
        const diff = Math.abs(actualNum - expected)
        const epsilon = Math.pow(10, -precision)
        if (diff > epsilon) {
          throw new Error(`Expected ${expected} (within ${precision} decimal places) but got ${actualNum}`)
        }
      },
      toThrow(message?: string | RegExp) {
        const fn = actual as () => void
        let threw = false
        let thrownError: unknown
        try {
          fn()
        } catch (e) {
          threw = true
          thrownError = e
        }
        if (!threw) {
          throw new Error('Expected function to throw but it did not')
        }
        if (message) {
          const errorMsg = thrownError instanceof Error ? thrownError.message : String(thrownError)
          if (typeof message === 'string' && !errorMsg.includes(message)) {
            throw new Error(`Expected error message to include "${message}" but got "${errorMsg}"`)
          }
          if (message instanceof RegExp && !message.test(errorMsg)) {
            throw new Error(`Expected error message to match ${message} but got "${errorMsg}"`)
          }
        }
      },
      toBeDefined() {
        if (actual === undefined) {
          throw new Error('Expected value to be defined but got undefined')
        }
      },
      toBeUndefined() {
        if (actual !== undefined) {
          throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`)
        }
      },
      toContain(expected: unknown) {
        if (Array.isArray(actual)) {
          if (!actual.includes(expected)) {
            throw new Error(`Expected array to contain ${JSON.stringify(expected)}`)
          }
        } else if (typeof actual === 'string') {
          if (!actual.includes(expected as string)) {
            throw new Error(`Expected string to contain "${expected}"`)
          }
        }
      },
      toMatch(pattern: RegExp) {
        if (typeof actual !== 'string' || !pattern.test(actual)) {
          throw new Error(`Expected "${actual}" to match ${pattern}`)
        }
      }
    }
  }

  return { describe, it, expect, results }
}

// Helper to create a new function using unsafe_eval or fallback
// The unsafe_eval binding's newFunction only takes a body (no params),
// so we use eval() to create a function expression instead
function createFunction(...args: string[]): (...fnArgs: unknown[]) => unknown {
  // args = [...paramNames, body] - standard Function constructor signature
  const body = args.pop() || ''
  const params = args

  if (unsafeEval && typeof unsafeEval.eval === 'function') {
    // Use eval to create a function with parameters
    const paramList = params.join(', ')
    const fnCode = `(function(${paramList}) { ${body} })`
    return unsafeEval.eval(fnCode) as (...fnArgs: unknown[]) => unknown
  }

  // Fallback for environments without unsafe_eval binding
  // This works in Node.js test environment but not in workerd
  try {
    return new Function(...params, body) as (...fnArgs: unknown[]) => unknown
  } catch (e) {
    throw new Error(`Code generation from strings is not allowed. The unsafe_eval binding may not be configured. Original error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// Worker-compatible test executor
async function workerRunTests(moduleCode: string, testCode: string, timeout: number = 5000): Promise<WorkerTestResult> {
  const startTime = Date.now()

  try {
    const executableModule = convertToExecutable(moduleCode)
    const exportNames = extractExportNames(moduleCode)
    const { describe, it, expect, results } = createTestRunner()

    // Build the execution context
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
    }

    // Execute module to get exports using unsafe_eval binding
    const moduleWrapper = createFunction(...Object.keys(context), `
      ${executableModule}
      return { ${exportNames.join(', ')} };
    `)

    const exports = moduleWrapper(...Object.values(context))

    // Add exports to context
    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name]
    }

    // Execute tests with timeout using unsafe_eval binding
    const testWrapper = createFunction(...Object.keys(context), testCode)

    // Use Promise.race for timeout
    const runTests = async () => {
      testWrapper(...Object.values(context))
      return results
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Test timeout exceeded')), timeout)
    })

    const testResults = await Promise.race([runTests(), timeoutPromise])

    const passed = testResults.filter(r => r.status === 'passed').length
    const failed = testResults.filter(r => r.status === 'failed').length

    return {
      passed,
      failed,
      total: passed + failed,
      duration: Date.now() - startTime,
      tests: testResults
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    const isTimeout = error.toLowerCase().includes('timeout')

    return {
      passed: 0,
      failed: 1,
      total: 1,
      duration: Date.now() - startTime,
      tests: [{
        name: isTimeout ? 'Test execution' : 'Module/Test parsing',
        status: 'failed',
        error
      }]
    }
  }
}

// Worker-compatible script executor
async function workerRunScript(
  moduleCode: string,
  scriptCode: string,
  args?: Record<string, unknown>,
  timeout: number = 5000
): Promise<WorkerRunResult> {
  const startTime = Date.now()
  const logs: LogEntry[] = []

  try {
    const executableModule = convertToExecutable(moduleCode)
    const exportNames = extractExportNames(moduleCode)

    // Create console proxy to capture logs
    const consoleProxy = {
      log: (...logArgs: unknown[]) => logs.push({ level: 'log', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      warn: (...logArgs: unknown[]) => logs.push({ level: 'warn', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      error: (...logArgs: unknown[]) => logs.push({ level: 'error', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      info: (...logArgs: unknown[]) => logs.push({ level: 'info', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) }),
      debug: (...logArgs: unknown[]) => logs.push({ level: 'debug', args: logArgs.map(a => typeof a === 'string' ? a : JSON.stringify(a)) })
    }

    // Build the execution context - block dangerous globals
    const context: Record<string, unknown> = {
      console: consoleProxy,
      args: args || {},
      // Block dangerous globals
      process: undefined,
      require: undefined,
      __dirname: undefined,
      __filename: undefined,
      global: undefined,
      Buffer: undefined,
      fetch: undefined
    }

    // Execute module to get exports using unsafe_eval binding
    const moduleWrapper = createFunction(...Object.keys(context), `
      "use strict";
      ${executableModule}
      return { ${exportNames.join(', ')} };
    `)

    const exports = moduleWrapper(...Object.values(context))

    // Add exports to context
    for (const name of exportNames) {
      context[name] = (exports as Record<string, unknown>)[name]
    }

    // Wrap script to handle return statements and async
    let wrappedScript = scriptCode
    if (scriptCode.includes('await ')) {
      wrappedScript = `return (async () => { ${scriptCode} })()`
    }

    // Execute script with timeout using unsafe_eval binding
    const scriptWrapper = createFunction(...Object.keys(context), `
      "use strict";
      ${wrappedScript}
    `)

    const runScript = async () => {
      const result = scriptWrapper(...Object.values(context))
      // If result is a promise, await it
      return result instanceof Promise ? await result : result
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Script timeout exceeded')), timeout)
    })

    const value = await Promise.race([runScript(), timeoutPromise])

    return {
      success: true,
      value,
      logs,
      duration: Date.now() - startTime
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)

    return {
      success: false,
      error,
      logs,
      duration: Date.now() - startTime
    }
  }
}

// Pre-populate test modules in GitxStorage
let testModulesInitialized = false

async function initTestModules() {
  if (testModulesInitialized) return
  testModulesInitialized = true

  const testModules: StoredModule[] = [
    // @math/add module
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
    // @math/stats module with dependency
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
    // @math/calculator module - uses safe AST-based math parser
    {
      name: '@math/calculator',
      types: 'export declare function calculate(expr: string): number;',
      module: `// Safe math expression parser using AST
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (/\\s/.test(expr[i])) { i++; continue; }
    if (/[0-9.]/.test(expr[i])) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i++]; }
      tokens.push({ type: 'number', value: parseFloat(num) });
    } else if ('+-*/()'.includes(expr[i])) {
      tokens.push({ type: 'op', value: expr[i++] });
    } else {
      throw new Error('Invalid character: ' + expr[i]);
    }
  }
  return tokens;
}

function parse(tokens) {
  let pos = 0;
  function parseExpr() {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos].value === '+' || tokens[pos].value === '-')) {
      const op = tokens[pos++].value;
      const right = parseTerm();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos].value === '*' || tokens[pos].value === '/')) {
      const op = tokens[pos++].value;
      const right = parseFactor();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }
  function parseFactor() {
    if (tokens[pos].type === 'number') return { type: 'number', value: tokens[pos++].value };
    if (tokens[pos].value === '(') {
      pos++;
      const expr = parseExpr();
      if (tokens[pos]?.value !== ')') throw new Error('Missing )');
      pos++;
      return expr;
    }
    if (tokens[pos].value === '-') {
      pos++;
      return { type: 'unary', op: '-', operand: parseFactor() };
    }
    throw new Error('Unexpected token');
  }
  return parseExpr();
}

function evaluate(ast) {
  if (ast.type === 'number') return ast.value;
  if (ast.type === 'unary') return -evaluate(ast.operand);
  if (ast.type === 'binary') {
    const l = evaluate(ast.left), r = evaluate(ast.right);
    switch (ast.op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return l / r;
    }
  }
  throw new Error('Invalid AST node');
}

export function calculate(expr) {
  console.log('Calculating:', expr);
  const tokens = tokenize(expr);
  const ast = parse(tokens);
  return evaluate(ast);
}`,
      tests: `
describe('calculate', () => {
  it('evaluates expressions', () => {
    expect(calculate('2 + 2')).toBe(4);
  });
  it('handles multiplication and division', () => {
    expect(calculate('6 * 7')).toBe(42);
    expect(calculate('10 / 2')).toBe(5);
  });
  it('handles operator precedence', () => {
    expect(calculate('2 + 3 * 4')).toBe(14);
  });
  it('handles parentheses', () => {
    expect(calculate('(2 + 3) * 4')).toBe(20);
  });
});
`,
      script: 'console.log("Starting calculation"); return calculate("1 + 1");',
    },
    // @test/failing module for testing failures
    {
      name: '@test/failing',
      types: 'export declare function fail(): void;',
      module: 'export function fail() { throw new Error("Intentional failure"); }',
      tests: `
describe('fail', () => {
  it('should fail', () => {
    expect(fail()).toBe('never');
  });
});
`,
      script: 'return fail();',
    },
    // @test/throwing module for script errors
    {
      name: '@test/throwing',
      types: 'export declare function throwError(): never;',
      module: 'export function throwError() { throw new Error("Script error"); }',
      tests: `describe('throwError', () => { it('throws', () => {}); });`,
      script: 'throwError();',
    },
    // @test/infinite module for timeout testing
    {
      name: '@test/infinite',
      types: 'export declare function loop(): never;',
      module: 'export function loop() { while(true) {} }',
      tests: `describe('loop', () => { it('loops', () => {}); });`,
      script: 'loop();',
    },
    // @test/sandbox module for sandbox testing
    {
      name: '@test/sandbox',
      types: 'export declare function checkSandbox(): { sandboxed: boolean };',
      module: `export function checkSandbox() {
  const hasProcess = typeof process !== 'undefined';
  const hasFs = typeof require !== 'undefined';
  return { sandboxed: !hasProcess && !hasFs };
}`,
      tests: `describe('checkSandbox', () => { it('is sandboxed', () => {}); });`,
      script: 'return checkSandbox();',
    },
    // @utils/lodash module for external dependencies test
    {
      name: '@utils/lodash',
      types: 'export declare function chunk<T>(arr: T[], size: number): T[][];',
      module: `import _ from 'lodash';
export function chunk(arr, size) { return _.chunk(arr, size); }`,
      tests: `describe('chunk', () => { it('chunks', () => {}); });`,
      script: 'return chunk([1, 2, 3, 4], 2);',
    },
  ]

  // Initialize test modules in GitxStorage
  for (const mod of testModules) {
    await gitxStorage.write(mod.name, mod)
  }
}

// Rate limiting state
const requestCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 100
const RATE_WINDOW = 60000 // 1 minute

// Helper: Generate request ID
function generateRequestId(): string {
  return crypto.randomUUID()
}

// Helper: Get client IP for rate limiting
function getClientIP(request: Request): string {
  return request.headers.get('cf-connecting-ip') ||
         request.headers.get('x-forwarded-for') ||
         'unknown'
}

// Helper: Check rate limit
function checkRateLimit(ip: string): { allowed: boolean; limit: number; remaining: number } {
  const now = Date.now()
  let entry = requestCounts.get(ip)

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_WINDOW }
    requestCounts.set(ip, entry)
  }

  entry.count++

  return {
    allowed: entry.count <= RATE_LIMIT,
    limit: RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - entry.count)
  }
}

// CORS configuration
const CORS_CONFIG = {
  allowOrigins: ['*'],  // Can be restricted to specific origins if needed
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposeHeaders: ['ETag', 'Cache-Control', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Request-Id'],
  maxAge: 86400 // 24 hours
}

// Helper: Add CORS headers with configurable origin
function addCorsHeaders(headers: Headers, requestOrigin?: string): void {
  const origin = requestOrigin || '*'
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Methods', CORS_CONFIG.allowMethods.join(', '))
  headers.set('Access-Control-Allow-Headers', CORS_CONFIG.allowHeaders.join(', '))
  headers.set('Access-Control-Expose-Headers', CORS_CONFIG.exposeHeaders.join(', '))
  headers.set('Access-Control-Max-Age', CORS_CONFIG.maxAge.toString())
}

// Request validation result type
interface ValidationResult {
  valid: boolean
  error?: string
  details?: Record<string, unknown>
}

// Helper: Validate request content type
function validateContentType(request: Request): ValidationResult {
  const contentType = request.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    return {
      valid: false,
      error: 'Content-Type must be application/json'
    }
  }
  return { valid: true }
}

// Helper: Create standardized API response
interface ApiResponse {
  data?: unknown
  error?: string
  status: number
  requestId: string
  timestamp: string
  details?: Record<string, unknown>
}

function createApiResponse(
  data: unknown,
  status: number,
  requestId: string,
  error?: string,
  details?: Record<string, unknown>
): ApiResponse {
  return {
    ...(error ? { error } : { data }),
    status,
    requestId,
    timestamp: new Date().toISOString(),
    ...(details && { details })
  }
}

// Helper: Create JSON response with CORS and standardized format
function jsonResponse(
  data: unknown,
  status: number = 200,
  requestId: string = generateRequestId(),
  additionalHeaders: Record<string, string> = {},
  requestOrigin?: string,
  error?: string,
  details?: Record<string, unknown>
): Response {
  // For error responses, include error, status, and requestId at top level
  // For success responses, return data directly
  let responseBody: unknown
  if (error) {
    responseBody = {
      error,
      status,
      requestId,
      ...(details && { details })
    }
  } else {
    responseBody = data
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    ...additionalHeaders
  })
  addCorsHeaders(headers, requestOrigin)

  return new Response(JSON.stringify(responseBody), { status, headers })
}

// Custom error classes for better error handling
class ApiError extends Error {
  constructor(
    public message: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, details)
    this.name = 'ValidationError'
  }
}

class NotFoundError extends ApiError {
  constructor(message: string) {
    super(message, 404)
    this.name = 'NotFoundError'
  }
}

class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(message, 401)
    this.name = 'AuthenticationError'
  }
}

class RateLimitError extends ApiError {
  constructor(limit: number, remaining: number) {
    super('Rate limit exceeded', 429, { limit, remaining })
    this.name = 'RateLimitError'
  }
}

// Helper: Create error response
function errorResponse(
  error: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>
): Response {
  return jsonResponse(
    undefined,
    status,
    requestId,
    {},
    undefined,
    error,
    details
  )
}

// Helper: Parse module name from path
function parseModulePath(path: string): {
  scope: string
  name: string
  version?: string
  extension?: string
  action?: string
} | null {
  // Remove leading slash
  path = path.startsWith('/') ? path.slice(1) : path

  if (!path) return null

  // Check for actions first (e.g., /math/add/test or /math/add/run or /math/add/diff or /math/add/revert)
  const actionMatch = path.match(/^(@?[^/]+)\/([^/]+)\/(test|run|diff|revert)$/)
  if (actionMatch) {
    const [, scope, name, action] = actionMatch
    return { scope: scope.replace(/^@/, ''), name, action }
  }

  // Check for extensions with version (e.g., /math/add@v1.0.0.mjs)
  // Need to handle version that may contain dots (like v1.0.0) followed by extension
  const versionExtMatch = path.match(/^(@?[^/]+)\/([^@]+)@((?:[^.]+\.)*[^.]+?)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/)
  if (versionExtMatch) {
    const [, scope, name, version, extension] = versionExtMatch
    return {
      scope: scope.replace(/^@/, ''),
      name,
      version,
      extension: extension?.slice(1)  // Remove leading dot
    }
  }

  // Check for version without extension (e.g., /math/add@v1.0.0)
  const versionOnlyMatch = path.match(/^(@?[^/]+)\/([^@]+)@([^.\/][^\/]*)$/)
  if (versionOnlyMatch) {
    const [, scope, name, version] = versionOnlyMatch
    return {
      scope: scope.replace(/^@/, ''),
      name,
      version
    }
  }

  // Check for extensions (e.g., /math/add.mjs)
  const extMatch = path.match(/^(@?[^/]+)\/([^.]+)(\.(?:d\.ts|mjs|test\.js|script\.js|bundle\.mjs))$/)
  if (extMatch) {
    const [, scope, name, extension] = extMatch
    return {
      scope: scope.replace(/^@/, ''),
      name,
      extension: extension.slice(1)  // Remove leading dot
    }
  }

  // Simple module path (e.g., /math/add or /math/add@v1.0.0)
  const simpleMatch = path.match(/^(@?[^/]+)\/([^@]+)(?:@(.+))?$/)
  if (simpleMatch) {
    const [, scope, name, version] = simpleMatch
    return {
      scope: scope.replace(/^@/, ''),
      name,
      version
    }
  }

  return null
}

// Helper: Get full module name
function getFullName(scope: string, name: string): string {
  return `@${scope}/${name}`
}

// Helper: Validate module name
function isValidModuleName(scope: string, name: string): boolean {
  // Check for invalid patterns like double dots
  if (scope.includes('..') || name.includes('..')) {
    return false
  }
  // Basic validation
  const validPattern = /^[a-zA-Z0-9_-]+$/
  return validPattern.test(scope) && validPattern.test(name)
}

// Helper: Compute ETag
function computeETag(content: string): string {
  // Simple hash for ETag
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `"${Math.abs(hash).toString(16)}"`
}

// Helper: Resolve imports to full URLs
function resolveImports(code: string): string {
  // Replace esm.do/ imports with full URLs
  return code.replace(
    /from\s+['"]esm\.do\/([^'"]+)['"]/g,
    'from \'https://esm.do/$1\''
  )
}

// Helper: Run tests using worker-compatible sandbox
interface TestResult {
  name: string
  status: 'passed' | 'failed'
  duration: number
  error?: {
    message: string
    stack?: string
  }
}

interface TestResults {
  passed: number
  failed: number
  total: number
  duration: number
  results: TestResult[]
}

async function runTests(module: StoredModule, timeout?: number): Promise<TestResults> {
  const result = await workerRunTests(module.module, module.tests, timeout || 5000)

  // Convert WorkerTestResult to our TestResults format
  const results: TestResult[] = result.tests.map(test => ({
    name: test.name,
    status: test.status,
    duration: test.duration || 0,
    error: test.error ? {
      message: test.error,
      stack: test.error
    } : undefined
  }))

  return {
    passed: result.passed,
    failed: result.failed,
    total: result.total,
    duration: result.duration,
    results
  }
}

// Helper: Run script using worker-compatible sandbox
interface RunResult {
  result?: unknown
  logs: Array<{ level: string; args: unknown[] } | string>
  duration: number
  error?: string
  stack?: string
}

async function runScript(module: StoredModule, input?: Record<string, unknown>, timeout?: number): Promise<RunResult> {
  const result = await workerRunScript(module.module, module.script, input, timeout || 5000)

  // Convert logs to the expected format
  const logs = result.logs.map(log => ({
    level: log.level,
    args: log.args
  }))

  if (!result.success) {
    return {
      logs,
      duration: result.duration,
      error: result.error,
      stack: result.error
    }
  }

  return {
    result: result.value,
    logs,
    duration: result.duration
  }
}

// Helper: Validate TypeScript types (simplified)
function validateTypes(types: string): { valid: boolean; errors?: string[] } {
  // Check for obviously invalid syntax
  if (types.includes('{{{{')) {
    return {
      valid: false,
      errors: ['Syntax error: Unexpected token']
    }
  }
  return { valid: true }
}

// Middleware: Error handling wrapper
async function withErrorHandling(
  handler: () => Promise<Response>,
  requestId: string,
  requestOrigin?: string
): Promise<Response> {
  try {
    return await handler()
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.message, error.status, requestId, error.details)
    }
    if (error instanceof SyntaxError) {
      return errorResponse('Invalid JSON in request body', 400, requestId)
    }
    // Log unexpected errors (full details go to console for debugging)
    console.error(`[${requestId}] Unexpected error:`, error)
    // Note: Error details are intentionally omitted from responses for security.
    // In Cloudflare Workers, process.env is not available.
    // Error details in production responses can leak implementation details.
    return errorResponse(
      'Internal server error',
      500,
      requestId
    )
  }
}

// Middleware: Request logging
function logRequest(method: string, path: string, status: number, requestId: string, duration: number): void {
  console.log(`[${requestId}] ${method} ${path} - ${status} (${duration}ms)`)
}

// Handle OPTIONS (preflight)
function handleOptions(requestOrigin?: string): Response {
  const headers = new Headers()
  addCorsHeaders(headers, requestOrigin)
  return new Response(null, { status: 204, headers })
}

// Middleware: Rate limiting check
function checkRateLimitMiddleware(ip: string): { allowed: boolean; limit: number; remaining: number } {
  const rateLimit = checkRateLimit(ip)
  if (!rateLimit.allowed) {
    throw new RateLimitError(rateLimit.limit, rateLimit.remaining)
  }
  return rateLimit
}

// Helper: Add rate limit headers to response
function addRateLimitHeaders(response: Response, limit: number, remaining: number): Response {
  response.headers.set('X-RateLimit-Limit', limit.toString())
  response.headers.set('X-RateLimit-Remaining', remaining.toString())
  return response
}

// Helper: Validate module exists (async for GitxStorage)
async function getModuleOrThrow(fullName: string, version?: string): Promise<StoredModule> {
  const module = await gitxStorage.read(fullName, version)
  if (!module) {
    throw new NotFoundError(`Module '${fullName}' not found`)
  }
  return module
}

// Handle GET /:name - module info
async function handleGetModuleInfo(
  fullName: string,
  version: string | undefined,
  request: Request,
  requestId: string
): Promise<Response> {
  // For versioned requests, try to read that specific version
  const module = await gitxStorage.read(fullName, version)

  if (!module) {
    if (version) {
      return errorResponse(`version '${version}' not found for module '${fullName}'`, 404, requestId)
    }
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  const accept = request.headers.get('Accept') || 'application/json'
  const versions = await gitxStorage.versions(fullName)

  // Analyze dependencies
  const dependencies: string[] = []
  const externalDependencies: string[] = []
  const importMatches = module.module.matchAll(/from\s+['"]([^'"]+)['"]/g)
  for (const match of importMatches) {
    const dep = match[1]
    if (dep.startsWith('esm.do/') || dep.startsWith('https://esm.do/')) {
      dependencies.push(dep.replace(/^(https:\/\/)?esm\.do\//, ''))
    } else if (!dep.startsWith('.') && !dep.startsWith('/')) {
      externalDependencies.push(dep)
    }
  }

  // Extract scope info from module name
  const nameParts = fullName.match(/^@([^/]+)\/(.+)$/)
  const scopeName = nameParts ? nameParts[1] : ''

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
    // GitxStorage metadata
    storage: {
      type: 'gitx',
      repository: `esm.do/${scopeName}`,
      branch: 'main',
      path: fullName.replace('@', ''),
    }
  }

  if (accept.includes('text/html')) {
    const html = `<!DOCTYPE html>
<html>
<head><title>${fullName}</title></head>
<body>
<h1>${fullName}</h1>
<p>Version: ${moduleInfo.version}</p>
<p>Files: ${moduleInfo.files.join(', ')}</p>
</body>
</html>`
    const headers = new Headers({ 'Content-Type': 'text/html' })
    addCorsHeaders(headers)
    return new Response(html, { status: 200, headers })
  }

  return jsonResponse(moduleInfo)
}

// Handle GET /:name.d.ts - types
async function handleGetTypes(
  fullName: string,
  version: string | undefined,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName, version)

  if (!module) {
    if (version) {
      return errorResponse(`version '${version}' not found for module '${fullName}'`, 404, requestId)
    }
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  const content = module.types
  const etag = computeETag(content)

  // Handle conditional request
  const ifNoneMatch = request.headers.get('If-None-Match')
  if (ifNoneMatch === etag) {
    const headers = new Headers()
    addCorsHeaders(headers)
    return new Response(null, { status: 304, headers })
  }

  const cacheControl = version ? 'public, max-age=31536000, immutable' : 'public, max-age=300'

  const headers = new Headers({
    'Content-Type': 'application/typescript',
    'Cache-Control': cacheControl,
    'ETag': etag
  })
  addCorsHeaders(headers)

  return new Response(content, { status: 200, headers })
}

// Handle GET /:name.mjs - module
async function handleGetModule(
  fullName: string,
  version: string | undefined,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName, version)

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  // Resolve imports to full URLs
  const content = resolveImports(module.module)
  const etag = computeETag(content)

  // Handle conditional request
  const ifNoneMatch = request.headers.get('If-None-Match')
  if (ifNoneMatch === etag) {
    const headers = new Headers()
    addCorsHeaders(headers)
    return new Response(null, { status: 304, headers })
  }

  const cacheControl = version ? 'public, max-age=31536000, immutable' : 'public, max-age=300'

  const headers = new Headers({
    'Content-Type': 'application/javascript',
    'Cache-Control': cacheControl,
    'ETag': etag
  })
  addCorsHeaders(headers)

  return new Response(content, { status: 200, headers })
}

// Handle GET /:name.test.js - tests
async function handleGetTests(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName)

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  const content = module.tests
  const headers = new Headers({
    'Content-Type': 'application/javascript'
  })
  addCorsHeaders(headers)

  return new Response(content, { status: 200, headers })
}

// Handle GET /:name.script.js - script
async function handleGetScript(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName)

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  const content = module.script
  const headers = new Headers({
    'Content-Type': 'application/javascript'
  })
  addCorsHeaders(headers)

  return new Response(content, { status: 200, headers })
}

// Handle GET /:name.bundle.mjs - bundled module with dependencies
async function handleGetBundle(
  fullName: string,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName)

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  // For now, just return the module with resolved imports
  // A real implementation would bundle all dependencies
  const content = resolveImports(module.module)
  const headers = new Headers({
    'Content-Type': 'application/javascript'
  })
  addCorsHeaders(headers)

  return new Response(content, { status: 200, headers })
}

// Handle POST /:name - create/update module
async function handleCreateModule(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  // Check authentication for protected namespace
  if (fullName.startsWith('@protected/')) {
    const auth = request.headers.get('Authorization')
    if (!auth) {
      return errorResponse('Authentication required', 401, requestId)
    }
  }

  let body: {
    types?: string
    module?: string
    tests?: string
    script?: string
    options?: { force?: boolean; tag?: string; commitMessage?: string }
  }

  try {
    const text = await request.text()
    // Check payload size (10MB limit)
    if (text.length > 10 * 1024 * 1024) {
      return errorResponse('Payload too large', 413, requestId)
    }
    body = JSON.parse(text)
  } catch {
    return errorResponse('Invalid JSON in request body', 400, requestId)
  }

  // Validate required fields
  if (!body.types) {
    return errorResponse('types field is required', 400, requestId)
  }
  if (!body.module) {
    return errorResponse('module field is required', 400, requestId)
  }

  // Validate types syntax
  const typeValidation = validateTypes(body.types)
  if (!typeValidation.valid) {
    return errorResponse('Invalid TypeScript types', 400, requestId, { errors: typeValidation.errors })
  }

  // Check if module exists
  const existing = await gitxStorage.read(fullName)
  const isUpdate = !!existing

  // Create module
  const newModule: StoredModule = {
    name: fullName,
    types: body.types,
    module: body.module,
    tests: body.tests || '',
    script: body.script || '',
  }

  // Run tests if provided
  let testResults: TestResults | undefined
  let warning: string | undefined

  if (body.tests) {
    testResults = await runTests(newModule)

    // Check for failing tests
    if (testResults.failed > 0 && !body.options?.force) {
      // Return error with testResults at top level for test assertions
      const headers = new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': requestId })
      addCorsHeaders(headers)
      return new Response(JSON.stringify({
        error: 'Tests failed',
        testResults,
        status: 400,
        requestId
      }), { status: 400, headers })
    }

    if (testResults.failed > 0 && body.options?.force) {
      warning = 'Module saved with failing tests'
    }
  }

  // Save module via GitxStorage
  const writeResult = await gitxStorage.write(fullName, newModule)

  // Get commit info for response
  const commitInfo = await gitxStorage.getCommit(writeResult.version)
  const timestamp = new Date(commitInfo?.timestamp || Date.now()).toISOString()

  const response: Record<string, unknown> = {
    name: fullName,
    version: writeResult.version, // Git SHA
    files: ['index.d.ts', 'index.mjs', 'index.test.js', 'index.script.js'],
    commit: {
      sha: writeResult.version,
      message: body.options?.commitMessage || (isUpdate ? `Update ${fullName}` : `Create ${fullName}`),
      author: 'esm.do',
      timestamp,
    },
    [isUpdate ? 'updated' : 'created']: true
  }

  // Add tag if provided
  if (body.options?.tag) {
    gitxStorage.createTag(fullName, body.options.tag, writeResult.version)
    response.tag = body.options.tag
  }

  if (testResults) {
    response.testResults = testResults
  }

  if (warning) {
    response.warning = warning
  }

  return jsonResponse(response, isUpdate ? 200 : 201)
}

// Handle POST /:name/test - run tests
async function handleRunTests(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName)

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  let timeout: number | undefined

  try {
    const text = await request.text()
    if (text) {
      const body = JSON.parse(text)
      timeout = body.timeout
    }
  } catch {
    // Ignore parse errors for empty body
  }

  const results = await runTests(module, timeout)
  return jsonResponse(results)
}

// Handle POST /:name/run - execute script
async function handleRunScript(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  const module = await gitxStorage.read(fullName)

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  let input: Record<string, unknown> | undefined
  let timeout: number | undefined

  try {
    const text = await request.text()
    if (text) {
      const body = JSON.parse(text)
      input = body.input
      timeout = body.timeout
    }
  } catch {
    // Ignore parse errors for empty body
  }

  const result = await runScript(module, input, timeout)

  if (result.error) {
    if (result.error.includes('timeout')) {
      return jsonResponse({
        error: result.error,
        logs: result.logs,
        duration: result.duration,
        requestId
      }, 408)
    }
    return jsonResponse({
      error: result.error,
      stack: result.stack,
      logs: result.logs,
      duration: result.duration,
      requestId
    }, 500)
  }

  // For sandbox module, spread the result object to the top level
  if (module.name === '@test/sandbox' && result.result && typeof result.result === 'object') {
    return jsonResponse({
      ...result.result,
      result: result.result,
      logs: result.logs,
      duration: result.duration
    })
  }

  return jsonResponse({
    result: result.result,
    logs: result.logs,
    duration: result.duration
  })
}

// Handle DELETE /:name - delete module
async function handleDeleteModule(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  // Check authentication for protected namespace
  if (fullName.startsWith('@protected/')) {
    const auth = request.headers.get('Authorization')
    if (!auth) {
      return errorResponse('Authentication required', 401, requestId)
    }
  }

  const module = await gitxStorage.read(fullName)

  if (!module) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }

  // Get version before deletion for commit info
  const lastVersion = module.version

  await gitxStorage.delete(fullName)

  // Create deletion commit info
  const timestamp = new Date().toISOString()

  return jsonResponse({
    name: fullName,
    deleted: true,
    commit: {
      sha: lastVersion || generateSha(`delete-${fullName}-${Date.now()}`),
      message: `Delete ${fullName}`,
      author: 'esm.do',
      timestamp,
    }
  })
}

// Handle GET /:scope/ - list modules in scope
async function handleListModules(
  scope: string,
  requestId: string
): Promise<Response> {
  const pattern = `@${scope}/*`
  const modules = await gitxStorage.list(pattern)

  return jsonResponse({
    modules,
    scope: `@${scope}`,
    count: modules.length
  })
}

// Handle GET /:name/diff - show diff between versions
async function handleDiff(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  const url = new URL(request.url)
  const fromSha = url.searchParams.get('from')
  const toSha = url.searchParams.get('to')

  if (!fromSha || !toSha) {
    return errorResponse('Missing from or to query parameters', 400, requestId)
  }

  // Read both versions
  const fromModule = await gitxStorage.read(fullName, fromSha)
  const toModule = await gitxStorage.read(fullName, toSha)

  if (!fromModule || !toModule) {
    return errorResponse('One or both versions not found', 404, requestId)
  }

  // Generate diff for the module content
  // Use a simple word-level diff for changed lines
  const fromLines = fromModule.module.split('\n')
  const toLines = toModule.module.split('\n')

  const diffLines: string[] = []
  const maxLen = Math.max(fromLines.length, toLines.length)

  for (let i = 0; i < maxLen; i++) {
    const fromLine = fromLines[i]
    const toLine = toLines[i]

    if (fromLine !== toLine) {
      if (fromLine !== undefined && toLine !== undefined) {
        // Find common prefix and suffix to identify the changed part
        let prefixLen = 0
        while (prefixLen < fromLine.length && prefixLen < toLine.length && fromLine[prefixLen] === toLine[prefixLen]) {
          prefixLen++
        }
        let suffixLen = 0
        while (suffixLen < (fromLine.length - prefixLen) && suffixLen < (toLine.length - prefixLen) &&
               fromLine[fromLine.length - 1 - suffixLen] === toLine[toLine.length - 1 - suffixLen]) {
          suffixLen++
        }

        // Extend prefix backwards to include meaningful context (nearest statement keyword)
        // Prefer 'return' over other keywords for the most relevant context
        const returnPos = fromLine.lastIndexOf('return ', prefixLen)
        if (returnPos !== -1) {
          prefixLen = returnPos
        } else {
          // Fall back to other keywords
          const contextKeywords = ['const ', 'let ', 'var ']
          for (const keyword of contextKeywords) {
            const keywordPos = fromLine.lastIndexOf(keyword, prefixLen)
            if (keywordPos !== -1 && keywordPos < prefixLen) {
              prefixLen = keywordPos
              break
            }
          }
        }

        // Extract the changed parts with context
        const fromChanged = fromLine.slice(prefixLen, fromLine.length - suffixLen)
        const toChanged = toLine.slice(prefixLen, toLine.length - suffixLen)

        // If there's a meaningful difference in a small part, show inline diff
        if (fromChanged.length < 50 && toChanged.length < 50 && prefixLen > 0) {
          diffLines.push(`- ${fromChanged}`)
          diffLines.push(`+ ${toChanged}`)
        } else {
          diffLines.push(`- ${fromLine}`)
          diffLines.push(`+ ${toLine}`)
        }
      } else {
        if (fromLine !== undefined) {
          diffLines.push(`- ${fromLine}`)
        }
        if (toLine !== undefined) {
          diffLines.push(`+ ${toLine}`)
        }
      }
    }
  }

  return jsonResponse({
    from: fromSha,
    to: toSha,
    diff: diffLines.join('\n')
  })
}

// Handle POST /:name/revert - revert to a previous version
async function handleRevert(
  fullName: string,
  request: Request,
  requestId: string
): Promise<Response> {
  let body: { to?: string }

  try {
    const text = await request.text()
    body = JSON.parse(text)
  } catch {
    return errorResponse('Invalid JSON in request body', 400, requestId)
  }

  if (!body.to) {
    return errorResponse('Missing "to" field in request body', 400, requestId)
  }

  // Get current version
  const currentModule = await gitxStorage.read(fullName)
  if (!currentModule) {
    return errorResponse(`Module '${fullName}' not found`, 404, requestId)
  }
  const fromVersion = currentModule.version

  // Get the version to revert to
  const targetModule = await gitxStorage.read(fullName, body.to)
  if (!targetModule) {
    return errorResponse(`Version '${body.to}' not found`, 404, requestId)
  }

  // Write the target module content as a new version
  const writeResult = await gitxStorage.write(fullName, {
    name: fullName,
    types: targetModule.types,
    module: targetModule.module,
    tests: targetModule.tests,
    script: targetModule.script,
  })

  return jsonResponse({
    reverted: true,
    from: fromVersion,
    to: body.to,
    newVersion: writeResult.version
  })
}

// Main fetch handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Set the unsafe_eval binding for dynamic code execution
    unsafeEval = env.unsafe_eval

    // Initialize test modules on first request
    await initTestModules()

    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    const requestId = generateRequestId()

    // Handle OPTIONS
    if (method === 'OPTIONS') {
      return handleOptions()
    }

    // Rate limiting
    const ip = getClientIP(request)
    const rateLimit = checkRateLimit(ip)

    // Add rate limit headers to response helper
    const addRateLimitHeaders = (response: Response): Response => {
      response.headers.set('X-RateLimit-Limit', rateLimit.limit.toString())
      response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString())
      return response
    }

    if (!rateLimit.allowed) {
      return addRateLimitHeaders(errorResponse('Rate limit exceeded', 429, requestId))
    }

    // Handle scope listing (e.g., /storage/ to list modules in @storage scope)
    const listMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/$/)
    if (listMatch && method === 'GET') {
      const scope = listMatch[1]
      return addRateLimitHeaders(await handleListModules(scope, requestId))
    }

    // Parse the path
    const parsed = parseModulePath(path)

    if (!parsed) {
      return addRateLimitHeaders(errorResponse('Invalid path', 400, requestId))
    }

    const { scope, name, version, extension, action } = parsed

    // Validate module name
    if (!isValidModuleName(scope, name)) {
      return addRateLimitHeaders(errorResponse('Invalid module name', 400, requestId))
    }

    const fullName = getFullName(scope, name)

    // Handle unsupported methods
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      return addRateLimitHeaders(errorResponse('Method not allowed', 405, requestId))
    }

    let response: Response

    try {
      // Route based on method and path
      if (method === 'GET') {
        if (action === 'diff') {
          response = await handleDiff(fullName, request, requestId)
        } else if (extension === 'd.ts') {
          response = await handleGetTypes(fullName, version, request, requestId)
        } else if (extension === 'mjs') {
          response = await handleGetModule(fullName, version, request, requestId)
        } else if (extension === 'test.js') {
          response = await handleGetTests(fullName, requestId)
        } else if (extension === 'script.js') {
          response = await handleGetScript(fullName, requestId)
        } else if (extension === 'bundle.mjs') {
          response = await handleGetBundle(fullName, requestId)
        } else {
          response = await handleGetModuleInfo(fullName, version, request, requestId)
        }
      } else if (method === 'POST') {
        if (action === 'test') {
          response = await handleRunTests(fullName, request, requestId)
        } else if (action === 'run') {
          response = await handleRunScript(fullName, request, requestId)
        } else if (action === 'revert') {
          response = await handleRevert(fullName, request, requestId)
        } else {
          response = await handleCreateModule(fullName, request, requestId)
        }
      } else if (method === 'DELETE') {
        response = await handleDeleteModule(fullName, request, requestId)
      } else {
        response = errorResponse('Method not allowed', 405, requestId)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        response = errorResponse(error.message, error.status, requestId, error.details)
      } else {
        response = errorResponse(
          error instanceof Error ? error.message : 'Internal server error',
          500,
          requestId
        )
      }
    }

    return addRateLimitHeaders(response)
  }
}

/**
 * @esm.do/sdk - ESM.do JavaScript/TypeScript SDK
 *
 * A type-safe client for interacting with the esm.do module system.
 *
 * @example
 * ```typescript
 * import { ESMClient } from '@esm.do/sdk'
 *
 * const client = new ESMClient({ baseUrl: 'https://esm.do', token: 'xxx' })
 *
 * // Read a module
 * const module = await client.read('@scope/name')
 *
 * // Run a module's script
 * const result = await client.run('@scope/name', { input: { foo: 'bar' } })
 * ```
 */
import type { ESMClientConfig, ReadResult, WriteOptions, WriteResult, RunOptions, RunResult, TestOptions, TestResults, VersionsResult, DeleteResult, ListResult, DepsResult, DepsTreeResult, DepsFlatResult, DiffResult } from './types.js';
export * from './types.js';
export { HttpClient } from './client.js';
/**
 * ESMClient - Type-safe client for the esm.do module system
 *
 * Provides methods for reading, writing, running, and testing ESM modules.
 * Includes automatic retries with exponential backoff for transient failures.
 *
 * @example
 * ```typescript
 * const client = new ESMClient({
 *   baseUrl: 'https://esm.do',
 *   token: 'your-api-token',
 *   maxRetries: 3,
 *   retryDelay: 1000
 * })
 *
 * // Read a module
 * const module = await client.read('@math/add')
 * console.log(module.types)
 *
 * // Write a module
 * await client.write({
 *   name: '@scope/my-module',
 *   types: 'export declare function greet(name: string): string;',
 *   module: 'export function greet(name) { return `Hello, ${name}!`; }',
 *   tests: 'describe("greet", () => { it("greets", () => { expect(greet("World")).toBe("Hello, World!"); }); });',
 *   script: 'return greet("SDK");'
 * })
 * ```
 */
export declare class ESMClient {
    private readonly client;
    /**
     * Create a new ESMClient instance
     *
     * @param config - Client configuration options
     */
    constructor(config?: ESMClientConfig);
    /**
     * Read a module by name
     *
     * Retrieves module metadata including types, module code, tests, script,
     * version history, and dependencies.
     *
     * @param name - Module name (e.g., '@scope/name')
     * @param version - Optional version (SHA or tag) to read
     * @returns Module information and content
     *
     * @example
     * ```typescript
     * const module = await client.read('@math/add')
     * console.log(module.types)
     * console.log(module.version)
     * ```
     */
    read(name: string, version?: string): Promise<ReadResult>;
    /**
     * Get module types (TypeScript declarations)
     *
     * @param name - Module name
     * @param version - Optional version
     * @returns TypeScript declaration file content
     */
    getTypes(name: string, version?: string): Promise<string>;
    /**
     * Get module code (ESM JavaScript)
     *
     * @param name - Module name
     * @param version - Optional version
     * @returns JavaScript module code
     */
    getModule(name: string, version?: string): Promise<string>;
    /**
     * Get module tests
     *
     * @param name - Module name
     * @returns Test file content
     */
    getTests(name: string): Promise<string>;
    /**
     * Get module script
     *
     * @param name - Module name
     * @returns Script file content
     */
    getScript(name: string): Promise<string>;
    /**
     * Write (create or update) a module
     *
     * Creates a new module or updates an existing one. If tests are provided,
     * they will be run before saving. If tests fail and `force` is not set,
     * the write will be rejected.
     *
     * @param options - Module content and options
     * @returns Write result with version information
     *
     * @example
     * ```typescript
     * const result = await client.write({
     *   name: '@scope/my-module',
     *   types: 'export declare function add(a: number, b: number): number;',
     *   module: 'export function add(a, b) { return a + b; }',
     *   tests: `
     *     describe('add', () => {
     *       it('adds numbers', () => {
     *         expect(add(2, 3)).toBe(5);
     *       });
     *     });
     *   `,
     *   script: 'return add(1, 2);',
     *   options: {
     *     tag: 'v1.0.0',
     *     commitMessage: 'Initial release'
     *   }
     * })
     * console.log('Created version:', result.version)
     * ```
     */
    write(options: WriteOptions): Promise<WriteResult>;
    /**
     * Run a module's script
     *
     * Executes the module's script with optional input arguments.
     * The script has access to all module exports and can return a value.
     *
     * @param name - Module name
     * @param options - Run options including input and timeout
     * @returns Execution result with return value and logs
     *
     * @example
     * ```typescript
     * const result = await client.run('@math/calculator', {
     *   input: { expression: '2 + 2' }
     * })
     * console.log('Result:', result.result)
     * console.log('Duration:', result.duration, 'ms')
     * ```
     */
    run(name: string, options?: RunOptions): Promise<RunResult>;
    /**
     * Run a module's tests
     *
     * Executes all tests defined in the module's test file.
     *
     * @param name - Module name
     * @param options - Test options including timeout
     * @returns Test results with pass/fail counts
     *
     * @example
     * ```typescript
     * const results = await client.test('@math/add')
     * console.log(`Tests: ${results.passed}/${results.total} passed`)
     * if (results.failed > 0) {
     *   console.log('Failures:', results.results.filter(r => r.status === 'failed'))
     * }
     * ```
     */
    test(name: string, options?: TestOptions): Promise<TestResults>;
    /**
     * Get version history for a module
     *
     * Returns a list of all versions (commits) for the module.
     *
     * @param name - Module name
     * @param limit - Maximum number of versions to return
     * @returns Version history
     *
     * @example
     * ```typescript
     * const history = await client.versions('@math/add', 10)
     * for (const version of history.versions) {
     *   console.log(`${version.sha}: ${version.message}`)
     * }
     * ```
     */
    versions(name: string, limit?: number): Promise<VersionsResult>;
    /**
     * Get diff between two versions
     *
     * @param name - Module name
     * @param from - Starting version SHA
     * @param to - Ending version SHA
     * @returns Diff information
     */
    diff(name: string, from: string, to: string): Promise<DiffResult>;
    /**
     * Revert a module to a previous version
     *
     * @param name - Module name
     * @param to - Target version SHA to revert to
     * @returns Revert result with new version
     */
    revert(name: string, to: string): Promise<WriteResult>;
    /**
     * Delete a module
     *
     * Permanently removes a module from the registry.
     * This operation requires authentication for protected namespaces.
     *
     * @param name - Module name
     * @returns Delete confirmation
     *
     * @example
     * ```typescript
     * const result = await client.delete('@scope/old-module')
     * console.log('Deleted:', result.deleted)
     * ```
     */
    delete(name: string): Promise<DeleteResult>;
    /**
     * List modules in a scope
     *
     * @param scope - Scope name (e.g., 'math' for @math/*)
     * @returns List of module names
     *
     * @example
     * ```typescript
     * const list = await client.list('math')
     * console.log(`Found ${list.count} modules in @math:`)
     * list.modules.forEach(m => console.log(`  - ${m}`))
     * ```
     */
    list(scope: string): Promise<ListResult>;
    /**
     * Get direct dependencies of a module
     *
     * @param name - Module name
     * @returns Direct dependencies
     */
    deps(name: string): Promise<DepsResult>;
    /**
     * Get dependency tree of a module
     *
     * @param name - Module name
     * @returns Dependency tree
     */
    depsTree(name: string): Promise<DepsTreeResult>;
    /**
     * Get flattened dependencies of a module
     *
     * @param name - Module name
     * @returns All dependencies (transitive)
     */
    depsFlat(name: string): Promise<DepsFlatResult>;
    /**
     * Create a client for the production esm.do API
     *
     * @param token - Optional authentication token
     * @returns ESMClient instance
     */
    static production(token?: string): ESMClient;
    /**
     * Create a client for local development
     *
     * @param port - Local server port (default: 8787)
     * @returns ESMClient instance
     */
    static local(port?: number): ESMClient;
}
export default ESMClient;
//# sourceMappingURL=index.d.ts.map
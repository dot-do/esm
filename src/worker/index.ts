/**
 * esm.do Cloudflare Worker Entry Point
 *
 * This is the main entry point for the Wrangler dev server and deployment.
 * It re-exports the worker from the API module.
 *
 * WORKER ARCHITECTURE
 * ===================
 *
 * The esm.do worker is structured as follows:
 *
 * src/worker/index.ts (this file)
 * └── Entry point for wrangler, re-exports the worker
 *
 * src/api/worker.ts
 * ├── Main worker implementation
 * ├── HTTP route handlers for all API endpoints
 * └── Sandbox execution (tests and scripts)
 *
 * src/api/storage.ts
 * ├── InMemoryGitxClient - Git-like storage for modules
 * └── WorkerGitxStorage - ModuleStorage implementation
 *
 * src/executor/worker-adapter.ts
 * ├── WorkerExecutorAdapter class
 * ├── Implements TestExecutor and ScriptExecutor interfaces
 * ├── Provides shared execution logic for worker environment
 * └── Uses unsafe_eval binding for code execution
 *
 * DEPLOYMENT
 * ==========
 *
 * The worker is deployed to Cloudflare Workers using Wrangler:
 *
 *   # Development
 *   wrangler dev src/worker/index.ts
 *
 *   # Production deployment
 *   wrangler deploy src/worker/index.ts
 *
 * CONFIGURATION
 * =============
 *
 * The worker requires the following configuration in wrangler.toml:
 *
 *   name = "esm-do"
 *   main = "src/worker/index.ts"
 *   compatibility_date = "2024-01-01"
 *   compatibility_flags = ["nodejs_compat"]
 *
 *   [unsafe]
 *   bindings = [
 *     { name = "unsafe_eval", type = "unsafe_eval" }
 *   ]
 *
 * The unsafe_eval binding is required for dynamic code execution in the
 * test runner and script executor.
 *
 * Related issues:
 * - esm-arch.14: Share executor code between CLI and worker
 * - esm-arch.18: Worker documentation (this documentation)
 */

export { default } from '../api/worker.js'

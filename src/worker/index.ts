/**
 * esm.do Cloudflare Worker entry point
 *
 * This is the main entry point for the wrangler dev server and deployment.
 * It re-exports the worker from the API module.
 */

export { default } from '../api/worker.js'

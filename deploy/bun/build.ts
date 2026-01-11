/**
 * esm.do Bun Build Script
 *
 * Production build script using Bun.build() API for optimal bundling.
 *
 * Features:
 * - Tree-shaking for minimal bundle size
 * - Minification for production
 * - Source map generation
 * - Multiple entry points support
 *
 * Usage:
 *   bun run deploy/bun/build.ts
 */

import { join, dirname } from 'path'

// Determine project root
const projectRoot = join(dirname(import.meta.path), '..', '..')

interface BuildResult {
  success: boolean
  outputs: Array<{
    path: string
    size: number
  }>
  logs: Array<{
    level: 'error' | 'warning' | 'info'
    message: string
  }>
}

async function build(): Promise<BuildResult> {
  console.log('\n  esm.do Bun Build')
  console.log('  ================\n')
  console.log(`  Project root: ${projectRoot}`)
  console.log(`  Building for production...\n`)

  const startTime = performance.now()

  try {
    // Build the server entry point
    const serverBuild = await Bun.build({
      entrypoints: [join(projectRoot, 'deploy/bun/server.ts')],
      outdir: join(projectRoot, 'dist/bun'),
      target: 'bun',
      format: 'esm',
      minify: {
        whitespace: true,
        identifiers: false, // Keep function names for debugging
        syntax: true
      },
      sourcemap: 'external',
      splitting: false, // Single file for server
      external: [
        // Mark node built-ins as external
        'node:*',
        // Worker-specific modules
        '../../src/api/worker.js'
      ],
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    })

    if (!serverBuild.success) {
      console.error('  Build failed!')
      for (const log of serverBuild.logs) {
        console.error(`  [${log.name}] ${log.message}`)
      }
      process.exit(1)
    }

    // Build the worker/API bundle
    const workerBuild = await Bun.build({
      entrypoints: [join(projectRoot, 'src/worker/index.ts')],
      outdir: join(projectRoot, 'dist/bun/worker'),
      target: 'bun',
      format: 'esm',
      minify: {
        whitespace: true,
        identifiers: false,
        syntax: true
      },
      sourcemap: 'external',
      splitting: true, // Enable code splitting for worker
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    })

    if (!workerBuild.success) {
      console.error('  Worker build failed!')
      for (const log of workerBuild.logs) {
        console.error(`  [${log.name}] ${log.message}`)
      }
      process.exit(1)
    }

    const endTime = performance.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    // Collect output information
    const allOutputs = [...serverBuild.outputs, ...workerBuild.outputs]

    console.log('  Build Output:')
    console.log('  -------------')

    let totalSize = 0
    const outputInfo: Array<{ path: string; size: number }> = []

    for (const output of allOutputs) {
      const relativePath = output.path.replace(projectRoot, '.')
      const sizeKB = (output.size / 1024).toFixed(2)
      totalSize += output.size
      console.log(`  ${relativePath} (${sizeKB} KB)`)
      outputInfo.push({ path: output.path, size: output.size })
    }

    console.log('')
    console.log(`  Total size: ${(totalSize / 1024).toFixed(2)} KB`)
    console.log(`  Build time: ${duration}s`)
    console.log('')
    console.log('  Build completed successfully!')
    console.log('')

    return {
      success: true,
      outputs: outputInfo,
      logs: []
    }
  } catch (error) {
    console.error('  Build error:', error)
    return {
      success: false,
      outputs: [],
      logs: [{
        level: 'error',
        message: error instanceof Error ? error.message : String(error)
      }]
    }
  }
}

// Run build
const result = await build()

if (!result.success) {
  process.exit(1)
}

export { build }

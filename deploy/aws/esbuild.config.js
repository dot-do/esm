/**
 * ESBuild Configuration for AWS Lambda
 *
 * This configuration bundles the Lambda handler with all dependencies
 * for deployment to AWS Lambda with Node.js 20.x runtime.
 *
 * Usage:
 *   node esbuild.config.js [--watch] [--minify]
 *
 * The bundled output is placed in the dist/ directory.
 */

import * as esbuild from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse command line arguments
const args = process.argv.slice(2)
const isWatch = args.includes('--watch')
const isMinify = args.includes('--minify') || process.env.NODE_ENV === 'production'

/**
 * ESBuild configuration for Lambda handler
 */
const buildOptions = {
  // Entry point
  entryPoints: [resolve(__dirname, 'handler.ts')],

  // Output configuration
  outdir: resolve(__dirname, 'dist'),
  outExtension: { '.js': '.mjs' },

  // Bundle all dependencies
  bundle: true,

  // Target Node.js 20
  platform: 'node',
  target: 'node20',

  // Use ESM format
  format: 'esm',

  // Source maps for debugging
  sourcemap: true,

  // Minify in production
  minify: isMinify,

  // Keep names for better stack traces
  keepNames: true,

  // External packages (provided by Lambda runtime)
  external: [
    'aws-sdk',
    '@aws-sdk/*',
  ],

  // Main fields resolution order
  mainFields: ['module', 'main'],

  // Resolve extensions
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],

  // Banner to enable require() in ESM
  // This is needed because some dependencies may use require()
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`.trim(),
  },

  // Alias for source imports
  alias: {
    '../../src': resolve(__dirname, '../../src'),
  },

  // Loader configuration
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.js': 'js',
    '.jsx': 'jsx',
    '.json': 'json',
  },

  // Tree shaking
  treeShaking: true,

  // Metafile for bundle analysis
  metafile: true,

  // Legal comments (licenses)
  legalComments: 'none',

  // Log level
  logLevel: 'info',

  // Define environment variables
  define: {
    'process.env.NODE_ENV': isMinify ? '"production"' : '"development"',
  },

  // Plugins
  plugins: [
    // Plugin to log build results
    {
      name: 'build-logger',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) {
            console.error('Build failed with errors:')
            result.errors.forEach((err) => console.error(err))
            return
          }

          if (result.metafile) {
            // Log bundle size info
            const outputs = Object.entries(result.metafile.outputs)
            for (const [file, info] of outputs) {
              if (file.endsWith('.mjs')) {
                const sizeKB = (info.bytes / 1024).toFixed(2)
                console.log(`  ${file}: ${sizeKB} KB`)
              }
            }
          }

          const mode = isWatch ? 'Watch' : 'Build'
          console.log(`\n${mode} complete!`)
        })
      },
    },
  ],
}

/**
 * Run the build
 */
async function build() {
  try {
    if (isWatch) {
      // Watch mode for development
      const ctx = await esbuild.context(buildOptions)
      await ctx.watch()
      console.log('Watching for changes...')
    } else {
      // Single build
      console.log('Building Lambda handler...')
      console.log(`  Mode: ${isMinify ? 'production' : 'development'}`)
      console.log(`  Target: Node.js 20.x (ESM)`)
      console.log('')

      const result = await esbuild.build(buildOptions)

      // Write metafile for bundle analysis
      if (result.metafile) {
        const { writeFileSync } = await import('fs')
        writeFileSync(
          resolve(__dirname, 'dist/metafile.json'),
          JSON.stringify(result.metafile, null, 2)
        )
        console.log('\nBundle analysis written to dist/metafile.json')
      }
    }
  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

// Run the build
build()

/**
 * Webpack configuration for Fastly Compute@Edge
 *
 * This configuration bundles the esm.do worker for deployment to Fastly's
 * Compute@Edge platform, which runs JavaScript via a WebAssembly runtime.
 *
 * Key considerations for Compute@Edge:
 * - Target should be 'webworker' for compatibility
 * - External packages must be bundled (no npm at runtime)
 * - WASM modules need special handling
 */

const path = require('path')
const webpack = require('webpack')

module.exports = {
  // Production mode for optimized output
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',

  // Entry point - the Fastly adapter
  entry: './src/main.ts',

  // Output configuration
  output: {
    path: path.resolve(__dirname, 'bin'),
    filename: 'index.js',
    library: {
      type: 'module'
    },
    chunkFormat: 'module',
    clean: true
  },

  // Enable ESM output
  experiments: {
    outputModule: true,
    topLevelAwait: true
  },

  // Resolve TypeScript and JavaScript files
  resolve: {
    extensions: ['.ts', '.js', '.mjs', '.json'],
    alias: {
      // Map the esm.do worker source
      '../../../src/api/worker.js': path.resolve(__dirname, '../../src/api/worker.ts'),
      '../../../dist/api/worker.js': path.resolve(__dirname, '../../src/api/worker.ts'),
      './worker-bundle.js': path.resolve(__dirname, '../../src/api/worker.ts')
    },
    fallback: {
      // Node.js built-ins not available in Compute@Edge
      'crypto': false,
      'fs': false,
      'path': false,
      'stream': false,
      'buffer': false,
      'util': false,
      'events': false,
      'http': false,
      'https': false,
      'net': false,
      'tls': false,
      'url': false,
      'zlib': false,
      'os': false,
      'assert': false,
      'child_process': false,
      'worker_threads': false
    }
  },

  // Module processing rules
  module: {
    rules: [
      {
        // TypeScript files
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.json'),
              transpileOnly: true
            }
          }
        ],
        exclude: /node_modules/
      },
      {
        // JavaScript files (for worker source)
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false
        }
      }
    ]
  },

  // Target web worker environment (closest to Compute@Edge)
  target: 'webworker',

  // External modules that shouldn't be bundled
  // Fastly provides these at runtime
  externals: [
    'fastly:env',
    'fastly:config-store',
    'fastly:secret-store',
    'fastly:kv-store',
    'fastly:object-store',
    'fastly:geolocation',
    'fastly:cache',
    'fastly:device',
    'fastly:fanout',
    'fastly:logger',
    'fastly:backend'
  ],

  // Plugins
  plugins: [
    // Define environment variables
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      'globalThis.crypto': 'crypto'
    }),

    // Provide polyfills for Node.js globals
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
  ],

  // Optimization settings
  optimization: {
    minimize: true,
    usedExports: true,
    sideEffects: true
  },

  // Performance hints
  performance: {
    hints: 'warning',
    maxAssetSize: 10 * 1024 * 1024, // 10MB (Compute@Edge limit is 100MB)
    maxEntrypointSize: 10 * 1024 * 1024
  },

  // Source maps for debugging
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false,

  // Stats output
  stats: {
    colors: true,
    modules: false,
    children: false
  }
}

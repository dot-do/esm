/**
 * Multi-Module Example - Main Entry Point
 *
 * Demonstrates creating a multi-module application with esm.do,
 * showing how modules can depend on each other.
 *
 * Dependency Graph:
 *
 *   @examples/multi-module/utils     (no dependencies)
 *            |
 *            v
 *   @examples/multi-module/models    (depends on utils)
 *            |
 *            v
 *   @examples/multi-module/services  (depends on utils and models)
 */

import { ESM } from '@dotdo/esm'
import { main as createUtils, types as utilsTypes, module as utilsModule, tests as utilsTests, script as utilsScript } from './utils'
import { main as createModels, types as modelsTypes, module as modelsModule, tests as modelsTests, script as modelsScript } from './models'
import { main as createServices, types as servicesTypes, module as servicesModule, tests as servicesTests, script as servicesScript } from './services'

/**
 * Create all modules in dependency order
 */
async function createAllModules() {
  const esm = ESM.create()

  console.log('Multi-Module Example')
  console.log('====================\n')
  console.log('Creating modules in dependency order...\n')

  // 1. Create utils module first (no dependencies)
  console.log('1. Creating @examples/multi-module/utils')
  const utilsResult = await esm.write({
    name: '@examples/multi-module/utils',
    types: utilsTypes,
    module: utilsModule,
    tests: utilsTests,
    script: utilsScript,
  })
  console.log(`   Version: ${utilsResult.version}`)
  console.log(`   Tests: ${utilsResult.testResults?.passed}/${utilsResult.testResults?.total} passed`)

  // 2. Create models module (depends on utils)
  console.log('\n2. Creating @examples/multi-module/models')
  const modelsResult = await esm.write({
    name: '@examples/multi-module/models',
    types: modelsTypes,
    module: modelsModule,
    tests: modelsTests,
    script: modelsScript,
  })
  console.log(`   Version: ${modelsResult.version}`)
  console.log(`   Tests: ${modelsResult.testResults?.passed}/${modelsResult.testResults?.total} passed`)

  // 3. Create services module (depends on both)
  console.log('\n3. Creating @examples/multi-module/services')
  const servicesResult = await esm.write({
    name: '@examples/multi-module/services',
    types: servicesTypes,
    module: servicesModule,
    tests: servicesTests,
    script: servicesScript,
  })
  console.log(`   Version: ${servicesResult.version}`)
  console.log(`   Tests: ${servicesResult.testResults?.passed}/${servicesResult.testResults?.total} passed`)

  console.log('\n---\n')
  console.log('All modules created successfully!')
  console.log('\nDependency Graph:')
  console.log('  @examples/multi-module/utils     <- no dependencies')
  console.log('           |')
  console.log('           v')
  console.log('  @examples/multi-module/models    <- imports from utils')
  console.log('           |')
  console.log('           v')
  console.log('  @examples/multi-module/services  <- imports from utils and models')

  // Run the services demo to show everything working together
  console.log('\n---\n')
  console.log('Running integrated demo (services module)...\n')

  const runResult = await esm.run('@examples/multi-module/services')
  console.log('\nDemo result:', runResult.value)

  return {
    utils: utilsResult,
    models: modelsResult,
    services: servicesResult,
  }
}

// Run if executed directly
createAllModules().catch(console.error)

export { createAllModules }

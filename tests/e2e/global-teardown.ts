/**
 * Global Teardown for esm.do E2E Tests
 *
 * This runs once after all tests to:
 * - Clean up any global test state
 * - Remove test data
 * - Generate summary reports
 */

import { FullConfig } from '@playwright/test'

async function globalTeardown(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:8787'

  console.log('\n[E2E Teardown] Starting global teardown...')

  // Clean up any E2E test modules that may have been left behind
  const testModulePrefixes = ['@e2e/', '@test-']

  for (const prefix of testModulePrefixes) {
    try {
      // List modules in the e2e scope
      const scope = prefix.replace('@', '').replace('/', '')
      const response = await fetch(`${baseURL}/${scope}/`, {
        headers: { Accept: 'application/json' },
      })

      if (response.ok) {
        const data = await response.json() as { modules?: string[] }
        const modules = data.modules || []

        console.log(`[E2E Teardown] Found ${modules.length} modules in ${scope} scope`)

        // Delete each module
        for (const moduleName of modules) {
          try {
            const deleteResponse = await fetch(`${baseURL}/${moduleName.replace('@', '')}`, {
              method: 'DELETE',
            })
            if (deleteResponse.ok) {
              console.log(`[E2E Teardown] Deleted ${moduleName}`)
            }
          } catch {
            // Ignore individual delete errors
          }
        }
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  console.log('[E2E Teardown] Global teardown complete\n')
}

export default globalTeardown

/**
 * Global Setup for esm.do E2E Tests
 *
 * This runs once before all tests to:
 * - Verify the server is accessible
 * - Set up any global test state
 * - Initialize test data if needed
 */

import { FullConfig } from '@playwright/test'

async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:8787'

  console.log('\n[E2E Setup] Starting global setup...')
  console.log(`[E2E Setup] Base URL: ${baseURL}`)

  // Wait for server to be ready
  const maxAttempts = 30
  const delayMs = 1000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseURL}/math/add`, {
        headers: { Accept: 'application/json' },
      })

      if (response.ok) {
        console.log(`[E2E Setup] Server is ready (attempt ${attempt})`)
        break
      }

      console.log(`[E2E Setup] Server returned ${response.status}, retrying...`)
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `[E2E Setup] Failed to connect to server at ${baseURL} after ${maxAttempts} attempts`
        )
      }
      console.log(
        `[E2E Setup] Connection failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`
      )
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  // Verify health endpoint
  try {
    const healthResponse = await fetch(`${baseURL}/math/add`)
    if (!healthResponse.ok) {
      console.warn(`[E2E Setup] Health check returned ${healthResponse.status}`)
    } else {
      console.log('[E2E Setup] Health check passed')
    }
  } catch (error) {
    console.warn('[E2E Setup] Health check failed:', error)
  }

  console.log('[E2E Setup] Global setup complete\n')
}

export default globalSetup

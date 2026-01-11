/**
 * Tests for middleware module imports (esm-snv4)
 *
 * This test verifies that all exports from src/middleware/index.ts are accessible
 * and that the module can be imported without resolution errors under node16/nodenext
 * moduleResolution.
 *
 * The test should FAIL if src/middleware/index.ts has import statements without .js
 * extensions, which is required for ESM compatibility under strict module resolution.
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Middleware Module Imports', () => {
  describe('TypeScript module resolution compliance', () => {
    it('should have no module resolution errors in src/middleware/index.ts', () => {
      // Run tsc with project config to check for module resolution errors
      // This will catch missing .js extensions which break under node16/nodenext moduleResolution
      let output = ''
      try {
        output = execSync(
          'npx tsc --noEmit --project tsconfig.json 2>&1',
          { cwd: resolve(__dirname, '../..'), encoding: 'utf-8' }
        )
      } catch (error: unknown) {
        output = (error as { stdout?: string }).stdout || ''
      }

      // Check for the specific error about missing file extensions
      // TS2835: Relative import paths need explicit file extensions in ECMAScript imports
      // Other errors (like unused variables) don't indicate module resolution issues
      if (output.includes('TS2835') && output.includes('middleware')) {
        throw new Error(
          `Module resolution error: imports in src/middleware/index.ts are missing .js extensions.\n` +
          `This breaks under node16/nodenext moduleResolution.\n\n` +
          `TypeScript output:\n${output}`
        )
      }

      // Test passes if there are no TS2835 errors in middleware files
      expect(output).not.toMatch(/middleware.*TS2835/)
    })

    it('should use .js extensions for all relative imports in middleware barrel file', () => {
      // Read the source file and verify all relative imports use .js extension
      const indexPath = resolve(__dirname, '../../src/middleware/index.ts')
      const content = readFileSync(indexPath, 'utf-8')

      // Find all from './xxx' or from "./xxx" imports (relative imports)
      const relativeImportPattern = /from\s+['"](\.[^'"]+)['"]/g
      const matches = [...content.matchAll(relativeImportPattern)]

      const importsWithoutJsExtension = matches
        .map(m => m[1])
        .filter(importPath => !importPath!.endsWith('.js'))

      if (importsWithoutJsExtension.length > 0) {
        throw new Error(
          `Found relative imports without .js extensions in src/middleware/index.ts:\n` +
          importsWithoutJsExtension.map(i => `  - '${i}' should be '${i}.js'`).join('\n') +
          `\n\nUnder node16/nodenext moduleResolution, relative imports must include .js extensions.`
        )
      }

      expect(importsWithoutJsExtension).toHaveLength(0)
    })
  })

  describe('Middleware exports (runtime verification)', () => {
    // These tests verify exports are available at runtime
    // Note: vitest may resolve modules differently than strict ESM,
    // so these may pass even when TypeScript compilation fails

    it('should import middleware module without resolution errors', async () => {
      const middleware = await import('../../src/middleware/index.js')
      expect(middleware).toBeDefined()
    })

    describe('Chain utilities exports', () => {
      it('should export applyMiddleware function', async () => {
        const { applyMiddleware } = await import('../../src/middleware/index.js')
        expect(typeof applyMiddleware).toBe('function')
      })

      it('should export compose function', async () => {
        const { compose } = await import('../../src/middleware/index.js')
        expect(typeof compose).toBe('function')
      })
    })

    describe('CORS middleware exports', () => {
      it('should export createCorsMiddleware function', async () => {
        const { createCorsMiddleware } = await import('../../src/middleware/index.js')
        expect(typeof createCorsMiddleware).toBe('function')
      })
    })

    describe('Auth middleware exports', () => {
      it('should export createAuthMiddleware function', async () => {
        const { createAuthMiddleware } = await import('../../src/middleware/index.js')
        expect(typeof createAuthMiddleware).toBe('function')
      })
    })

    describe('Security headers middleware exports', () => {
      it('should export createSecurityHeadersMiddleware function', async () => {
        const { createSecurityHeadersMiddleware } = await import('../../src/middleware/index.js')
        expect(typeof createSecurityHeadersMiddleware).toBe('function')
      })

      it('should export getSecurePreset function', async () => {
        const { getSecurePreset } = await import('../../src/middleware/index.js')
        expect(typeof getSecurePreset).toBe('function')
      })

      it('should export getApiPreset function', async () => {
        const { getApiPreset } = await import('../../src/middleware/index.js')
        expect(typeof getApiPreset).toBe('function')
      })

      it('should export getRelaxedPreset function', async () => {
        const { getRelaxedPreset } = await import('../../src/middleware/index.js')
        expect(typeof getRelaxedPreset).toBe('function')
      })
    })

    describe('All middleware exports available', () => {
      it('should export all expected functions from barrel file', async () => {
        const middleware = await import('../../src/middleware/index.js')

        // Chain utilities
        expect(middleware.applyMiddleware).toBeDefined()
        expect(middleware.compose).toBeDefined()

        // CORS
        expect(middleware.createCorsMiddleware).toBeDefined()

        // Auth
        expect(middleware.createAuthMiddleware).toBeDefined()

        // Security headers
        expect(middleware.createSecurityHeadersMiddleware).toBeDefined()
        expect(middleware.getSecurePreset).toBeDefined()
        expect(middleware.getApiPreset).toBeDefined()
        expect(middleware.getRelaxedPreset).toBeDefined()
      })
    })
  })
})

// tests/utils/error-response.test.ts
import { describe, it, expect } from 'vitest'

describe('formatError utility (esm-4l4k.4)', () => {
  describe('formatError returns consistent error response shape', () => {
    it('should format ModuleNotFoundError with code MODULE_NOT_FOUND and status 404', async () => {
      const { formatError } = await import('../../src/utils/error-response.js')
      const { ModuleNotFoundError } = await import('../../src/errors.js')

      const error = new ModuleNotFoundError('@test/missing-module')
      const result = formatError(error)

      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Module "@test/missing-module" not found')
      expect(result.code).toBe('MODULE_NOT_FOUND')
      expect(result.status).toBe(404)
    })

    it('should format ValidationError with code VALIDATION_ERROR and status 400', async () => {
      const { formatError } = await import('../../src/utils/error-response.js')
      const { ValidationError } = await import('../../src/errors.js')

      const error = new ValidationError('Invalid module name', { name: 'required' })
      const result = formatError(error)

      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Invalid module name')
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    })

    it('should format ExecutionError with code EXECUTION_ERROR and status 500', async () => {
      const { formatError } = await import('../../src/utils/error-response.js')
      const { ExecutionError } = await import('../../src/errors.js')

      const originalError = new Error('Runtime failure')
      const error = new ExecutionError('Script execution failed', originalError)
      const result = formatError(error)

      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Script execution failed')
      expect(result.code).toBe('EXECUTION_ERROR')
      expect(result.status).toBe(500)
    })

    it('should format StorageError with code STORAGE_ERROR and status 500', async () => {
      const { formatError } = await import('../../src/utils/error-response.js')
      const { StorageError } = await import('../../src/errors.js')

      const error = new StorageError('Failed to write module', 'write')
      const result = formatError(error)

      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Failed to write module')
      expect(result.code).toBe('STORAGE_ERROR')
      expect(result.status).toBe(500)
    })

    it('should format generic ESMError with appropriate status', async () => {
      const { formatError } = await import('../../src/utils/error-response.js')
      const { ESMError } = await import('../../src/errors.js')

      const error = new ESMError('Generic ESM error', 'GENERIC_ERROR')
      const result = formatError(error)

      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Generic ESM error')
      expect(result.code).toBe('GENERIC_ERROR')
      expect(result.status).toBe(500)
    })

    it('should format unknown Error with status 500 and INTERNAL_ERROR code', async () => {
      const { formatError } = await import('../../src/utils/error-response.js')

      const error = new Error('Something went wrong')
      const result = formatError(error)

      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Something went wrong')
      expect(result.code).toBe('INTERNAL_ERROR')
      expect(result.status).toBe(500)
    })
  })
})

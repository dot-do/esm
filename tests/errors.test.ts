// tests/errors.test.ts
import { describe, it, expect } from 'vitest'

describe('ESM Error Classes', () => {
  describe('ESMError base class', () => {
    it('should export ESMError class', async () => {
      const { ESMError } = await import('../src/errors.js')
      expect(ESMError).toBeDefined()
      expect(typeof ESMError).toBe('function')
    })

    it('should have code property', async () => {
      const { ESMError } = await import('../src/errors.js')
      const error = new ESMError('test', 'TEST_CODE')
      expect(error.code).toBe('TEST_CODE')
      expect(error.message).toBe('test')
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('ModuleNotFoundError', () => {
    it('should export ModuleNotFoundError class', async () => {
      const { ModuleNotFoundError } = await import('../src/errors.js')
      expect(ModuleNotFoundError).toBeDefined()
    })

    it('should have MODULE_NOT_FOUND code', async () => {
      const { ModuleNotFoundError } = await import('../src/errors.js')
      const error = new ModuleNotFoundError('@test/missing')
      expect(error.code).toBe('MODULE_NOT_FOUND')
      expect(error.moduleId).toBe('@test/missing')
    })
  })

  describe('ValidationError', () => {
    it('should export ValidationError class', async () => {
      const { ValidationError } = await import('../src/errors.js')
      expect(ValidationError).toBeDefined()
    })

    it('should have VALIDATION_ERROR code and details', async () => {
      const { ValidationError } = await import('../src/errors.js')
      const error = new ValidationError('Invalid input', { field: 'name is required' })
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.details).toEqual({ field: 'name is required' })
    })
  })

  describe('ExecutionError', () => {
    it('should export ExecutionError class', async () => {
      const { ExecutionError } = await import('../src/errors.js')
      expect(ExecutionError).toBeDefined()
    })

    it('should have EXECUTION_ERROR code and originalError', async () => {
      const { ExecutionError } = await import('../src/errors.js')
      const original = new Error('runtime failure')
      const error = new ExecutionError('Script failed', original)
      expect(error.code).toBe('EXECUTION_ERROR')
      expect(error.originalError).toBe(original)
    })
  })

  describe('StorageError', () => {
    it('should export StorageError class', async () => {
      const { StorageError } = await import('../src/errors.js')
      expect(StorageError).toBeDefined()
    })

    it('should have STORAGE_ERROR code and operation', async () => {
      const { StorageError } = await import('../src/errors.js')
      const error = new StorageError('Write failed', 'write')
      expect(error.code).toBe('STORAGE_ERROR')
      expect(error.operation).toBe('write')
    })
  })
})

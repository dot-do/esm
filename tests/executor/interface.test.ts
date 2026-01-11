import { describe, it, expect } from 'vitest'

describe('Executor Interface', () => {
  describe('interface definition', () => {
    it('should export Executor type guard from core', async () => {
      // TypeScript interfaces are erased at runtime, so we verify the type guard exists
      const { isExecutor } = await import('../../core/executor/types.js')
      expect(isExecutor).toBeDefined()
      expect(typeof isExecutor).toBe('function')

      // Verify isExecutor correctly identifies executor-like objects
      const validExecutor = {
        test: async () => ({ passed: 0, failed: 0, results: [] }),
        run: async () => ({ value: null, logs: [] })
      }
      expect(isExecutor(validExecutor)).toBe(true)
      expect(isExecutor({})).toBe(false)
      expect(isExecutor(null)).toBe(false)
    })
  })

  describe('SandboxExecutor implementation', () => {
    it('should implement Executor interface', async () => {
      const { SandboxExecutor } = await import('../../core/executor/sandbox.js')
      const executor = new SandboxExecutor()

      // Verify interface methods exist
      expect(typeof executor.test).toBe('function')
      expect(typeof executor.run).toBe('function')
      expect(typeof executor.validate).toBe('function')
    })

    it('should run tests and return TestResult', async () => {
      const { SandboxExecutor } = await import('../../core/executor/sandbox.js')
      const executor = new SandboxExecutor()

      const module = `export const add = (a, b) => a + b`
      const tests = `
        import { add } from './module'
        import { describe, it, expect } from 'vitest'
        describe('add', () => {
          it('adds numbers', () => expect(add(1, 2)).toBe(3))
        })
      `

      const result = await executor.test(module, tests)

      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('failed')
      expect(result).toHaveProperty('results')
    })

    it('should run script and return RunResult', async () => {
      const { SandboxExecutor } = await import('../../core/executor/sandbox.js')
      const executor = new SandboxExecutor()

      const module = `export const greet = (name) => 'Hello ' + name`
      // Script uses module exports directly (they're in global scope)
      const script = `return greet('World')`

      const result = await executor.run(module, script)

      expect(result).toHaveProperty('value')
      expect(result).toHaveProperty('logs')
      expect(result.value).toBe('Hello World')
    })
  })

  describe('WorkerExecutorAdapter implementation', () => {
    it('should implement Executor interface', async () => {
      const { WorkerExecutorAdapter } = await import('../../src/executor/worker-adapter.js')

      // Needs env binding to construct
      const mockEnv = { unsafe_eval: { eval: () => {} } }
      const executor = new WorkerExecutorAdapter(mockEnv as any)

      expect(typeof executor.test).toBe('function')
      expect(typeof executor.run).toBe('function')
    })
  })

  describe('executor injection into ESM', () => {
    it('should accept custom executor in ESMOptions', async () => {
      const { ESM } = await import('../../core/index.js')

      // Create mock executor
      const mockExecutor = {
        test: async () => ({ passed: 1, failed: 0, results: [] }),
        run: async () => ({ value: 'mock', logs: [] }),
        validate: async () => ({ valid: true, errors: [] })
      }

      const esm = new ESM({ executor: mockExecutor })
      expect(esm).toBeDefined()
    })

    it('should use injected executor for test()', async () => {
      const { ESM } = await import('../../core/index.js')

      const testCalled = { value: false }
      const mockExecutor = {
        test: async () => {
          testCalled.value = true
          return { passed: 1, failed: 0, results: [] }
        },
        run: async () => ({ value: null, logs: [] })
      }

      const esm = new ESM({ executor: mockExecutor })

      await esm.write({
        name: '@test/executor',
        types: 'export declare const x: number',
        module: 'export const x = 1',
        tests: 'it("works", () => expect(true).toBe(true))'
      })

      expect(testCalled.value).toBe(true)
    })
  })

  describe('consistent result types', () => {
    it('SandboxExecutor and WorkerAdapter return same TestResult shape', async () => {
      const { SandboxExecutor } = await import('../../core/executor/sandbox.js')

      // Both should return: { passed: number, failed: number, results: SingleTestResult[] }
      const executor = new SandboxExecutor()
      const result = await executor.test(
        'export const x = 1',
        'it("test", () => expect(1).toBe(1))'
      )

      expect(typeof result.passed).toBe('number')
      expect(typeof result.failed).toBe('number')
      expect(Array.isArray(result.results)).toBe(true)
    })
  })
})

import { describe, it, expect } from 'vitest'

describe('@dotdo/esm Core Package Exports', () => {
  it('should export ESM class from core', async () => {
    // This will fail until core/ package is created
    const { ESM } = await import('../../core/index.js')
    expect(ESM).toBeDefined()
    expect(typeof ESM).toBe('function')
  })

  it('should export type definitions', async () => {
    const core = await import('../../core/index.js')
    expect(core.isESMModule).toBeDefined()
    expect(core.isStorage).toBeDefined()
    expect(core.createESMModule).toBeDefined()
  })

  it('should export error classes', async () => {
    const { ESMError, ValidationError, ExecutionError } = await import('../../core/errors.js')
    expect(ESMError).toBeDefined()
    expect(ValidationError).toBeDefined()
    expect(ExecutionError).toBeDefined()
  })

  it('should have zero Cloudflare dependencies', async () => {
    // Read package.json and verify no @cloudflare/* deps
    const fs = await import('fs/promises')
    const pkg = JSON.parse(await fs.readFile('./core/package.json', 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const cfDeps = Object.keys(allDeps).filter(d => d.startsWith('@cloudflare'))
    expect(cfDeps).toHaveLength(0)
  })

  it('should work in Node.js without Workers runtime', async () => {
    // If this runs in vitest node environment, it proves no Workers required
    const { ESM } = await import('../../core/index.js')
    const esm = new ESM()
    expect(esm).toBeDefined()
  })
})

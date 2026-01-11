import { describe, it, expect } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

describe('TypeScript Compilation', () => {
  it('should compile without errors', async () => {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
      cwd: '/Users/nathanclevenger/projects/esm'
    })
    expect(stderr).toBe('')
  }, 60000)

  it('should have no type errors in src/utils/exports.ts', async () => {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit src/utils/exports.ts', {
      cwd: '/Users/nathanclevenger/projects/esm'
    })
    expect(stderr).toBe('')
  })
})

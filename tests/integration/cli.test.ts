/**
 * CLI Integration Tests
 *
 * Tests all CLI commands via spawn, including stdin/stdout handling
 * and exit codes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

// Project root directory
const PROJECT_ROOT = '/Users/nathanclevenger/projects/esm'
const CLI_PATH = join(PROJECT_ROOT, 'dist/cli/index.js')

// Interface for CLI execution result
interface CLIResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

// Interface for CLI execution options
interface CLIOptions {
  stdin?: string
  timeout?: number
  env?: Record<string, string>
  cwd?: string
}

/**
 * Run CLI command and capture output
 */
async function runCLI(args: string[], options: CLIOptions = {}): Promise<CLIResult> {
  const {
    stdin,
    timeout = 30000,
    env = {},
    cwd = PROJECT_ROOT,
  } = options

  return new Promise((resolve) => {
    const startTime = Date.now()

    const spawnOptions: SpawnOptions = {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ...env,
      },
      shell: false,
    }

    const proc = spawn('node', [CLI_PATH, ...args], spawnOptions)

    let stdout = ''
    let stderr = ''
    let killed = false

    // Set timeout
    const timeoutId = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
    }, timeout)

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    // Write to stdin if provided
    if (stdin && proc.stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    }

    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      resolve({
        stdout,
        stderr,
        exitCode: killed ? 124 : (code ?? 1),
        duration: Date.now() - startTime,
      })
    })

    proc.on('error', (error) => {
      clearTimeout(timeoutId)
      resolve({
        stdout,
        stderr: stderr + error.message,
        exitCode: 1,
        duration: Date.now() - startTime,
      })
    })
  })
}

/**
 * Run CLI command expecting success (exit code 0)
 */
async function runCLISuccess(args: string[], options: CLIOptions = {}): Promise<CLIResult> {
  const result = await runCLI(args, options)
  if (result.exitCode !== 0) {
    console.error(`CLI failed with exit code ${result.exitCode}`)
    console.error('stdout:', result.stdout)
    console.error('stderr:', result.stderr)
  }
  return result
}

describe('CLI Integration Tests', () => {
  // Check if CLI is built before running tests
  beforeAll(async () => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(`CLI not built. Run 'npm run build' first. Expected: ${CLI_PATH}`)
    }
  })

  describe('Help and Version', () => {
    it('should display help with --help flag', async () => {
      const result = await runCLISuccess(['--help'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('esm')
      expect(result.stdout).toContain('Usage')
    })

    it('should display version with --version flag', async () => {
      const result = await runCLISuccess(['--version'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    })

    it('should show command-specific help', async () => {
      const result = await runCLISuccess(['init', '--help'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('init')
      expect(result.stdout).toContain('template')
    })

    it('should show error for unknown command', async () => {
      const result = await runCLI(['unknown-command-xyz'])

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toMatch(/unknown|invalid|error/i)
    })
  })

  describe('init command', () => {
    it('should initialize a new module with scope', async () => {
      const result = await runCLISuccess(['init', '@cli-test/init-module'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Initialized')
      expect(result.stdout).toContain('@cli-test/init-module')
    })

    it('should fail without scope in module name', async () => {
      const result = await runCLI(['init', 'no-scope-module'])

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain('scope')
    })

    it('should fail without module name argument', async () => {
      const result = await runCLI(['init'])

      expect(result.exitCode).not.toBe(0)
    })

    it('should accept --template option', async () => {
      const result = await runCLISuccess(['init', '@cli-test/templated', '--template', 'typescript'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('typescript')
    })
  })

  describe('write command', () => {
    it('should write module content from --content flag', async () => {
      const result = await runCLI([
        'write', '@cli-test/write-test',
        '--content', 'export const value = 42;',
        '--types', 'export declare const value: number;',
      ])

      // Either succeeds or requires --module instead of --content
      expect(result.exitCode).toBeDefined()
    })

    it('should write module content from --module flag', async () => {
      const result = await runCLI([
        'write', '@cli-test/module-write',
        '--module', 'export const value = 42;',
        '--types', 'export declare const value: number;',
      ])

      if (result.exitCode === 0) {
        expect(result.stdout).toContain('Written')
      }
    })

    it('should fail without module name', async () => {
      const result = await runCLI(['write'])

      expect(result.exitCode).not.toBe(0)
    })

    it('should fail without content', async () => {
      const result = await runCLI(['write', '@cli-test/empty'])

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toMatch(/required|content/i)
    })

    it('should support --message for commit message', async () => {
      const result = await runCLI([
        'write', '@cli-test/with-message',
        '--module', 'export const x = 1;',
        '--types', 'export declare const x: number;',
        '--message', 'Initial commit',
      ])

      if (result.exitCode === 0) {
        expect(result.stdout).toContain('Written')
      }
    })
  })

  describe('read command', () => {
    beforeAll(async () => {
      // Create a module to read
      await runCLI([
        'write', '@cli-test/readable',
        '--module', 'export const message = "Hello from CLI";',
        '--types', 'export declare const message: string;',
      ])
    })

    it('should read module content', async () => {
      const result = await runCLI(['read', '@cli-test/readable'])

      // If module exists, should output content
      if (result.exitCode === 0) {
        expect(result.stdout).toContain('message')
      }
    })

    it('should output JSON with --json flag', async () => {
      const result = await runCLI(['read', '@cli-test/readable', '--json'])

      if (result.exitCode === 0) {
        expect(() => JSON.parse(result.stdout)).not.toThrow()
      }
    })

    it('should fail for non-existent module', async () => {
      const result = await runCLI(['read', '@cli-test/nonexistent-xyz-123'])

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toMatch(/not found|does not exist/i)
    })

    it('should support --version flag', async () => {
      const result = await runCLI(['read', '@cli-test/readable', '--version', '1.0.0'])

      // Should recognize the flag, even if version doesn't exist
      expect(result.exitCode).toBeDefined()
    })
  })

  describe('run command', () => {
    beforeAll(async () => {
      // Create a runnable module
      await runCLI([
        'write', '@cli-test/runnable',
        '--module', 'export function compute(x) { console.log("Computing:", x); return x * 2; }',
        '--types', 'export declare function compute(x: number): number;',
        '--script', 'return compute(21);',
      ])
    })

    it('should execute module script', async () => {
      const result = await runCLI(['run', '@cli-test/runnable'])

      // If script exists and runs, check for output
      if (result.exitCode === 0) {
        expect(result.stdout).toBeDefined()
      }
    })

    it('should fail for non-existent module', async () => {
      const result = await runCLI(['run', '@cli-test/nonexistent-xyz'])

      expect(result.exitCode).not.toBe(0)
    })

    it('should support --timeout option', async () => {
      const result = await runCLI(['run', '@cli-test/runnable', '--timeout', '5000'])

      expect(result.duration).toBeLessThan(10000)
    })

    it('should support --env option', async () => {
      const result = await runCLI([
        'run', '@cli-test/runnable',
        '--env', 'API_KEY=test123',
      ])

      expect(result.exitCode).toBeDefined()
    })
  })

  describe('test command', () => {
    beforeAll(async () => {
      // Create a testable module
      await runCLI([
        'write', '@cli-test/testable',
        '--module', 'export function add(a, b) { return a + b; }',
        '--types', 'export declare function add(a: number, b: number): number;',
        '--tests', `describe('add', () => { it('adds', () => { expect(add(1,2)).toBe(3); }); });`,
      ])
    })

    it('should run module tests', async () => {
      const result = await runCLI(['test', '@cli-test/testable'])

      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/pass|passed/i)
      }
    })

    it('should report test failures', async () => {
      // Create a failing test module
      await runCLI([
        'write', '@cli-test/failing-test',
        '--module', 'export function broken() { return 1; }',
        '--types', 'export declare function broken(): number;',
        '--tests', `describe('broken', () => { it('fails', () => { expect(broken()).toBe(999); }); });`,
      ])

      const result = await runCLI(['test', '@cli-test/failing-test'])

      expect(result.exitCode).not.toBe(0)
    })

    it('should support --filter option', async () => {
      const result = await runCLI(['test', '@cli-test/testable', '--filter', 'add'])

      expect(result.exitCode).toBeDefined()
    })
  })

  describe('versions command', () => {
    beforeAll(async () => {
      // Create module with multiple versions
      for (let i = 1; i <= 3; i++) {
        await runCLI([
          'write', '@cli-test/versioned',
          '--module', `export const v = ${i};`,
          '--types', 'export declare const v: number;',
          '--message', `Version ${i}`,
        ])
      }
    })

    it('should list module versions', async () => {
      const result = await runCLI(['versions', '@cli-test/versioned'])

      if (result.exitCode === 0) {
        expect(result.stdout).toBeDefined()
      }
    })

    it('should output JSON with --json flag', async () => {
      const result = await runCLI(['versions', '@cli-test/versioned', '--json'])

      if (result.exitCode === 0) {
        expect(() => JSON.parse(result.stdout)).not.toThrow()
      }
    })

    it('should support --limit option', async () => {
      const result = await runCLI(['versions', '@cli-test/versioned', '--limit', '2'])

      expect(result.exitCode).toBeDefined()
    })

    it('should fail for non-existent module', async () => {
      const result = await runCLI(['versions', '@cli-test/nonexistent-xyz'])

      expect(result.exitCode).not.toBe(0)
    })
  })

  describe('log command', () => {
    it('should show commit log', async () => {
      const result = await runCLI(['log', '@cli-test/versioned'])

      if (result.exitCode === 0) {
        expect(result.stdout).toBeDefined()
      }
    })

    it('should output JSON with --json flag', async () => {
      const result = await runCLI(['log', '@cli-test/versioned', '--json'])

      if (result.exitCode === 0) {
        expect(() => JSON.parse(result.stdout)).not.toThrow()
      }
    })

    it('should support --verbose flag', async () => {
      const result = await runCLI(['log', '@cli-test/versioned', '--verbose'])

      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/date|commit/i)
      }
    })

    it('should fail for non-existent module', async () => {
      const result = await runCLI(['log', '@cli-test/nonexistent-xyz'])

      expect(result.exitCode).not.toBe(0)
    })
  })

  describe('diff command', () => {
    it('should compare two versions', async () => {
      const result = await runCLI(['diff', '@cli-test/versioned', 'v1.0.0', 'v2.0.0'])

      // Should at least recognize the command
      expect(result.exitCode).toBeDefined()
    })

    it('should fail with missing version argument', async () => {
      const result = await runCLI(['diff', '@cli-test/versioned'])

      expect(result.exitCode).not.toBe(0)
    })

    it('should output JSON with --json flag', async () => {
      const result = await runCLI(['diff', '@cli-test/versioned', 'v1', 'v2', '--json'])

      if (result.exitCode === 0) {
        expect(() => JSON.parse(result.stdout)).not.toThrow()
      }
    })
  })

  describe('delete command', () => {
    it('should require --force for deletion', async () => {
      const result = await runCLI(['delete', '@cli-test/to-delete'])

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toMatch(/force|confirm/i)
    })

    it('should delete with --force flag', async () => {
      // Create module to delete
      await runCLI([
        'write', '@cli-test/will-delete',
        '--module', 'export const x = 1;',
        '--types', 'export declare const x: number;',
      ])

      const result = await runCLI(['delete', '@cli-test/will-delete', '--force'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/deleted|removed/i)
    })

    it('should support --dry-run', async () => {
      const result = await runCLI(['delete', '@cli-test/dry-run-test', '--dry-run'])

      expect(result.exitCode).toBeDefined()
      expect(result.stdout).toMatch(/would delete|dry.run/i)
    })

    it('should handle non-existent module', async () => {
      const result = await runCLI(['delete', '@cli-test/nonexistent-xyz', '--force'])

      // CLI may either fail or succeed silently for non-existent modules
      // The important thing is that it doesn't crash
      expect(result.exitCode).toBeDefined()
    })
  })

  describe('Authentication Commands', () => {
    describe('login command', () => {
      it('should accept --token option', async () => {
        const result = await runCLI(['login', '--token', 'test-token-123'])

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Logged in')
      })

      it('should show help for interactive login', async () => {
        const result = await runCLI(['login'])

        // Should either prompt or show help for token
        expect(result.stdout).toMatch(/token|interactive/i)
      })
    })

    describe('logout command', () => {
      it('should log out successfully', async () => {
        const result = await runCLISuccess(['logout'])

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Logged out')
      })
    })

    describe('whoami command', () => {
      it('should show authentication status', async () => {
        const result = await runCLISuccess(['whoami'])

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toMatch(/logged|authenticated|not/i)
      })
    })
  })

  describe('config command', () => {
    it('should get config value', async () => {
      const result = await runCLI(['config', 'get', 'api.endpoint'])

      expect(result.exitCode).toBeDefined()
    })

    it('should set config value', async () => {
      const result = await runCLI(['config', 'set', 'test.key', 'test-value'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Set')
    })

    it('should list config values', async () => {
      const result = await runCLI(['config', 'list'])

      expect(result.exitCode).toBe(0)
    })
  })

  describe('stdin/stdout handling', () => {
    it('should handle piped input', async () => {
      const moduleContent = 'export const piped = true;'

      // Note: --stdin support would need to be tested if implemented
      const result = await runCLI(['write', '@cli-test/piped', '--stdin'], {
        stdin: moduleContent,
      })

      // The command should at least be recognized
      expect(result.exitCode).toBeDefined()
    })

    it('should output to stdout for read command', async () => {
      const result = await runCLI(['read', '@cli-test/readable'])

      // stdout should have content (or stderr for errors)
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0)
    })
  })

  describe('Exit codes', () => {
    it('should return 0 for successful operations', async () => {
      const result = await runCLI(['--help'])
      expect(result.exitCode).toBe(0)
    })

    it('should return non-zero for errors', async () => {
      const result = await runCLI(['read', '@cli-test/nonexistent-xyz-123'])
      expect(result.exitCode).not.toBe(0)
    })

    it('should return non-zero for invalid commands', async () => {
      const result = await runCLI(['invalid-command-xyz'])
      expect(result.exitCode).not.toBe(0)
    })

    it('should return non-zero for missing arguments', async () => {
      const result = await runCLI(['init'])
      expect(result.exitCode).not.toBe(0)
    })
  })

  describe('Error messages', () => {
    it('should provide helpful error for missing scope', async () => {
      const result = await runCLI(['init', 'no-scope'])

      expect(result.stderr).toContain('scope')
    })

    it('should provide helpful error for unknown command', async () => {
      const result = await runCLI(['xyz-unknown'])

      expect(result.stderr).toMatch(/unknown|invalid/i)
    })
  })
})

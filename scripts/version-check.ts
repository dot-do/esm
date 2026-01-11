#!/usr/bin/env tsx
/**
 * Version Check Script for esm.do
 *
 * Pre-commit hook to ensure version consistency across packages.
 *
 * Checks:
 * 1. Version format follows semver
 * 2. Version consistency between package.json files in workspace
 * 3. No version conflicts with dependencies
 * 4. Changelog entry exists for current version (optional)
 *
 * Usage:
 *   npm run version:check           # Run all checks
 *   npm run version:check -- --fix  # Attempt to fix issues
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')

interface PackageJson {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

interface CheckResult {
  name: string
  passed: boolean
  message: string
  fixable?: boolean
  fix?: () => void
}

interface Options {
  fix: boolean
  verbose: boolean
}

function parseArgs(): Options {
  const args = process.argv.slice(2)
  return {
    fix: args.includes('--fix'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  }
}

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function writePackageJson(path: string, pkg: PackageJson): void {
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
}

function findPackageJsonFiles(): string[] {
  const files: string[] = []

  // Root package.json
  const rootPkg = join(ROOT_DIR, 'package.json')
  if (existsSync(rootPkg)) {
    files.push(rootPkg)
  }

  // Check for workspace packages
  const workspaceDirs = ['core', 'packages']
  for (const dir of workspaceDirs) {
    const dirPath = join(ROOT_DIR, dir)
    if (existsSync(dirPath)) {
      const pkgPath = join(dirPath, 'package.json')
      if (existsSync(pkgPath)) {
        files.push(pkgPath)
      }

      // Check subdirectories
      try {
        const entries = readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPkgPath = join(dirPath, entry.name, 'package.json')
            if (existsSync(subPkgPath)) {
              files.push(subPkgPath)
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return files
}

function isValidSemver(version: string): boolean {
  // Semver regex (simplified)
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
  return semverRegex.test(version)
}

function checkSemverFormat(pkgPath: string): CheckResult {
  const pkg = readPackageJson(pkgPath)
  const passed = isValidSemver(pkg.version)

  return {
    name: `Semver format (${pkg.name})`,
    passed,
    message: passed
      ? `Version ${pkg.version} is valid semver`
      : `Version "${pkg.version}" is not valid semver`,
  }
}

function checkVersionConsistency(pkgFiles: string[]): CheckResult[] {
  const results: CheckResult[] = []
  const versions = new Map<string, { version: string; path: string }[]>()

  // Group packages by name
  for (const pkgPath of pkgFiles) {
    const pkg = readPackageJson(pkgPath)
    const existing = versions.get(pkg.name) || []
    existing.push({ version: pkg.version, path: pkgPath })
    versions.set(pkg.name, existing)
  }

  // Check for version conflicts
  for (const [name, entries] of versions) {
    if (entries.length > 1) {
      const uniqueVersions = [...new Set(entries.map((e) => e.version))]
      if (uniqueVersions.length > 1) {
        results.push({
          name: `Version consistency (${name})`,
          passed: false,
          message: `Multiple versions found: ${uniqueVersions.join(', ')}`,
          fixable: true,
          fix: () => {
            // Use the highest version
            const sorted = uniqueVersions.sort((a, b) => {
              const [aMajor, aMinor, aPatch] = a.split('.').map(Number)
              const [bMajor, bMinor, bPatch] = b.split('.').map(Number)
              if (aMajor !== bMajor) return bMajor - aMajor
              if (aMinor !== bMinor) return bMinor - aMinor
              return bPatch - aPatch
            })
            const highestVersion = sorted[0]

            for (const entry of entries) {
              const pkg = readPackageJson(entry.path)
              pkg.version = highestVersion
              writePackageJson(entry.path, pkg)
            }
          },
        })
      } else {
        results.push({
          name: `Version consistency (${name})`,
          passed: true,
          message: `All instances have version ${uniqueVersions[0]}`,
        })
      }
    }
  }

  return results
}

function checkDependencyVersions(pkgPath: string): CheckResult[] {
  const results: CheckResult[] = []
  const pkg = readPackageJson(pkgPath)

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  }

  // Check for workspace protocol usage
  for (const [depName, depVersion] of Object.entries(allDeps)) {
    if (depVersion.startsWith('workspace:')) {
      // This is fine for workspace packages
      continue
    }

    // Check for pinned versions vs ranges
    if (depVersion.startsWith('^') || depVersion.startsWith('~')) {
      // Version ranges are acceptable
      continue
    }

    // Warn about pinned versions (except for very specific cases)
    if (/^\d+\.\d+\.\d+$/.test(depVersion)) {
      results.push({
        name: `Dependency version (${depName})`,
        passed: true, // Warning, not failure
        message: `Pinned to exact version ${depVersion} - consider using a range`,
      })
    }
  }

  return results
}

function checkChangelogEntry(version: string): CheckResult {
  const changelogPath = join(ROOT_DIR, 'CHANGELOG.md')

  if (!existsSync(changelogPath)) {
    return {
      name: 'Changelog entry',
      passed: true, // Not having a changelog is okay
      message: 'No CHANGELOG.md found (optional)',
    }
  }

  const changelog = readFileSync(changelogPath, 'utf-8')
  const hasEntry = changelog.includes(`[${version}]`) || changelog.includes(`## ${version}`)

  return {
    name: 'Changelog entry',
    passed: hasEntry,
    message: hasEntry
      ? `Changelog entry found for version ${version}`
      : `No changelog entry for version ${version}`,
  }
}

function checkGitStatus(): CheckResult {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim()
    const hasChanges = status.length > 0

    return {
      name: 'Git status',
      passed: true, // Info only
      message: hasChanges
        ? `${status.split('\n').length} uncommitted changes`
        : 'Working directory clean',
    }
  } catch {
    return {
      name: 'Git status',
      passed: true,
      message: 'Not a git repository',
    }
  }
}

function checkNodeVersion(): CheckResult {
  const pkg = readPackageJson(join(ROOT_DIR, 'package.json'))
  const requiredVersion = pkg.engines?.node

  if (!requiredVersion) {
    return {
      name: 'Node version',
      passed: true,
      message: 'No Node.js version requirement specified',
    }
  }

  const currentVersion = process.version
  // Simple check - just verify major version meets minimum
  const requiredMajor = parseInt(requiredVersion.replace(/[^\d]/g, '').slice(0, 2))
  const currentMajor = parseInt(currentVersion.slice(1).split('.')[0])

  const passed = currentMajor >= requiredMajor

  return {
    name: 'Node version',
    passed,
    message: passed
      ? `Node ${currentVersion} meets requirement (${requiredVersion})`
      : `Node ${currentVersion} does not meet requirement (${requiredVersion})`,
  }
}

interface PackageJsonWithEngines extends PackageJson {
  engines?: { node?: string }
}

async function main(): Promise<void> {
  console.log('========================================')
  console.log('      esm.do Version Check')
  console.log('========================================\n')

  const options = parseArgs()
  const results: CheckResult[] = []

  // Find all package.json files
  const pkgFiles = findPackageJsonFiles()
  console.log(`Found ${pkgFiles.length} package.json file(s)\n`)

  // Run checks
  console.log('Running checks...\n')

  // 1. Check semver format
  for (const pkgPath of pkgFiles) {
    results.push(checkSemverFormat(pkgPath))
  }

  // 2. Check version consistency
  results.push(...checkVersionConsistency(pkgFiles))

  // 3. Check dependency versions
  for (const pkgPath of pkgFiles) {
    results.push(...checkDependencyVersions(pkgPath))
  }

  // 4. Check changelog entry
  const rootPkg = readPackageJson(join(ROOT_DIR, 'package.json'))
  results.push(checkChangelogEntry(rootPkg.version))

  // 5. Check git status
  results.push(checkGitStatus())

  // 6. Check Node version
  results.push(checkNodeVersion())

  // Display results
  let hasFailures = false
  let hasFixable = false

  for (const result of results) {
    const icon = result.passed ? '[PASS]' : '[FAIL]'
    console.log(`${icon} ${result.name}`)
    if (options.verbose || !result.passed) {
      console.log(`       ${result.message}`)
    }
    if (!result.passed) {
      hasFailures = true
      if (result.fixable) {
        hasFixable = true
        console.log('       (fixable with --fix)')
      }
    }
  }

  console.log('\n----------------------------------------')

  // Summary
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  console.log(`Results: ${passed} passed, ${failed} failed`)

  // Apply fixes if requested
  if (options.fix && hasFixable) {
    console.log('\nApplying fixes...')
    for (const result of results) {
      if (!result.passed && result.fix) {
        console.log(`  Fixing: ${result.name}`)
        result.fix()
      }
    }
    console.log('Fixes applied. Please review changes.')
  } else if (hasFixable && !options.fix) {
    console.log('\nSome issues can be fixed automatically. Run with --fix to apply.')
  }

  // Exit with error if there are failures
  if (hasFailures) {
    process.exit(1)
  }

  console.log('\nAll checks passed!')
}

main().catch((error) => {
  console.error('Version check failed:', error)
  process.exit(1)
})

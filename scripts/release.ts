#!/usr/bin/env tsx
/**
 * Release Script for esm.do
 *
 * This script handles the complete release process:
 * 1. Bumps version based on changesets
 * 2. Generates/updates CHANGELOG.md
 * 3. Creates git tag
 * 4. Publishes to npm
 * 5. Creates GitHub release
 *
 * Usage:
 *   npm run release           # Full release
 *   npm run release -- --dry  # Dry run (no publish)
 *   npm run release -- --skip-npm  # Skip npm publish
 *   npm run release -- --skip-github  # Skip GitHub release
 */

import { execSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')

interface PackageJson {
  name: string
  version: string
  repository?: {
    url?: string
  }
}

interface ReleaseOptions {
  dryRun: boolean
  skipNpm: boolean
  skipGitHub: boolean
  skipGit: boolean
}

function parseArgs(): ReleaseOptions {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry') || args.includes('--dry-run'),
    skipNpm: args.includes('--skip-npm'),
    skipGitHub: args.includes('--skip-github'),
    skipGit: args.includes('--skip-git'),
  }
}

function exec(cmd: string, options: { cwd?: string; silent?: boolean } = {}): string {
  const { cwd = ROOT_DIR, silent = false } = options
  if (!silent) {
    console.log(`$ ${cmd}`)
  }
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' }) || ''
  } catch (error) {
    if (!silent) {
      console.error(`Command failed: ${cmd}`)
    }
    throw error
  }
}

function execCapture(cmd: string, cwd = ROOT_DIR): string {
  return execSync(cmd, { cwd, encoding: 'utf-8' }).trim()
}

function readPackageJson(): PackageJson {
  const pkgPath = join(ROOT_DIR, 'package.json')
  return JSON.parse(readFileSync(pkgPath, 'utf-8'))
}

function writePackageJson(pkg: PackageJson): void {
  const pkgPath = join(ROOT_DIR, 'package.json')
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

function getGitHubRepo(): string {
  const pkg = readPackageJson()
  if (pkg.repository?.url) {
    const match = pkg.repository.url.match(/github\.com[:/](.+?)(?:\.git)?$/)
    if (match) return match[1]
  }
  // Try to get from git remote
  try {
    const remote = execCapture('git remote get-url origin')
    const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)
    if (match) return match[1]
  } catch {
    // ignore
  }
  return 'dot-do/esm'
}

function hasUncommittedChanges(): boolean {
  try {
    const status = execCapture('git status --porcelain')
    return status.length > 0
  } catch {
    return false
  }
}

function getCurrentBranch(): string {
  return execCapture('git branch --show-current')
}

function hasChangesets(): boolean {
  const changesetDir = join(ROOT_DIR, '.changeset')
  if (!existsSync(changesetDir)) return false

  try {
    const files = execCapture(`ls -1 "${changesetDir}"`)
    // Check for .md files that aren't README.md
    const changesetFiles = files.split('\n').filter(f => f.endsWith('.md') && f !== 'README.md')
    return changesetFiles.length > 0
  } catch {
    return false
  }
}

async function consumeChangesets(): Promise<string | null> {
  if (!hasChangesets()) {
    console.log('No changesets found. Skipping version bump.')
    return null
  }

  console.log('\n--- Consuming changesets ---')
  try {
    exec('npx changeset version')
    const pkg = readPackageJson()
    return pkg.version
  } catch (error) {
    console.error('Failed to consume changesets:', error)
    return null
  }
}

async function generateChangelog(version: string): Promise<string> {
  console.log('\n--- Generating changelog ---')

  const changelogPath = join(ROOT_DIR, 'CHANGELOG.md')
  let existingChangelog = ''

  if (existsSync(changelogPath)) {
    existingChangelog = readFileSync(changelogPath, 'utf-8')
  }

  // Get commits since last tag
  let commits: string[] = []
  try {
    const lastTag = execCapture('git describe --tags --abbrev=0 2>/dev/null || echo ""')
    if (lastTag) {
      commits = execCapture(`git log ${lastTag}..HEAD --oneline`).split('\n').filter(Boolean)
    } else {
      // No tags, get all commits
      commits = execCapture('git log --oneline -50').split('\n').filter(Boolean)
    }
  } catch {
    commits = []
  }

  // Parse conventional commits
  const grouped: Record<string, string[]> = {
    feat: [],
    fix: [],
    docs: [],
    style: [],
    refactor: [],
    perf: [],
    test: [],
    build: [],
    ci: [],
    chore: [],
    other: [],
  }

  for (const commit of commits) {
    const match = commit.match(/^([a-f0-9]+)\s+(\w+)(?:\(.+?\))?:\s*(.+)$/)
    if (match) {
      const [, hash, type, message] = match
      const category = grouped[type] ? type : 'other'
      grouped[category].push(`- ${message} (${hash})`)
    } else {
      const [hash, ...rest] = commit.split(' ')
      grouped.other.push(`- ${rest.join(' ')} (${hash})`)
    }
  }

  // Build changelog entry
  const date = new Date().toISOString().split('T')[0]
  let entry = `## [${version}] - ${date}\n\n`

  const typeLabels: Record<string, string> = {
    feat: 'Features',
    fix: 'Bug Fixes',
    docs: 'Documentation',
    style: 'Styles',
    refactor: 'Refactoring',
    perf: 'Performance',
    test: 'Tests',
    build: 'Build System',
    ci: 'CI/CD',
    chore: 'Chores',
    other: 'Other Changes',
  }

  for (const [type, label] of Object.entries(typeLabels)) {
    if (grouped[type].length > 0) {
      entry += `### ${label}\n\n`
      entry += grouped[type].join('\n') + '\n\n'
    }
  }

  // Prepend to existing changelog
  let newChangelog: string
  if (existingChangelog.startsWith('# Changelog')) {
    // Insert after header
    const headerEnd = existingChangelog.indexOf('\n\n') + 2
    newChangelog =
      existingChangelog.slice(0, headerEnd) + '\n' + entry + existingChangelog.slice(headerEnd)
  } else {
    newChangelog = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${entry}${existingChangelog}`
  }

  writeFileSync(changelogPath, newChangelog)
  console.log(`Updated CHANGELOG.md for version ${version}`)

  return entry
}

async function createGitTag(version: string, options: ReleaseOptions): Promise<void> {
  if (options.skipGit) {
    console.log('Skipping git operations (--skip-git)')
    return
  }

  console.log('\n--- Creating git tag ---')

  const tag = `v${version}`

  if (options.dryRun) {
    console.log(`[DRY RUN] Would create tag: ${tag}`)
    return
  }

  // Stage changes
  exec('git add -A')

  // Commit if there are changes
  if (hasUncommittedChanges()) {
    exec(`git commit -m "chore(release): ${version}"`)
  }

  // Create tag
  exec(`git tag -a ${tag} -m "Release ${version}"`)
  console.log(`Created tag: ${tag}`)

  // Push
  exec('git push --follow-tags')
  console.log('Pushed to remote with tags')
}

async function publishToNpm(options: ReleaseOptions): Promise<void> {
  if (options.skipNpm) {
    console.log('Skipping npm publish (--skip-npm)')
    return
  }

  console.log('\n--- Publishing to npm ---')

  if (options.dryRun) {
    console.log('[DRY RUN] Would publish to npm')
    exec('npm publish --dry-run')
    return
  }

  // Build first
  exec('npm run build')

  // Publish
  exec('npm publish --access public')
  console.log('Published to npm')
}

async function createGitHubRelease(
  version: string,
  changelog: string,
  options: ReleaseOptions
): Promise<void> {
  if (options.skipGitHub) {
    console.log('Skipping GitHub release (--skip-github)')
    return
  }

  console.log('\n--- Creating GitHub release ---')

  const tag = `v${version}`
  const repo = getGitHubRepo()

  if (options.dryRun) {
    console.log(`[DRY RUN] Would create GitHub release for ${tag}`)
    console.log(`Repository: ${repo}`)
    console.log('Release notes:')
    console.log(changelog)
    return
  }

  // Check if gh CLI is available
  try {
    execCapture('which gh')
  } catch {
    console.log('GitHub CLI (gh) not found. Skipping GitHub release.')
    console.log('Install it from https://cli.github.com/')
    return
  }

  // Create release using gh CLI
  const releaseNotesFile = join(ROOT_DIR, '.release-notes-temp.md')
  writeFileSync(releaseNotesFile, changelog)

  try {
    exec(`gh release create ${tag} --title "Release ${version}" --notes-file "${releaseNotesFile}"`)
    console.log(`Created GitHub release: ${tag}`)
  } finally {
    // Clean up temp file
    try {
      execSync(`rm "${releaseNotesFile}"`, { stdio: 'ignore' })
    } catch {
      // ignore
    }
  }
}

async function main(): Promise<void> {
  console.log('========================================')
  console.log('        esm.do Release Script')
  console.log('========================================\n')

  const options = parseArgs()

  if (options.dryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***\n')
  }

  // Pre-flight checks
  const branch = getCurrentBranch()
  if (branch !== 'main' && !options.dryRun) {
    console.error(`Error: Releases should be made from 'main' branch (currently on '${branch}')`)
    console.log("Use --dry-run to test on other branches")
    process.exit(1)
  }

  if (hasUncommittedChanges() && !options.skipGit) {
    console.error('Error: Working directory has uncommitted changes')
    console.log('Please commit or stash your changes before releasing')
    process.exit(1)
  }

  // Get current version
  const pkg = readPackageJson()
  console.log(`Current version: ${pkg.version}`)

  // Step 1: Consume changesets and bump version
  let newVersion = await consumeChangesets()

  if (!newVersion) {
    // No changesets, use current version or prompt for manual bump
    console.log('\nNo changesets found. Using current version for release.')
    newVersion = pkg.version
  }

  console.log(`\nReleasing version: ${newVersion}`)

  // Step 2: Generate changelog
  const changelog = await generateChangelog(newVersion)

  // Step 3: Create git tag
  await createGitTag(newVersion, options)

  // Step 4: Publish to npm
  await publishToNpm(options)

  // Step 5: Create GitHub release
  await createGitHubRelease(newVersion, changelog, options)

  console.log('\n========================================')
  console.log(`Release ${newVersion} completed!`)
  console.log('========================================')
}

main().catch((error) => {
  console.error('Release failed:', error)
  process.exit(1)
})

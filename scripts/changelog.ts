#!/usr/bin/env tsx
/**
 * Changelog Generator for esm.do
 *
 * Parses conventional commits and generates markdown changelog.
 *
 * Usage:
 *   npm run changelog                    # Generate full changelog
 *   npm run changelog -- --since v0.0.1  # Since specific tag
 *   npm run changelog -- --unreleased    # Only unreleased changes
 *   npm run changelog -- --output FILE   # Write to specific file
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')

interface Commit {
  hash: string
  shortHash: string
  type: string
  scope: string | null
  subject: string
  body: string
  breaking: boolean
  date: string
  author: string
}

interface ChangelogOptions {
  since: string | null
  unreleased: boolean
  output: string
  dryRun: boolean
}

const COMMIT_TYPES: Record<string, { title: string; emoji: string; order: number }> = {
  feat: { title: 'Features', emoji: '', order: 0 },
  fix: { title: 'Bug Fixes', emoji: '', order: 1 },
  perf: { title: 'Performance Improvements', emoji: '', order: 2 },
  refactor: { title: 'Code Refactoring', emoji: '', order: 3 },
  docs: { title: 'Documentation', emoji: '', order: 4 },
  style: { title: 'Styles', emoji: '', order: 5 },
  test: { title: 'Tests', emoji: '', order: 6 },
  build: { title: 'Build System', emoji: '', order: 7 },
  ci: { title: 'Continuous Integration', emoji: '', order: 8 },
  chore: { title: 'Chores', emoji: '', order: 9 },
  revert: { title: 'Reverts', emoji: '', order: 10 },
}

function parseArgs(): ChangelogOptions {
  const args = process.argv.slice(2)
  const options: ChangelogOptions = {
    since: null,
    unreleased: false,
    output: join(ROOT_DIR, 'CHANGELOG.md'),
    dryRun: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--since':
        options.since = args[++i]
        break
      case '--unreleased':
        options.unreleased = true
        break
      case '--output':
      case '-o':
        options.output = args[++i]
        break
      case '--dry-run':
      case '--dry':
        options.dryRun = true
        break
    }
  }

  return options
}

function execCapture(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

function getAllTags(): string[] {
  const output = execCapture('git tag --sort=-version:refname')
  return output ? output.split('\n').filter(Boolean) : []
}

function getLatestTag(): string | null {
  try {
    return execCapture('git describe --tags --abbrev=0')
  } catch {
    return null
  }
}

function getCommits(since?: string | null): Commit[] {
  // Custom format for parsing
  const format = '%H|%h|%s|%b|%ad|%an'
  const dateFormat = '--date=short'

  let range = ''
  if (since) {
    range = `${since}..HEAD`
  }

  const cmd = `git log ${range} --format="${format}" ${dateFormat}`
  const output = execCapture(cmd)

  if (!output) return []

  const commits: Commit[] = []
  const entries = output.split('\n')

  for (const entry of entries) {
    if (!entry.trim()) continue

    const parts = entry.split('|')
    if (parts.length < 5) continue

    const [hash, shortHash, subject, body, date, author] = parts

    // Parse conventional commit format
    const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/)

    if (conventionalMatch) {
      const [, type, scope, breaking, message] = conventionalMatch
      commits.push({
        hash,
        shortHash,
        type: type.toLowerCase(),
        scope: scope || null,
        subject: message,
        body: body || '',
        breaking: !!breaking || body.includes('BREAKING CHANGE'),
        date,
        author,
      })
    } else {
      // Non-conventional commit
      commits.push({
        hash,
        shortHash,
        type: 'other',
        scope: null,
        subject,
        body: body || '',
        breaking: false,
        date,
        author,
      })
    }
  }

  return commits
}

function groupCommitsByType(commits: Commit[]): Map<string, Commit[]> {
  const grouped = new Map<string, Commit[]>()

  // Initialize with known types in order
  const sortedTypes = Object.entries(COMMIT_TYPES)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([type]) => type)

  for (const type of sortedTypes) {
    grouped.set(type, [])
  }
  grouped.set('other', [])

  for (const commit of commits) {
    const type = COMMIT_TYPES[commit.type] ? commit.type : 'other'
    const list = grouped.get(type) || []
    list.push(commit)
    grouped.set(type, list)
  }

  return grouped
}

function formatCommit(commit: Commit): string {
  let line = `- ${commit.subject}`

  if (commit.scope) {
    line = `- **${commit.scope}:** ${commit.subject}`
  }

  line += ` ([${commit.shortHash}](https://github.com/dot-do/esm/commit/${commit.hash}))`

  if (commit.breaking) {
    line = `- **BREAKING:** ${commit.subject} ([${commit.shortHash}](https://github.com/dot-do/esm/commit/${commit.hash}))`
  }

  return line
}

function generateMarkdown(
  commits: Commit[],
  version: string | null,
  date: string | null
): string {
  const grouped = groupCommitsByType(commits)
  const lines: string[] = []

  // Version header
  if (version) {
    const dateStr = date || new Date().toISOString().split('T')[0]
    lines.push(`## [${version}] - ${dateStr}`)
  } else {
    lines.push('## [Unreleased]')
  }
  lines.push('')

  // Breaking changes section
  const breakingChanges = commits.filter((c) => c.breaking)
  if (breakingChanges.length > 0) {
    lines.push('### BREAKING CHANGES')
    lines.push('')
    for (const commit of breakingChanges) {
      lines.push(formatCommit(commit))
    }
    lines.push('')
  }

  // Grouped changes
  for (const [type, typeCommits] of grouped) {
    // Filter out breaking changes (already listed above)
    const nonBreaking = typeCommits.filter((c) => !c.breaking)
    if (nonBreaking.length === 0) continue

    const config = COMMIT_TYPES[type] || { title: 'Other Changes', emoji: '' }
    lines.push(`### ${config.title}`)
    lines.push('')

    for (const commit of nonBreaking) {
      lines.push(formatCommit(commit))
    }
    lines.push('')
  }

  return lines.join('\n')
}

function getPackageVersion(): string {
  const pkgPath = join(ROOT_DIR, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return pkg.version
}

function generateFullChangelog(): string {
  const tags = getAllTags()
  const lines: string[] = []

  lines.push('# Changelog')
  lines.push('')
  lines.push(
    'All notable changes to this project will be documented in this file.'
  )
  lines.push('')
  lines.push(
    'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),'
  )
  lines.push(
    'and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).'
  )
  lines.push('')

  // Unreleased section
  const latestTag = getLatestTag()
  const unreleasedCommits = getCommits(latestTag)
  if (unreleasedCommits.length > 0) {
    lines.push(generateMarkdown(unreleasedCommits, null, null))
  }

  // Tagged releases
  for (let i = 0; i < tags.length; i++) {
    const currentTag = tags[i]
    const previousTag = tags[i + 1] || null

    // Get version from tag
    const version = currentTag.replace(/^v/, '')

    // Get tag date
    const date = execCapture(`git log -1 --format=%ad --date=short ${currentTag}`)

    // Get commits for this release
    const range = previousTag ? `${previousTag}..${currentTag}` : currentTag
    const cmd = `git log ${range} --format="%H|%h|%s|%b|%ad|%an" --date=short`
    const output = execCapture(cmd)

    if (output) {
      const commits = getCommits(previousTag)
      // Filter to only include commits up to currentTag
      const tagHash = execCapture(`git rev-parse ${currentTag}`)
      const releaseCommits = commits.filter((c) => {
        const commitDate = execCapture(`git log -1 --format=%ad --date=short ${c.hash}`)
        const tagDate = date
        return commitDate <= tagDate
      })

      if (releaseCommits.length > 0) {
        lines.push(generateMarkdown(releaseCommits.slice(0, 50), version, date))
      }
    }
  }

  return lines.join('\n')
}

async function main(): Promise<void> {
  console.log('========================================')
  console.log('      esm.do Changelog Generator')
  console.log('========================================\n')

  const options = parseArgs()

  let markdown: string

  if (options.unreleased) {
    // Only unreleased changes
    const latestTag = getLatestTag()
    console.log(`Generating changelog for unreleased changes since ${latestTag || 'beginning'}...`)

    const commits = getCommits(latestTag)
    if (commits.length === 0) {
      console.log('No unreleased changes found.')
      return
    }

    markdown = generateMarkdown(commits, null, null)
  } else if (options.since) {
    // Changes since specific tag
    console.log(`Generating changelog since ${options.since}...`)

    const commits = getCommits(options.since)
    if (commits.length === 0) {
      console.log(`No changes found since ${options.since}.`)
      return
    }

    const version = getPackageVersion()
    markdown = generateMarkdown(commits, version, null)
  } else {
    // Full changelog
    console.log('Generating full changelog...')
    markdown = generateFullChangelog()
  }

  if (options.dryRun) {
    console.log('\n--- Generated Changelog (dry run) ---\n')
    console.log(markdown)
    return
  }

  // Write to file
  if (options.unreleased || options.since) {
    // Prepend to existing changelog
    const existingPath = options.output
    if (existsSync(existingPath)) {
      const existing = readFileSync(existingPath, 'utf-8')
      // Find where to insert (after header)
      const headerEnd = existing.indexOf('\n\n', existing.indexOf('Semantic Versioning'))
      if (headerEnd > 0) {
        markdown =
          existing.slice(0, headerEnd + 2) + markdown + '\n' + existing.slice(headerEnd + 2)
      } else {
        markdown = markdown + '\n\n' + existing
      }
    }
  }

  writeFileSync(options.output, markdown)
  console.log(`\nChangelog written to: ${options.output}`)

  // Summary
  const latestTag = getLatestTag()
  const commits = getCommits(latestTag)
  console.log(`\nSummary:`)
  console.log(`  - Total unreleased commits: ${commits.length}`)

  const grouped = groupCommitsByType(commits)
  for (const [type, typeCommits] of grouped) {
    if (typeCommits.length > 0) {
      const config = COMMIT_TYPES[type] || { title: type }
      console.log(`  - ${config.title}: ${typeCommits.length}`)
    }
  }
}

main().catch((error) => {
  console.error('Changelog generation failed:', error)
  process.exit(1)
})

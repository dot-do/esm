# Contributing to esm.do

Thank you for your interest in contributing to esm.do! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Coding Standards](#coding-standards)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm
- Git

### Setup

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/esm.git
   cd esm
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build the project:
   ```bash
   pnpm build
   ```
5. Run tests to verify setup:
   ```bash
   pnpm test
   ```

## Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring

### Creating a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### Making Changes

1. Make your changes in the feature branch
2. Write or update tests as needed
3. Ensure all tests pass: `pnpm test`
4. Check types: `pnpm typecheck`
5. Build the project: `pnpm build`

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/) for our commit messages. This enables automatic changelog generation and semantic versioning.

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                      | Version Bump |
|------------|--------------------------------------------------|--------------|
| `feat`     | A new feature                                    | Minor        |
| `fix`      | A bug fix                                        | Patch        |
| `docs`     | Documentation changes                            | -            |
| `style`    | Code style changes (formatting, semicolons)      | -            |
| `refactor` | Code changes that neither fix bugs nor add features | Patch     |
| `perf`     | Performance improvements                         | Patch        |
| `test`     | Adding or updating tests                         | -            |
| `build`    | Build system or dependencies                     | -            |
| `ci`       | CI/CD configuration                              | -            |
| `chore`    | Other changes (maintenance, tooling)             | -            |
| `revert`   | Reverting a previous commit                      | -            |

### Examples

```bash
# Feature
feat(parser): add support for ES2024 syntax

# Bug fix
fix(loader): handle circular dependencies correctly

# Breaking change
feat(api)!: change module resolution algorithm

BREAKING CHANGE: The module resolution now follows Node.js ESM semantics.

# With scope
docs(readme): update installation instructions

# Without scope
chore: update dependencies
```

### Breaking Changes

For breaking changes, either:
1. Add `!` after the type/scope: `feat(api)!: description`
2. Include `BREAKING CHANGE:` in the footer

```bash
feat(core)!: redesign module loading API

BREAKING CHANGE: The `load()` function now returns a Promise instead of
the module directly. Migrate by awaiting the result.
```

## Pull Request Process

### Before Submitting

1. **Update documentation** - If your changes affect the public API, update the README or relevant docs
2. **Add tests** - All new features should have tests; bug fixes should have regression tests
3. **Run checks locally**:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm build
   ```
4. **Create a changeset** (if applicable):
   ```bash
   pnpm changeset
   ```

### Submitting a PR

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request on GitHub

3. Fill out the PR template:
   - **Title**: Use conventional commit format (e.g., `feat(parser): add ES2024 support`)
   - **Description**: Explain what changes you made and why
   - **Testing**: Describe how to test your changes
   - **Checklist**: Ensure all items are checked

### PR Review Process

1. At least one maintainer must approve the PR
2. All CI checks must pass
3. Any requested changes must be addressed
4. Once approved, a maintainer will merge the PR

### After Merge

Your changes will be included in the next release. The changelog will be automatically updated based on your commit messages.

## Release Process

We use [Changesets](https://github.com/changesets/changesets) for version management and releases.

### Adding a Changeset

When you make changes that should be included in a release:

```bash
pnpm changeset
```

This will prompt you to:
1. Select the type of change (major, minor, patch)
2. Write a summary of your changes

### Release Steps (Maintainers)

1. **Prepare release**:
   ```bash
   pnpm changeset version
   ```

2. **Review changes**:
   - Check CHANGELOG.md updates
   - Verify version bumps

3. **Create release**:
   ```bash
   pnpm release
   ```

This will:
- Build the project
- Publish to npm
- Create a git tag
- Create a GitHub release

### Alternative: Semantic Release

For automated releases via CI, we also support [semantic-release](https://semantic-release.gitbook.io/). Configuration is in `.releaserc.json`.

## Coding Standards

### TypeScript

- Use TypeScript for all source files
- Enable strict mode
- Avoid `any` - use proper types or `unknown`
- Export types along with implementations

### Code Style

- We use ESLint for linting
- Run `pnpm lint` to check code style
- Prefer `const` over `let`
- Use template literals for string interpolation
- Use async/await over raw promises

### File Organization

```
esm/
  core/           # Core library package
    src/          # Source files
    tests/        # Tests for core
  src/            # Main package source
  scripts/        # Build and release scripts
  tests/          # Integration tests
  docs/           # Documentation
```

### Testing

- Write unit tests for new functionality
- Place tests in `tests/` directory or adjacent to source files
- Use descriptive test names: `it('should handle circular imports')`
- Test edge cases and error conditions

### Documentation

- Add JSDoc comments for public APIs
- Keep README.md up to date
- Include code examples where helpful

## Questions?

If you have questions about contributing, please:
1. Check existing issues and discussions
2. Open a new issue with the `question` label
3. Reach out on our community channels

Thank you for contributing to esm.do!

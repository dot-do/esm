# CLI Workflows

Common workflows and patterns for using the esm.do CLI effectively.

## Creating and Publishing a Module

### Step 1: Initialize the Module

```bash
esm init @myorg/string-utils
```

### Step 2: Develop Locally

Create your module files locally:

```javascript
// string-utils.js
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function reverse(str) {
  return str.split('').reverse().join('')
}

export function truncate(str, length) {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}
```

```javascript
// string-utils.test.js
describe('string-utils', () => {
  describe('capitalize', () => {
    it('capitalizes first letter', () => {
      expect(capitalize('hello')).toBe('Hello')
    })
    it('handles empty string', () => {
      expect(capitalize('')).toBe('')
    })
  })

  describe('reverse', () => {
    it('reverses string', () => {
      expect(reverse('hello')).toBe('olleh')
    })
  })

  describe('truncate', () => {
    it('truncates long strings', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })
    it('keeps short strings', () => {
      expect(truncate('hi', 5)).toBe('hi')
    })
  })
})
```

### Step 3: Write the Module

```bash
esm write @myorg/string-utils \
  --types "$(cat << 'EOF'
export declare function capitalize(str: string): string
export declare function reverse(str: string): string
export declare function truncate(str: string, length: number): string
EOF
)" \
  --module "$(cat string-utils.js)" \
  --tests "$(cat string-utils.test.js)" \
  --message "Initial implementation"
```

Or use file references:

```bash
esm write @myorg/string-utils \
  --file string-utils.js \
  --message "Initial implementation"
```

### Step 4: Verify

```bash
# Run tests
esm test @myorg/string-utils

# Read back the module
esm read @myorg/string-utils --json
```

### Step 5: Iterate

Make changes and update:

```bash
# Update with new version
esm write @myorg/string-utils \
  --file string-utils.js \
  --message "Add toLowerCase helper"

# View history
esm versions @myorg/string-utils --verbose

# Compare versions
esm diff @myorg/string-utils abc123 def456
```

## Local Development Workflow

### Project Structure

```
my-project/
  src/
    utils.js
    utils.test.js
    api.js
    api.test.js
  scripts/
    sync.sh
  package.json
```

### Sync Script

Create a script to sync local files with esm.do:

```bash
#!/bin/bash
# scripts/sync.sh

# Sync utils module
esm write @myorg/utils \
  --file src/utils.js \
  --tests "$(cat src/utils.test.js)" \
  --message "Sync from local development"

# Sync api module
esm write @myorg/api \
  --file src/api.js \
  --tests "$(cat src/api.test.js)" \
  --message "Sync from local development"

echo "Synced all modules"
```

### Watch Mode (using external tools)

```bash
# Using nodemon
nodemon --watch src -e js --exec "bash scripts/sync.sh"

# Using fswatch (macOS)
fswatch -o src/*.js | xargs -n1 -I{} bash scripts/sync.sh

# Using inotifywait (Linux)
while inotifywait -e modify src/*.js; do
  bash scripts/sync.sh
done
```

### Pull Changes

Sync remote modules to local:

```bash
#!/bin/bash
# scripts/pull.sh

esm read @myorg/utils --output src/utils.js
esm read @myorg/api --output src/api.js

echo "Pulled all modules"
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test ESM Modules

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  ESM_TOKEN: ${{ secrets.ESM_TOKEN }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Test modules
        run: |
          npx esm.do test @myorg/utils
          npx esm.do test @myorg/api
          npx esm.do test @myorg/core

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Deploy modules
        run: |
          npx esm.do write @myorg/utils --file src/utils.js
          npx esm.do write @myorg/api --file src/api.js
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - test
  - deploy

variables:
  ESM_TOKEN: $ESM_TOKEN

test:
  stage: test
  image: node:20
  script:
    - npx esm.do test @myorg/utils
    - npx esm.do test @myorg/api

deploy:
  stage: deploy
  image: node:20
  script:
    - npx esm.do write @myorg/utils --file src/utils.js
    - npx esm.do write @myorg/api --file src/api.js
  only:
    - main
```

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Test ESM modules
          command: |
            npx esm.do test @myorg/utils
            npx esm.do test @myorg/api

  deploy:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Deploy ESM modules
          command: |
            npx esm.do write @myorg/utils --file src/utils.js
            npx esm.do write @myorg/api --file src/api.js

workflows:
  test-and-deploy:
    jobs:
      - test
      - deploy:
          requires:
            - test
          filters:
            branches:
              only: main
```

## Deployment Workflows

### Staging to Production

```bash
#!/bin/bash
# scripts/promote.sh

MODULE=$1
VERSION=$2

if [ -z "$MODULE" ] || [ -z "$VERSION" ]; then
  echo "Usage: ./promote.sh @scope/module version"
  exit 1
fi

# Read the specific version
esm read "$MODULE" --version "$VERSION" --json > /tmp/module.json

# Extract and write to production
TYPES=$(jq -r '.types' /tmp/module.json)
MODULE_CODE=$(jq -r '.module' /tmp/module.json)
TESTS=$(jq -r '.tests' /tmp/module.json)
SCRIPT=$(jq -r '.script' /tmp/module.json)

ESM_API_ENDPOINT=https://prod.esm.do esm write "$MODULE" \
  --types "$TYPES" \
  --module "$MODULE_CODE" \
  --tests "$TESTS" \
  --script "$SCRIPT" \
  --message "Promoted from staging: $VERSION"

echo "Promoted $MODULE@$VERSION to production"
```

### Rollback

```bash
#!/bin/bash
# scripts/rollback.sh

MODULE=$1
VERSION=$2

if [ -z "$MODULE" ] || [ -z "$VERSION" ]; then
  echo "Usage: ./rollback.sh @scope/module version"
  exit 1
fi

# Read the previous version
esm read "$MODULE" --version "$VERSION" --json > /tmp/module.json

# Write it as the current version
TYPES=$(jq -r '.types' /tmp/module.json)
MODULE_CODE=$(jq -r '.module' /tmp/module.json)
TESTS=$(jq -r '.tests' /tmp/module.json)
SCRIPT=$(jq -r '.script' /tmp/module.json)

esm write "$MODULE" \
  --types "$TYPES" \
  --module "$MODULE_CODE" \
  --tests "$TESTS" \
  --script "$SCRIPT" \
  --message "Rollback to $VERSION"

echo "Rolled back $MODULE to $VERSION"
```

### Blue-Green Deployment

```bash
#!/bin/bash
# scripts/blue-green.sh

MODULE=$1
NEW_CODE=$2

# Write to "-next" module for testing
esm write "${MODULE}-next" --file "$NEW_CODE"

# Run tests on the next version
if esm test "${MODULE}-next"; then
  # Tests passed, promote to main
  esm read "${MODULE}-next" --json > /tmp/next.json

  TYPES=$(jq -r '.types' /tmp/next.json)
  MODULE_CODE=$(jq -r '.module' /tmp/next.json)
  TESTS=$(jq -r '.tests' /tmp/next.json)
  SCRIPT=$(jq -r '.script' /tmp/next.json)

  esm write "$MODULE" \
    --types "$TYPES" \
    --module "$MODULE_CODE" \
    --tests "$TESTS" \
    --script "$SCRIPT" \
    --message "Blue-green deployment"

  echo "Deployed to $MODULE"
else
  echo "Tests failed on ${MODULE}-next, aborting deployment"
  exit 1
fi
```

## Module Organization

### Monorepo Pattern

```
@myorg/
  core/           # Core utilities
  api/            # API client
  ui/             # UI components
  utils/
    string/       # String utilities
    array/        # Array utilities
    date/         # Date utilities
```

```bash
# Initialize all modules
esm init @myorg/core
esm init @myorg/api
esm init @myorg/ui
esm init @myorg/utils/string
esm init @myorg/utils/array
esm init @myorg/utils/date
```

### Dependency Management

Modules can import from each other:

```javascript
// @myorg/api/index.mjs
import { stringify } from 'esm.do/@myorg/utils/string'

export async function fetchData(url) {
  const response = await fetch(url)
  return response.json()
}
```

### Batch Operations

```bash
#!/bin/bash
# scripts/test-all.sh

MODULES=(
  "@myorg/core"
  "@myorg/api"
  "@myorg/ui"
  "@myorg/utils/string"
  "@myorg/utils/array"
  "@myorg/utils/date"
)

FAILED=0

for module in "${MODULES[@]}"; do
  echo "Testing $module..."
  if ! esm test "$module"; then
    FAILED=$((FAILED + 1))
  fi
done

if [ $FAILED -gt 0 ]; then
  echo "$FAILED module(s) failed tests"
  exit 1
fi

echo "All modules passed tests"
```

## Automation Scripts

### Module Stats

```bash
#!/bin/bash
# scripts/stats.sh

MODULE=$1

echo "Module: $MODULE"
echo "---"

# Get version count
VERSIONS=$(esm versions "$MODULE" --limit 100 --json | jq length)
echo "Total versions: $VERSIONS"

# Get latest version
LATEST=$(esm versions "$MODULE" --limit 1 --json | jq -r '.[0].version')
echo "Latest version: $LATEST"

# Run tests and show results
esm test "$MODULE"
```

### Backup Modules

```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

MODULES=(
  "@myorg/core"
  "@myorg/api"
  "@myorg/utils"
)

for module in "${MODULES[@]}"; do
  FILENAME=$(echo "$module" | tr '/' '_')
  esm read "$module" --json > "$BACKUP_DIR/$FILENAME.json"
  echo "Backed up $module"
done

echo "Backup complete: $BACKUP_DIR"
```

### Import from npm

```bash
#!/bin/bash
# scripts/import-npm.sh

NPM_PACKAGE=$1
ESM_MODULE=$2

# Download and extract the package
npm pack "$NPM_PACKAGE"
tar -xzf *.tgz

# Find the main file
MAIN=$(jq -r '.main // "index.js"' package/package.json)

# Write to esm.do
esm write "$ESM_MODULE" \
  --file "package/$MAIN" \
  --message "Imported from npm: $NPM_PACKAGE"

# Cleanup
rm -rf package *.tgz

echo "Imported $NPM_PACKAGE as $ESM_MODULE"
```

#!/bin/bash
# Test the full stack using npm pack (no publishing required)
# This is the most accurate pre-publish test

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paths - adjust these if needed
AI_EVALUATE_PATH="/Users/nathanclevenger/projects/primitives.org.ai/packages/ai-evaluate"
CLI_DO_PATH="/Users/nathanclevenger/projects/cli.do"
ESM_PATH="/Users/nathanclevenger/projects/esm"
ESM_CORE_PATH="/Users/nathanclevenger/projects/esm/core"

TEST_DIR=$(mktemp -d)

cleanup() {
  echo ""
  echo "Cleaning up..."
  rm -rf "$TEST_DIR"
  rm -f "$AI_EVALUATE_PATH"/*.tgz
  rm -f "$CLI_DO_PATH"/*.tgz
  rm -f "$ESM_CORE_PATH"/*.tgz
  rm -f "$ESM_PATH"/*.tgz
}
trap cleanup EXIT

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Full Stack Test (npm pack simulation)       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Build all packages
echo -e "${YELLOW}1. Building all packages...${NC}"

echo "  Building ai-evaluate..."
cd "$AI_EVALUATE_PATH"
# Skip workspace deps for pack test by using npm instead of pnpm
npm run build 2>/dev/null || pnpm build

echo "  Building cli.do..."
cd "$CLI_DO_PATH"
pnpm build

echo "  Building esm core..."
cd "$ESM_CORE_PATH"
npm run build 2>/dev/null || tsc -p tsconfig.json

echo "  Building esm.do..."
cd "$ESM_PATH"
pnpm build

echo -e "${GREEN}✓ All builds complete${NC}"
echo ""

# Step 2: Create tarballs
echo -e "${YELLOW}2. Creating tarballs...${NC}"

cd "$AI_EVALUATE_PATH"
AI_EVAL_TGZ=$(npm pack 2>&1 | tail -1)
echo "  Created: $AI_EVAL_TGZ"

cd "$CLI_DO_PATH"
CLI_TGZ=$(npm pack 2>&1 | tail -1)
echo "  Created: $CLI_TGZ"

cd "$ESM_CORE_PATH"
CORE_TGZ=$(npm pack 2>&1 | tail -1)
echo "  Created: $CORE_TGZ"

# For esm.do, we need to temporarily fix the workspace:* reference
cd "$ESM_PATH"
cp package.json package.json.bak
node -e "
const pkg = require('./package.json');
// Replace workspace:* with file reference to packed core
pkg.dependencies['@dotdo/esm'] = 'file:./core/$CORE_TGZ';
pkg.optionalDependencies = pkg.optionalDependencies || {};
pkg.optionalDependencies['@dotdo/cli'] = 'file:$CLI_DO_PATH/$CLI_TGZ';
// Remove pnpm overrides for pack
delete pkg.pnpm;
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
"

ESM_TGZ=$(npm pack 2>&1 | tail -1)
mv package.json.bak package.json
echo "  Created: $ESM_TGZ"

echo -e "${GREEN}✓ All tarballs created${NC}"
echo ""

# Step 3: Install in isolated directory
echo -e "${YELLOW}3. Installing in isolated environment...${NC}"
mkdir -p "$TEST_DIR/test-project"
cd "$TEST_DIR/test-project"
npm init -y > /dev/null 2>&1

# Install in order
echo "  Installing ai-evaluate..."
npm install "$AI_EVALUATE_PATH/$AI_EVAL_TGZ" 2>&1 | grep -v "^npm" | head -3 || true

echo "  Installing @dotdo/cli..."
npm install "$CLI_DO_PATH/$CLI_TGZ" 2>&1 | grep -v "^npm" | head -3 || true

echo "  Installing @dotdo/esm (core)..."
npm install "$ESM_CORE_PATH/$CORE_TGZ" 2>&1 | grep -v "^npm" | head -3 || true

echo "  Installing esm.do..."
npm install "$ESM_PATH/$ESM_TGZ" 2>&1 | grep -v "^npm" | head -3 || true

echo -e "${GREEN}✓ Installation complete${NC}"
echo ""

# Step 4: Run CLI tests
echo -e "${YELLOW}4. Testing CLI...${NC}"

run_test() {
  local desc="$1"
  local cmd="$2"
  echo -n "  $desc: "
  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    return 0
  else
    echo -e "${RED}✗${NC}"
    return 1
  fi
}

run_test "esm --help" "npx esm --help"
run_test "esm --version" "npx esm --version"
run_test "esm.do --help" "npx esm.do --help"
run_test "esm whoami" "npx esm whoami"

echo ""

# Step 5: Test expression mode
echo -e "${YELLOW}5. Testing expression mode (--local)...${NC}"
echo "  $ npx esm --local '1 + 2'"
OUTPUT=$(npx esm --local '1 + 2' 2>&1 || true)
echo "$OUTPUT" | sed 's/^/    /' | head -10

if echo "$OUTPUT" | grep -q "3"; then
  echo -e "  ${GREEN}✓ Expression mode works!${NC}"
else
  echo -e "  ${YELLOW}⚠ Expression mode issue - check output above${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Full stack test complete!             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"

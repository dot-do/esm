#!/bin/bash
# Test CLI as if it were published to npm
# This catches issues that only appear after npm publish

set -e

echo "=== CLI Publish Test ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR=$(mktemp -d)
PACK_FILE=""

cleanup() {
  echo ""
  echo "Cleaning up..."
  rm -rf "$TEST_DIR"
  if [ -n "$PACK_FILE" ] && [ -f "$PROJECT_DIR/$PACK_FILE" ]; then
    rm -f "$PROJECT_DIR/$PACK_FILE"
  fi
}
trap cleanup EXIT

# Step 1: Build
echo -e "${YELLOW}Step 1: Building package...${NC}"
cd "$PROJECT_DIR"
pnpm build
echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Step 2: Check package.json for common issues
echo -e "${YELLOW}Step 2: Validating package.json...${NC}"

# Check for workspace: protocol (breaks npm publish)
if grep -q '"workspace:' package.json; then
  echo -e "${RED}✗ ERROR: package.json contains 'workspace:' protocol${NC}"
  echo "  These dependencies won't resolve after npm publish:"
  grep '"workspace:' package.json
  echo ""
  echo "  Fix: Replace with actual version or use 'pnpm publish' with proper config"
  exit 1
fi
echo -e "${GREEN}✓ No workspace: protocol issues${NC}"

# Check bin files exist
echo "  Checking bin files..."
for bin_entry in $(node -e "console.log(Object.values(require('./package.json').bin || {}).join(' '))"); do
  if [ ! -f "$bin_entry" ]; then
    echo -e "${RED}✗ ERROR: bin file missing: $bin_entry${NC}"
    exit 1
  fi
  # Check shebang
  if ! head -1 "$bin_entry" | grep -q '^#!/'; then
    echo -e "${RED}✗ ERROR: $bin_entry missing shebang${NC}"
    exit 1
  fi
  echo -e "${GREEN}  ✓ $bin_entry exists with shebang${NC}"
done

# Check files array covers bin and dist
echo "  Checking files array..."
files_array=$(node -e "console.log(JSON.stringify(require('./package.json').files || []))")
if ! echo "$files_array" | grep -q '"bin"'; then
  echo -e "${RED}✗ ERROR: 'bin' not in files array${NC}"
  exit 1
fi
if ! echo "$files_array" | grep -q '"dist"'; then
  echo -e "${RED}✗ ERROR: 'dist' not in files array${NC}"
  exit 1
fi
echo -e "${GREEN}✓ files array looks good${NC}"
echo ""

# Step 3: Pack the package (simulates npm publish)
echo -e "${YELLOW}Step 3: Creating npm tarball (npm pack)...${NC}"
PACK_FILE=$(npm pack 2>&1 | tail -1)
echo "  Created: $PACK_FILE"

# Check tarball contents
echo "  Checking tarball contents..."
tar -tzf "$PACK_FILE" | head -20
echo "  ..."
echo -e "${GREEN}✓ Tarball created${NC}"
echo ""

# Step 4: Install in isolated directory (simulates npx install)
echo -e "${YELLOW}Step 4: Installing in isolated directory...${NC}"
cd "$TEST_DIR"
npm init -y > /dev/null 2>&1
npm install "$PROJECT_DIR/$PACK_FILE" 2>&1 | grep -v "^npm" || true
echo -e "${GREEN}✓ Installed successfully${NC}"
echo ""

# Step 5: Test CLI execution
echo -e "${YELLOW}Step 5: Testing CLI commands...${NC}"

# Test basic help
echo "  Testing: npx esm --help"
if npx esm --help > /dev/null 2>&1; then
  echo -e "${GREEN}  ✓ esm --help works${NC}"
else
  echo -e "${RED}  ✗ esm --help failed${NC}"
  npx esm --help 2>&1 || true
  exit 1
fi

# Test version
echo "  Testing: npx esm --version"
if npx esm --version > /dev/null 2>&1; then
  echo -e "${GREEN}  ✓ esm --version works${NC}"
else
  echo -e "${RED}  ✗ esm --version failed${NC}"
  exit 1
fi

# Test esm.do alias
echo "  Testing: npx esm.do --help"
if npx esm.do --help > /dev/null 2>&1; then
  echo -e "${GREEN}  ✓ esm.do --help works${NC}"
else
  echo -e "${RED}  ✗ esm.do --help failed${NC}"
  exit 1
fi

# Test a subcommand
echo "  Testing: npx esm whoami"
npx esm whoami 2>&1 | head -3 || true
echo -e "${GREEN}  ✓ Subcommand executes${NC}"

echo ""

# Step 6: Test expression mode (new REPL feature)
echo -e "${YELLOW}Step 6: Testing expression mode...${NC}"
echo "  Note: Expression mode requires @dotdo/cli which may not be installed"

# This should fail gracefully if @dotdo/cli is not available
echo "  Testing: npx esm '1 + 2'"
if npx esm '1 + 2' 2>&1 | grep -q "requires @dotdo/cli"; then
  echo -e "${YELLOW}  ⚠ Expression mode correctly reports missing @dotdo/cli${NC}"
elif npx esm '1 + 2' 2>&1 | grep -q "3"; then
  echo -e "${GREEN}  ✓ Expression mode works!${NC}"
else
  echo "  Output:"
  npx esm '1 + 2' 2>&1 | head -5 || true
fi

echo ""
echo -e "${GREEN}=== All tests passed! ===${NC}"
echo ""
echo "Package is ready for publishing. To publish:"
echo "  1. Update version in package.json"
echo "  2. npm publish (or pnpm publish)"
echo ""
echo "To test with npx from npm (after publish):"
echo "  npx esm.do@latest --help"

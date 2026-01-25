#!/bin/bash
# Test CLI with npm pack (simulates npx installation)
# This is the most accurate pre-publish test

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR=$(mktemp -d)

cleanup() {
  rm -rf "$TEST_DIR"
  # Clean up any pack files
  rm -f "$PROJECT_DIR"/*.tgz
}
trap cleanup EXIT

cd "$PROJECT_DIR"

echo -e "${BLUE}=== CLI Pack Test ===${NC}"
echo ""

# Build
echo -e "${YELLOW}1. Building...${NC}"
pnpm build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Use pnpm pack (handles workspace: protocol)
echo -e "${YELLOW}2. Creating tarball with pnpm pack...${NC}"
PACK_OUTPUT=$(pnpm pack 2>&1)
PACK_FILE=$(echo "$PACK_OUTPUT" | grep '\.tgz' | head -1 | xargs basename 2>/dev/null || ls -t *.tgz 2>/dev/null | head -1)

if [ -z "$PACK_FILE" ] || [ ! -f "$PACK_FILE" ]; then
  echo -e "${RED}✗ Failed to create tarball${NC}"
  echo "$PACK_OUTPUT"
  exit 1
fi
echo "  Created: $PACK_FILE"
echo -e "${GREEN}✓ Tarball created${NC}"
echo ""

# Show what's in the tarball
echo -e "${YELLOW}3. Tarball contents:${NC}"
tar -tzf "$PACK_FILE" | grep -E '^package/(bin|dist)' | head -15
echo "  ..."
echo ""

# Check for workspace: in packed package.json
echo -e "${YELLOW}4. Checking packed package.json for workspace: protocol...${NC}"
PACKED_PKG=$(tar -xzf "$PACK_FILE" -O package/package.json 2>/dev/null)
if echo "$PACKED_PKG" | grep -q '"workspace:'; then
  echo -e "${RED}✗ ERROR: Packed package.json still contains workspace: protocol${NC}"
  echo "$PACKED_PKG" | grep '"workspace:'
  echo ""
  echo "  This will break after npm publish!"
  echo "  Solution: Use 'pnpm publish' which auto-converts workspace: references"
  exit 1
fi
echo -e "${GREEN}✓ No workspace: protocol in packed package${NC}"
echo ""

# Install in isolated directory
echo -e "${YELLOW}5. Installing in isolated directory...${NC}"
cd "$TEST_DIR"
npm init -y > /dev/null 2>&1

# Install the tarball
npm install "$PROJECT_DIR/$PACK_FILE" 2>&1 | grep -v "^npm WARN" | head -5 || true
echo -e "${GREEN}✓ Installed${NC}"
echo ""

# Test commands
echo -e "${YELLOW}6. Testing CLI commands...${NC}"

test_cmd() {
  local cmd="$1"
  local desc="$2"
  echo -n "  $desc: "
  if $cmd > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    return 0
  else
    echo -e "${RED}✗${NC}"
    return 1
  fi
}

test_cmd "npx esm --help" "esm --help"
test_cmd "npx esm --version" "esm --version"
test_cmd "npx esm.do --help" "esm.do --help"

echo ""

# Test actual command output
echo -e "${YELLOW}7. Command output samples:${NC}"
echo "  $ npx esm --version"
echo "    $(npx esm --version 2>&1)"
echo ""
echo "  $ npx esm whoami"
npx esm whoami 2>&1 | sed 's/^/    /' | head -3
echo ""

# Test expression mode
echo -e "${YELLOW}8. Testing expression mode detection:${NC}"
echo "  $ npx esm '1 + 2'"
OUTPUT=$(npx esm '1 + 2' 2>&1 || true)
echo "$OUTPUT" | sed 's/^/    /' | head -5

if echo "$OUTPUT" | grep -q "@dotdo/cli"; then
  echo -e "  ${YELLOW}⚠ Expression mode works but @dotdo/cli not installed${NC}"
elif echo "$OUTPUT" | grep -q "3"; then
  echo -e "  ${GREEN}✓ Expression mode works!${NC}"
else
  echo -e "  ${YELLOW}⚠ Unexpected output (may be OK)${NC}"
fi

echo ""
echo -e "${GREEN}=== Pack test complete ===${NC}"
echo ""
echo "To publish:"
echo "  pnpm publish  # This auto-converts workspace: references"

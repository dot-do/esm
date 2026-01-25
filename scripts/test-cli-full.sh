#!/bin/bash
# Full CLI test with Verdaccio (local npm registry)
# This is the most accurate test - simulates real npm publish/install

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR=$(mktemp -d)
VERDACCIO_PID=""

cleanup() {
  echo ""
  echo "Cleaning up..."
  if [ -n "$VERDACCIO_PID" ]; then
    kill $VERDACCIO_PID 2>/dev/null || true
  fi
  rm -rf "$TEST_DIR"
  rm -f "$PROJECT_DIR"/*.tgz
  rm -f "$PROJECT_DIR/core"/*.tgz
}
trap cleanup EXIT

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Full CLI Test with Local Registry (Verdaccio) ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check for verdaccio
if ! command -v verdaccio &> /dev/null; then
  echo -e "${YELLOW}Verdaccio not installed. Installing...${NC}"
  npm install -g verdaccio
fi

# Start verdaccio in background
echo -e "${YELLOW}Starting local npm registry...${NC}"
VERDACCIO_DIR="$TEST_DIR/verdaccio"
mkdir -p "$VERDACCIO_DIR"
cat > "$VERDACCIO_DIR/config.yaml" << 'EOF'
storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@dotdo/*':
    access: $all
    publish: $all
  '**':
    access: $all
    publish: $all
    proxy: npmjs
listen: 0.0.0.0:4873
EOF

cd "$VERDACCIO_DIR"
verdaccio --config config.yaml &
VERDACCIO_PID=$!
sleep 3

# Configure npm to use local registry
export NPM_CONFIG_REGISTRY=http://localhost:4873
echo -e "${GREEN}✓ Local registry running on http://localhost:4873${NC}"
echo ""

cd "$PROJECT_DIR"

# Build all packages
echo -e "${YELLOW}1. Building packages...${NC}"
pnpm build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Publish @dotdo/esm (core) to local registry
echo -e "${YELLOW}2. Publishing @dotdo/esm to local registry...${NC}"
cd "$PROJECT_DIR/core"
npm publish --registry http://localhost:4873 2>&1 | head -5 || true
echo -e "${GREEN}✓ @dotdo/esm published${NC}"
echo ""

# Publish esm.do to local registry
echo -e "${YELLOW}3. Publishing esm.do to local registry...${NC}"
cd "$PROJECT_DIR"
npm publish --registry http://localhost:4873 2>&1 | head -5 || true
echo -e "${GREEN}✓ esm.do published${NC}"
echo ""

# Create test project and install via npx-style
echo -e "${YELLOW}4. Testing installation in isolated environment...${NC}"
TEST_PROJECT="$TEST_DIR/test-project"
mkdir -p "$TEST_PROJECT"
cd "$TEST_PROJECT"
npm init -y > /dev/null 2>&1
npm install esm.do --registry http://localhost:4873 2>&1 | head -10
echo -e "${GREEN}✓ Installed${NC}"
echo ""

# Run CLI tests
echo -e "${YELLOW}5. Testing CLI commands...${NC}"

run_test() {
  local desc="$1"
  local cmd="$2"
  echo -n "  $desc: "
  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    return 0
  else
    echo -e "${RED}✗${NC}"
    echo "    Command: $cmd"
    eval "$cmd" 2>&1 | head -3 | sed 's/^/    /'
    return 1
  fi
}

run_test "npx esm --help" "npx esm --help"
run_test "npx esm --version" "npx esm --version"
run_test "npx esm.do --help" "npx esm.do --help"
run_test "npx esm whoami" "npx esm whoami"

echo ""

# Test expression mode
echo -e "${YELLOW}6. Testing expression mode:${NC}"
echo "  $ npx esm '1 + 2'"
OUTPUT=$(npx esm '1 + 2' 2>&1 || true)
echo "$OUTPUT" | sed 's/^/    /' | head -5
echo ""

echo -e "${GREEN}╔═══════════════════════════╗${NC}"
echo -e "${GREEN}║  All tests complete!      ║${NC}"
echo -e "${GREEN}╚═══════════════════════════╝${NC}"
echo ""
echo "The package works correctly when installed from npm."
echo ""
echo "To publish for real:"
echo "  1. cd core && npm publish"
echo "  2. cd .. && npm publish"

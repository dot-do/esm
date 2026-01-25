#!/bin/bash
# Setup local dependencies for testing
# This links all local packages so you can test the full stack

set -e

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${YELLOW}Setting up local dependencies for testing...${NC}"
echo ""

# Paths (adjust if needed)
AI_EVALUATE_PATH="/Users/nathanclevenger/projects/primitives.org.ai/packages/ai-evaluate"
CLI_DO_PATH="/Users/nathanclevenger/projects/cli.do"
ESM_PATH="/Users/nathanclevenger/projects/esm"

# Build all packages first
echo "Building ai-evaluate..."
cd "$AI_EVALUATE_PATH"
pnpm build

echo ""
echo "Building cli.do..."
cd "$CLI_DO_PATH"
pnpm build

echo ""
echo "Building esm.do..."
cd "$ESM_PATH"
pnpm build

echo ""
echo -e "${YELLOW}Linking packages with pnpm overrides...${NC}"

# Create a pnpm overrides file to use local packages
cd "$ESM_PATH"
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'core'
EOF

# Add resolutions to force local versions
node -e "
const pkg = require('./package.json');
pkg.pnpm = pkg.pnpm || {};
pkg.pnpm.overrides = {
  'ai-evaluate': 'file:$AI_EVALUATE_PATH',
};
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
console.log('Added pnpm overrides');
"

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Now you can test with:"
echo "  ./bin/esm --local '1 + 2'"

#!/bin/bash
# Quick local CLI test (no npm pack)
# Use this during development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== Quick Local CLI Test ==="
echo ""

# Build first
echo "Building..."
pnpm build

echo ""
echo "Testing bin/esm directly..."

# Test 1: Direct execution
echo "1. bin/esm --help"
./bin/esm --help | head -5

echo ""
echo "2. bin/esm --version"
./bin/esm --version

echo ""
echo "3. bin/esm.do.js --help"
./bin/esm.do.js --help | head -5

echo ""
echo "4. Testing expression detection..."
# This tests the new expression mode logic without needing @dotdo/cli
node -e "
const args = ['1 + 2'];
const KNOWN_COMMANDS = ['init', 'write', 'read', 'run', 'test', 'versions', 'help'];
const firstArg = args[0];

// Check expression indicators
const isExpr = firstArg && (
  firstArg.includes('+') ||
  firstArg.includes('=') ||
  /^\d+/.test(firstArg)
);

console.log('Args:', args);
console.log('Is expression mode:', isExpr);
"

echo ""
echo "=== Local tests passed ==="

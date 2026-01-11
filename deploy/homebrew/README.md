# Homebrew Installation for esm.do CLI

This directory contains the Homebrew formula for installing esm.do CLI on macOS and Linux.

## Quick Install

### Via Homebrew Tap (Recommended)

```bash
# Add the tap
brew tap dot-do/esm https://github.com/dot-do/esm

# Install esm.do CLI
brew install esm-do

# Verify installation
esm --version
```

### Direct Install (Without Tap)

```bash
brew install dot-do/esm/esm-do
```

## Setting Up a Homebrew Tap

To create a Homebrew tap for esm.do:

### 1. Create the Tap Repository

Create a new GitHub repository named `homebrew-esm` under the `dot-do` organization.

```bash
# Clone the tap repository
git clone https://github.com/dot-do/homebrew-esm.git
cd homebrew-esm

# Create Formula directory
mkdir -p Formula

# Copy the formula
cp /path/to/esm/deploy/homebrew/esm-do.rb Formula/esm-do.rb
```

### 2. Update the SHA256 Hash

Before publishing, you need to calculate the correct SHA256 hash:

```bash
# For npm package
curl -sL https://registry.npmjs.org/esm.do/-/esm.do-0.0.1.tgz | shasum -a 256

# For GitHub release
curl -sL https://github.com/dot-do/esm/releases/download/v0.0.1/esm-do-0.0.1.tar.gz | shasum -a 256
```

Replace `PLACEHOLDER_SHA256` in the formula with the actual hash.

### 3. Test the Formula Locally

```bash
# Test with local formula
brew install --build-from-source ./Formula/esm-do.rb

# Run formula tests
brew test esm-do

# Audit the formula
brew audit --strict esm-do
```

### 4. Push and Publish

```bash
git add Formula/esm-do.rb
git commit -m "Add esm-do formula v0.0.1"
git push origin main
```

## Updating the Formula

When releasing a new version:

1. Update the version number in the formula URL
2. Calculate the new SHA256 hash
3. Update the formula file
4. Commit and push to the tap repository

```bash
# Bump version
brew bump-formula-pr esm-do --version=0.0.2
```

## Alternative Installation Methods

### Via npm (Universal)

```bash
npm install -g esm.do
```

### Via Universal Installer Script

```bash
curl -fsSL https://esm.do/install | bash
```

### Via Direct Download

Download binaries from [GitHub Releases](https://github.com/dot-do/esm/releases).

## Troubleshooting

### Formula Not Found

If you get "formula not found" errors:

```bash
# Update Homebrew
brew update

# Re-tap the repository
brew untap dot-do/esm
brew tap dot-do/esm https://github.com/dot-do/esm
```

### Permission Issues

```bash
# Fix permissions
sudo chown -R $(whoami) $(brew --prefix)/*
```

### Node.js Version Issues

esm.do requires Node.js 18 or later:

```bash
# Check Node.js version
node --version

# Install Node.js via Homebrew
brew install node@18
```

## Support

- Documentation: https://esm.do/docs
- Issues: https://github.com/dot-do/esm/issues
- Discord: https://discord.gg/dot-do

## License

MIT License - see [LICENSE](../../LICENSE)

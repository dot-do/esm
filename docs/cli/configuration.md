# CLI Configuration

Configure the esm.do CLI for your environment.

## Configuration File

The CLI stores configuration in `~/.esm/config.json`:

```json
{
  "api.endpoint": "https://api.esm.do",
  "auth.token": "your-api-token"
}
```

### Location

| Platform | Path |
|----------|------|
| macOS | `~/.esm/config.json` |
| Linux | `~/.esm/config.json` |
| Windows | `%USERPROFILE%\.esm\config.json` |

### Managing Configuration

Use the `esm config` command to manage settings:

```bash
# List all settings
esm config list

# Get a specific value
esm config get api.endpoint

# Set a value
esm config set api.endpoint https://api.esm.do
```

## Configuration Keys

| Key | Description | Default |
|-----|-------------|---------|
| `api.endpoint` | Base URL for the esm.do API | `https://api.esm.do` |
| `auth.token` | Authentication token | (none) |

## Environment Variables

Environment variables override configuration file settings:

| Variable | Description | Config Key |
|----------|-------------|------------|
| `ESM_API_ENDPOINT` | API base URL | `api.endpoint` |
| `ESM_TOKEN` | Authentication token | `auth.token` |
| `ESM_CONFIG_PATH` | Custom config file path | (n/a) |

### Examples

```bash
# Use a different API endpoint
ESM_API_ENDPOINT=https://staging.esm.do esm read @myorg/module

# Authenticate with environment variable
ESM_TOKEN=your-token esm write @myorg/module --file module.js

# Use custom config file
ESM_CONFIG_PATH=/path/to/config.json esm list
```

### CI/CD Usage

For CI/CD pipelines, use environment variables to avoid storing credentials in files:

```yaml
# GitHub Actions
env:
  ESM_TOKEN: ${{ secrets.ESM_TOKEN }}

steps:
  - run: npx esm.do test @myorg/module
```

```yaml
# GitLab CI
variables:
  ESM_TOKEN: $ESM_TOKEN

test:
  script:
    - npx esm.do test @myorg/module
```

## Authentication Setup

### Getting an API Token

1. Visit https://esm.do/settings/tokens
2. Click "Create Token"
3. Copy the generated token

### Storing the Token

#### Option 1: CLI Login (Recommended for development)

```bash
esm login --token your-token-here
```

This stores the token in `~/.esm/config.json`.

#### Option 2: Environment Variable (Recommended for CI/CD)

```bash
export ESM_TOKEN=your-token-here
```

Add to your shell profile (`~/.bashrc`, `~/.zshrc`) for persistence.

#### Option 3: Config File

Manually create `~/.esm/config.json`:

```json
{
  "auth.token": "your-token-here"
}
```

### Verifying Authentication

```bash
esm whoami
# Authenticated user (token set)
```

### Logging Out

```bash
esm logout
# Logged out successfully
```

## Endpoint Configuration

### Default Endpoint

By default, the CLI connects to `https://api.esm.do`.

### Custom Endpoints

For self-hosted or staging environments:

```bash
# Set via config
esm config set api.endpoint https://esm.mycompany.com

# Set via environment
export ESM_API_ENDPOINT=https://esm.mycompany.com
```

### Local Development

When running esm.do locally:

```bash
# Point to local server
esm config set api.endpoint http://localhost:8787

# Or use environment variable
ESM_API_ENDPOINT=http://localhost:8787 esm read @test/module
```

## Proxy Configuration

The CLI respects standard HTTP proxy environment variables:

```bash
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1
```

## Debug Mode

Enable debug output for troubleshooting:

```bash
DEBUG=esm:* esm read @myorg/module
```

This shows detailed information about API requests and internal operations.

## Configuration Precedence

Settings are resolved in this order (highest to lowest priority):

1. Command-line options (e.g., `--timeout`)
2. Environment variables (e.g., `ESM_TOKEN`)
3. Configuration file (`~/.esm/config.json`)
4. Default values

## Security Best Practices

### Token Security

- Never commit tokens to version control
- Use environment variables in CI/CD
- Rotate tokens periodically
- Use minimal-scope tokens for automation

### File Permissions

Ensure your config file has appropriate permissions:

```bash
chmod 600 ~/.esm/config.json
```

### Audit Token Usage

Review token activity at https://esm.do/settings/tokens to monitor usage and revoke compromised tokens.

## Troubleshooting

### "Not logged in" error

```bash
# Check if token is set
esm whoami

# Re-authenticate
esm login --token your-token
```

### API connection errors

```bash
# Verify endpoint
esm config get api.endpoint

# Test connectivity
curl https://api.esm.do/health
```

### Configuration not loading

```bash
# Check config file exists
cat ~/.esm/config.json

# Verify file permissions
ls -la ~/.esm/config.json

# Use custom path
ESM_CONFIG_PATH=/path/to/config.json esm whoami
```

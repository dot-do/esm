# esm.do Python SDK

A Python client library for interacting with the [esm.do](https://esm.do) module system - a living ESM module system for AI agents.

## Installation

```bash
pip install esm-do
```

Or with Poetry:

```bash
poetry add esm-do
```

## Quick Start

### Async Usage (Recommended)

```python
import asyncio
from esm_do import ESMClient

async def main():
    # Create client with optional authentication
    client = ESMClient(
        base_url="https://esm.do",
        token="your-api-token"  # Optional
    )

    # Read a module
    module = await client.read("@scope/name")
    print(f"Module: {module.name}, Version: {module.version}")

    # Run a module's script with arguments
    result = await client.run("@scope/name", args={"foo": "bar"})
    print(f"Result: {result.result}")
    print(f"Logs: {result.logs}")

    # Run module tests
    test_result = await client.test("@scope/name")
    print(f"Tests: {test_result.passed}/{test_result.total} passed")

    # Don't forget to close the client
    await client.close()

asyncio.run(main())
```

### Using Context Manager

```python
async with ESMClient(token="your-token") as client:
    module = await client.read("@scope/name")
    # Client automatically closes when exiting the context
```

### Synchronous Usage

For simpler scripts or when async isn't needed:

```python
from esm_do import ESMClient

client = ESMClient(base_url="https://esm.do", token="your-token")

# Use _sync suffix for synchronous methods
module = client.read_sync("@scope/name")
result = client.run_sync("@scope/name", args={"input": "value"})
test_result = client.test_sync("@scope/name")
```

## API Reference

### ESMClient

The main client class for interacting with esm.do.

#### Constructor

```python
ESMClient(
    base_url: str = "https://esm.do",
    token: Optional[str] = None,
    timeout: float = 30.0,
    max_retries: int = 3,
    retry_delay: float = 1.0,
)
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `base_url` | Base URL for the esm.do API | `https://esm.do` |
| `token` | Optional authentication token | `None` |
| `timeout` | Request timeout in seconds | `30.0` |
| `max_retries` | Maximum retry attempts for failed requests | `3` |
| `retry_delay` | Initial delay between retries (exponential backoff) | `1.0` |

### Methods

#### read(name, version=None)

Read a module from the registry.

```python
module = await client.read("@scope/name")
module = await client.read("@scope/name", version="abc123")
```

Returns: `ESMModule`

#### write(name, types, module, tests=None, script=None, force=False, tag=None, commit_message=None)

Write or create a module in the registry.

```python
result = await client.write(
    name="@scope/name",
    types="export function hello(name: string): string;",
    module="export function hello(name) { return `Hello, ${name}!`; }",
    tests="test('hello', () => { expect(hello('World')).toBe('Hello, World!'); });",
    script="console.log(hello('World'));",
    force=False,  # Set to True to save even if tests fail
)
```

Returns: `WriteResult`

#### run(name, args=None, timeout=None)

Run a module's script.

```python
result = await client.run("@scope/name", args={"foo": "bar"}, timeout=5000)
print(result.result)  # Script return value
print(result.logs)    # Console output
```

Returns: `RunResult`

#### test(name, timeout=None)

Run a module's tests.

```python
result = await client.test("@scope/name")
print(f"Passed: {result.passed}")
print(f"Failed: {result.failed}")
for test in result.results:
    print(f"  {test.name}: {test.status}")
```

Returns: `TestResult`

#### versions(name)

Get version history for a module.

```python
versions = await client.versions("@scope/name")
for v in versions:
    print(f"Version: {v.version}, Message: {v.message}")
```

Returns: `List[ModuleVersion]`

#### delete(name)

Delete a module from the registry.

```python
result = await client.delete("@scope/name")
print(f"Deleted: {result.deleted}")
```

Returns: `DeleteResult`

#### list_modules(pattern=None, limit=100, offset=0)

List available modules.

```python
modules = await client.list_modules(pattern="@scope/*", limit=50)
for name in modules:
    print(name)
```

Returns: `List[str]`

## Types

### ESMModule

```python
class ESMModule:
    name: str
    types: str
    module: str
    tests: str
    script: str
    version: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
```

### TestResult

```python
class TestResult:
    passed: int
    failed: int
    total: int
    duration: float
    results: List[TestCaseResult]

    @property
    def success(self) -> bool:  # True if all tests passed
```

### RunResult

```python
class RunResult:
    result: Any      # Return value from script
    logs: List[LogEntry]
    duration: float

    @property
    def output(self) -> Any:  # Alias for result
```

### WriteResult

```python
class WriteResult:
    name: str
    version: str
    created: bool
    updated: bool
    test_results: Optional[TestResult]
    warning: Optional[str]
```

## Exceptions

All exceptions inherit from `ESMError`:

| Exception | Status Code | Description |
|-----------|-------------|-------------|
| `ESMError` | - | Base exception class |
| `ModuleNotFoundError` | 404 | Module does not exist |
| `ValidationError` | 400 | Validation failed (e.g., tests failed) |
| `ExecutionError` | 500 | Script/test execution failed |
| `AuthenticationError` | 401 | Authentication failed |
| `RateLimitError` | 429 | Rate limit exceeded |
| `NetworkError` | - | Network connection error |
| `TimeoutError` | 408 | Request timed out |

Example error handling:

```python
from esm_do import ESMClient, ModuleNotFoundError, ValidationError

client = ESMClient(token="your-token")

try:
    module = await client.read("@scope/missing")
except ModuleNotFoundError as e:
    print(f"Module not found: {e.module_name}")
except ValidationError as e:
    print(f"Validation failed: {e.message}")
    print(f"Errors: {e.errors}")
```

## Configuration

### Environment Variables

You can also configure the client using environment variables:

```python
import os
from esm_do import ESMClient

# Set environment variables
os.environ["ESM_TOKEN"] = "your-api-token"
os.environ["ESM_BASE_URL"] = "https://esm.do"

# Create client (you'll need to read env vars yourself)
client = ESMClient(
    token=os.getenv("ESM_TOKEN"),
    base_url=os.getenv("ESM_BASE_URL", "https://esm.do"),
)
```

### Retry Configuration

The client automatically retries failed requests with exponential backoff:

```python
client = ESMClient(
    max_retries=5,      # Try up to 5 times
    retry_delay=2.0,    # Start with 2 second delay
)
# Delays: 2s, 4s, 8s, 16s between retries
```

## Development

### Running Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run tests with coverage
pytest --cov=esm_do

# Run type checking
mypy esm_do

# Run linting
ruff check esm_do
```

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

- [esm.do Documentation](https://esm.do/docs)
- [GitHub Repository](https://github.com/dot-do/esm)
- [API Reference](https://esm.do/docs/api)
